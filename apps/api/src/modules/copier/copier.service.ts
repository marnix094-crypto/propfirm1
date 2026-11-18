import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { Subscription } from 'rxjs';
import { applyBps, fromDecimalString, toDecimalString } from '@brand/engine';
import { PrismaService } from '../../infra/prisma.service.js';
import { AppError, Errors } from '../../common/errors.js';
import type { CopierLink } from '../../generated/prisma/client.js';
import { MarketDataService } from '../market-data/market-data.service.js';
import { TradingEvents } from '../trading/events.js';
import { TradingService } from '../trading/trading.service.js';
import type { OrderDto } from '../trading/dto.js';
import type {
  CopierLinkDto,
  CopierOverviewDto,
  CreateCopierLinkDto,
  UpdateCopierLinkDto,
} from './dto.js';

const toLinkDto = (l: CopierLink): CopierLinkDto => ({
  id: l.id,
  masterAccountId: l.masterAccountId,
  followerAccountId: l.followerAccountId,
  multiplierBps: l.multiplierBps,
  active: l.active,
  createdAt: l.createdAt.toISOString(),
});

/**
 * Trade copier between a trader's own accounts. Every filled order the trader places on the
 * master (incl. closes) is mirrored once to each active follower as a market order, scaled by
 * the multiplier and rounded down to the follower's quantity step. The follower's own rules
 * and margin checks apply; refusals are recorded, never retried silently.
 */
@Injectable()
export class CopierService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CopierService.name);
  private sub?: Subscription;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: TradingEvents,
    private readonly trading: TradingService,
    private readonly md: MarketDataService,
  ) {}

  onModuleInit() {
    this.sub = this.events.events$.subscribe((e) => {
      if (e.type !== 'order.update') return;
      const o = e.payload as OrderDto;
      if (o.status !== 'FILLED' || o.source !== 'USER') return;
      // Serialise copies so follower orders keep the master's order of events.
      this.queue = this.queue
        .then(() => this.copy(e.accountId, e.userId, o))
        .catch((err) => this.logger.error('Copy failed', err as Error));
    });
  }

  onModuleDestroy() {
    this.sub?.unsubscribe();
  }

  /** Resolves when every queued copy has been processed (tests). */
  idle(): Promise<void> {
    return this.queue;
  }

  private async copy(masterAccountId: string, userId: string, o: OrderDto) {
    const links = await this.prisma.copierLink.findMany({
      where: { masterAccountId, userId, active: true },
    });
    for (const link of links) {
      const exists = await this.prisma.copyEvent.findUnique({
        where: { linkId_masterOrderId: { linkId: link.id, masterOrderId: o.id } },
      });
      if (exists) continue;
      const side = o.side as 'BUY' | 'SELL';
      const inst = this.md.instrumentBySymbol(o.symbol);
      let qty = applyBps(fromDecimalString(o.filledQty, inst.qtyDecimals), link.multiplierBps);
      qty -= qty % inst.qtyStep;
      if (o.reduceOnly) {
        // Close at most what the follower holds on the opposite side.
        const pos = await this.prisma.position.findFirst({
          where: {
            accountId: link.followerAccountId,
            instrumentId: inst.id,
            status: 'OPEN',
            side: side === 'SELL' ? 'LONG' : 'SHORT',
          },
        });
        qty = pos ? (pos.qty < qty || qty === 0n ? pos.qty : qty) : 0n;
      }
      const base = {
        linkId: link.id,
        masterOrderId: o.id,
        symbol: o.symbol,
        side,
        qty: toDecimalString(qty, inst.qtyDecimals),
      };
      if (qty < inst.minQty) {
        await this.record({ ...base, status: 'SKIPPED', code: 'COPY_SIZE_TOO_SMALL' });
        continue;
      }
      try {
        const follower = await this.prisma.tradingAccount.findUniqueOrThrow({
          where: { id: link.followerAccountId },
          select: { maxLeverage: true },
        });
        const placed = await this.trading.placeOrder(
          userId,
          link.followerAccountId,
          {
            clientOrderId: `copy-${o.id.slice(-12)}-${link.id.slice(-8)}`,
            symbol: o.symbol,
            side,
            type: 'MARKET',
            qty: base.qty,
            leverage: Math.min(o.leverage, follower.maxLeverage),
            reduceOnly: o.reduceOnly,
          },
          `copy-${link.id}-${o.id}`,
        );
        await this.record({
          ...base,
          followerOrderId: placed.id,
          status: placed.status === 'REJECTED' ? 'FAILED' : 'COPIED',
          code: placed.rejectCode,
        });
      } catch (err) {
        await this.record({
          ...base,
          status: 'FAILED',
          code: err instanceof AppError ? err.code : 'COPY_ERROR',
        });
      }
    }
  }

  private async record(data: {
    linkId: string;
    masterOrderId: string;
    followerOrderId?: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    qty: string;
    status: string;
    code?: string | null;
  }) {
    await this.prisma.copyEvent
      .create({ data: { ...data, code: data.code ?? null } })
      .catch((e: { code?: string }) => {
        if (e.code !== 'P2002') throw e;
      });
  }

  // ------------------------------------------------------------- CRUD
  async overview(userId: string): Promise<CopierOverviewDto> {
    const links = await this.prisma.copierLink.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    const events = await this.prisma.copyEvent.findMany({
      where: { link: { userId } },
      orderBy: { id: 'desc' },
      take: 50,
    });
    return {
      links: links.map(toLinkDto),
      events: events.map((e) => ({
        id: e.id,
        linkId: e.linkId,
        symbol: e.symbol,
        side: e.side,
        qty: e.qty,
        status: e.status,
        code: e.code,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }

  async create(userId: string, dto: CreateCopierLinkDto): Promise<CopierLinkDto> {
    if (dto.masterAccountId === dto.followerAccountId)
      throw Errors.unprocessable('COPIER_SAME_ACCOUNT', 'Master and follower must differ');
    const accounts = await this.prisma.tradingAccount.findMany({
      where: { id: { in: [dto.masterAccountId, dto.followerAccountId] }, userId },
      select: { id: true },
    });
    if (accounts.length !== 2) throw Errors.notFound('Account');
    // No chains: a follower is never a master, and a master is never a follower.
    const conflict = await this.prisma.copierLink.findFirst({
      where: {
        OR: [
          { followerAccountId: dto.masterAccountId },
          { masterAccountId: dto.followerAccountId },
          { followerAccountId: dto.followerAccountId },
        ],
      },
    });
    if (conflict)
      throw Errors.conflict('COPIER_CONFLICT', 'Account is already part of a copier link');
    const l = await this.prisma.copierLink.create({ data: { userId, ...dto } });
    return toLinkDto(l);
  }

  async update(userId: string, id: string, dto: UpdateCopierLinkDto): Promise<CopierLinkDto> {
    const l = await this.prisma.copierLink.findFirst({ where: { id, userId } });
    if (!l) throw Errors.notFound('CopierLink');
    return toLinkDto(await this.prisma.copierLink.update({ where: { id }, data: dto }));
  }

  async remove(userId: string, id: string): Promise<void> {
    const l = await this.prisma.copierLink.findFirst({ where: { id, userId } });
    if (!l) throw Errors.notFound('CopierLink');
    await this.prisma.copierLink.delete({ where: { id } });
  }
}
