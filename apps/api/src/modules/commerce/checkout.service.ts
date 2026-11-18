import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService, type Tx } from '../../infra/prisma.service.js';
import { canonicalJson } from '../../common/json.js';
import { AppError, Errors } from '../../common/errors.js';
import type { Purchase, RuleSet } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { BLOCKED_COUNTRIES } from '../auth/restrictions.js';
import { AccountStateService } from '../trading/account-state.service.js';
import { TradingService } from '../trading/trading.service.js';
import type { CheckoutRequestDto, PurchaseDto } from './dto.js';
import {
  PAYMENT_PROVIDER,
  type PaymentEvent,
  type PaymentEventType,
  type PaymentProvider,
} from './payment-provider.js';
import { toProductRulesDto } from './products.service.js';
import { RewardsService, offerStatus } from '../rewards/rewards.service.js';
import { applyBps } from '@brand/engine';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const ROUTE = 'POST /checkout';

type PurchaseWithRefs = Purchase & {
  ruleSet: RuleSet;
  accounts: { id: string }[];
  offer?: { code: string } | null;
};

/** "$25K" style size label used in account names (data, not UI copy). */
export function sizeLabel(sizeMinor: bigint): string {
  const usd = sizeMinor / 100n;
  return usd % 1000n === 0n ? `$${usd / 1000n}K` : `$${usd.toLocaleString('en-US')}`;
}

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly trading: TradingService,
    private readonly state: AccountStateService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly rewards: RewardsService,
  ) {}

  toDto(p: PurchaseWithRefs): PurchaseDto {
    return {
      id: p.id,
      status: p.status,
      type: p.type,
      quantity: p.quantity,
      accountSizeMinor: p.accountSizeMinor.toString(),
      unitPriceMinor: p.unitPriceMinor.toString(),
      totalMinor: p.totalMinor.toString(),
      discountMinor: p.discountMinor.toString(),
      offerCode: p.offer?.code ?? null,
      currency: 'EUR',
      provider: p.provider,
      isTestPayment: p.provider === 'fake',
      paymentUrl: p.status === 'PENDING' ? p.paymentUrl : null,
      failureCode: p.failureCode,
      accountIds: p.accounts.map((a) => a.id),
      rules: toProductRulesDto(p.ruleSet),
      createdAt: p.createdAt.toISOString(),
    };
  }

  private load(tx: Tx | PrismaService, id: string) {
    return tx.purchase.findUniqueOrThrow({
      where: { id },
      include: {
        ruleSet: true,
        accounts: { select: { id: true }, orderBy: { createdAt: 'asc' } },
        offer: { select: { code: true } },
      },
    });
  }

  /**
   * Start a checkout. Idempotent per (user, Idempotency-Key): the whole call runs under an
   * advisory lock on that pair, so concurrent retries return the same purchase.
   */
  async create(
    userId: string,
    dto: CheckoutRequestDto,
    idempotencyKey: string,
  ): Promise<PurchaseDto> {
    if (!!dto.productId === !!dto.quoteId)
      throw Errors.unprocessable(
        'CHECKOUT_ITEM_INVALID',
        'Send exactly one of productId or quoteId',
      );
    const requestHash = sha256(canonicalJson(dto));

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`checkout:${userId}:${idempotencyKey}`}))`;
        const idem = await tx.idempotencyKey.findUnique({
          where: { userId_key: { userId, key: idempotencyKey } },
        });
        if (idem) {
          if (idem.requestHash !== requestHash || idem.route !== ROUTE)
            throw Errors.conflict(
              'IDEMPOTENCY_KEY_REUSED',
              'Idempotency-Key was used for a different request',
            );
          const id = (idem.responseBody as { id: string }).id;
          return this.toDto(await this.load(tx, id));
        }

        const user = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          include: { firm: { select: { status: true } } },
        });
        if (user.status !== 'ACTIVE') throw Errors.forbidden('ACCOUNT_SUSPENDED');
        if (user.firm.status !== 'ACTIVE') throw Errors.forbidden('FIRM_SUSPENDED');
        if (!user.emailVerifiedAt) throw Errors.forbidden('EMAIL_NOT_VERIFIED');
        if (BLOCKED_COUNTRIES.has(user.country)) throw Errors.forbidden('COUNTRY_RESTRICTED');

        let item: {
          type: Purchase['type'];
          sizeMinor: bigint;
          priceMinor: bigint;
          ruleSetId: string;
        };
        if (dto.productId) {
          const p = await tx.product.findFirst({
            where: { id: dto.productId, firmId: user.firmId, isActive: true },
          });
          if (!p) throw Errors.notFound('Product');
          item = {
            type: p.type,
            sizeMinor: p.accountSizeMinor,
            priceMinor: p.priceMinor,
            ruleSetId: p.ruleSetId,
          };
        } else {
          const q = await tx.priceQuote.findUnique({ where: { id: dto.quoteId! } });
          if (!q) throw Errors.notFound('Quote');
          if (q.expiresAt.getTime() < Date.now())
            throw Errors.unprocessable('QUOTE_EXPIRED', 'The price quote has expired');
          item = {
            type: q.type,
            sizeMinor: q.accountSizeMinor,
            priceMinor: q.priceMinor,
            ruleSetId: q.ruleSetId,
          };
        }
        if (item.type !== 'INSTANT')
          throw Errors.unprocessable('PRODUCT_TYPE_UNAVAILABLE', 'Only instant funding is offered');

        const subtotal = item.priceMinor * BigInt(dto.quantity);
        let discount = 0n;
        if (dto.offerCode) {
          const offer = await tx.offer.findFirst({
            where: { code: dto.offerCode.trim().toUpperCase(), userId },
          });
          if (!offer) throw Errors.unprocessable('OFFER_INVALID', 'Unknown offer code');
          const st = offerStatus(offer);
          if (st !== 'AVAILABLE')
            throw Errors.unprocessable(
              st === 'USED' ? 'OFFER_USED' : 'OFFER_EXPIRED',
              'Offer code not usable',
            );
          discount = applyBps(subtotal, offer.discountBps);
        }

        const purchase = await tx.purchase.create({
          data: {
            userId,
            productId: dto.productId ?? null,
            quoteId: dto.quoteId ?? null,
            type: item.type,
            quantity: dto.quantity,
            accountSizeMinor: item.sizeMinor,
            unitPriceMinor: item.priceMinor,
            totalMinor: subtotal - discount,
            discountMinor: discount,
            currency: 'EUR',
            ruleSetId: item.ruleSetId,
            provider: this.provider.name,
            termsAcceptedAt: new Date(),
          },
        });
        if (dto.offerCode) await this.rewards.reserveOffer(tx, userId, dto.offerCode, purchase.id);
        let payment;
        try {
          payment = await this.provider.createPayment({
            purchaseId: purchase.id,
            amountMinor: purchase.totalMinor,
            currency: 'EUR',
            description: `Instant funding ${sizeLabel(item.sizeMinor)} × ${dto.quantity}`,
            locale: dto.locale ?? user.locale,
          });
        } catch (e) {
          this.logger.error(`Payment provider failed for purchase ${purchase.id}`, e as Error);
          throw new AppError('PAYMENT_PROVIDER_UNAVAILABLE', 502, 'Payment provider unavailable');
        }
        await tx.purchase.update({
          where: { id: purchase.id },
          data: { providerRef: payment.providerRef, paymentUrl: payment.paymentUrl },
        });
        await this.audit.append(tx, {
          actorType: 'USER',
          actorId: userId,
          action: 'purchase.created',
          entityType: 'Purchase',
          entityId: purchase.id,
          data: {
            productId: purchase.productId,
            quoteId: purchase.quoteId,
            quantity: purchase.quantity,
            totalMinor: purchase.totalMinor,
            discountMinor: purchase.discountMinor,
            currency: purchase.currency,
            ruleSetId: purchase.ruleSetId,
            provider: purchase.provider,
          },
        });
        await tx.idempotencyKey.create({
          data: {
            key: idempotencyKey,
            userId,
            route: ROUTE,
            requestHash,
            responseStatus: 201,
            responseBody: { id: purchase.id },
            expiresAt: new Date(Date.now() + 24 * 3_600_000),
          },
        });
        return this.toDto(await this.load(tx, purchase.id));
      },
      { timeout: 15_000 },
    );
  }

  async get(userId: string, id: string): Promise<PurchaseDto> {
    const p = await this.prisma.purchase.findFirst({ where: { id, userId }, select: { id: true } });
    if (!p) throw Errors.notFound('Purchase');
    return this.toDto(await this.load(this.prisma, id));
  }

  async list(userId: string): Promise<PurchaseDto[]> {
    const rows = await this.prisma.purchase.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        ruleSet: true,
        accounts: { select: { id: true }, orderBy: { createdAt: 'asc' } },
        offer: { select: { code: true } },
      },
    });
    return rows.map((p) => this.toDto(p));
  }

  /** Fake provider only: the test-payment page reports the outcome here. */
  async testPayment(
    userId: string,
    id: string,
    outcome: 'succeeded' | 'failed' | 'cancelled',
  ): Promise<PurchaseDto> {
    if (!this.provider.isTest) throw Errors.notFound('Route');
    const p = await this.prisma.purchase.findFirst({ where: { id, userId } });
    if (!p) throw Errors.notFound('Purchase');
    if (p.provider !== this.provider.name || !p.providerRef)
      throw Errors.unprocessable('PURCHASE_NOT_TEST', 'Not a test payment');
    await this.handleEvent({
      provider: p.provider,
      eventId: `test_${p.id}`,
      providerRef: p.providerRef,
      type: `payment.${outcome}` as PaymentEventType,
    });
    return this.get(userId, id);
  }

  /**
   * Apply a provider event exactly once (dedup on provider + eventId) and, on success,
   * create the accounts in the same transaction as the status change.
   */
  async handleEvent(ev: PaymentEvent): Promise<void> {
    const created = await this.prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findUnique({
        where: { provider_providerRef: { provider: ev.provider, providerRef: ev.providerRef } },
      });
      if (!purchase) throw Errors.notFound('Purchase');
      await tx.$queryRaw`SELECT id FROM "Purchase" WHERE id = ${purchase.id}::uuid FOR UPDATE`;
      const dup = await tx.paymentEvent.findUnique({
        where: { provider_eventId: { provider: ev.provider, eventId: ev.eventId } },
      });
      if (dup) return [];
      await tx.paymentEvent.create({
        data: {
          provider: ev.provider,
          eventId: ev.eventId,
          type: ev.type,
          purchaseId: purchase.id,
        },
      });
      const current = await tx.purchase.findUniqueOrThrow({ where: { id: purchase.id } });
      if (current.status !== 'PENDING') {
        this.logger.warn(
          `Ignoring ${ev.type} for purchase ${current.id} in status ${current.status}`,
        );
        return [];
      }
      const sys = {
        actorType: 'SYSTEM' as const,
        actorId: null,
        entityType: 'Purchase',
        entityId: current.id,
      };

      if (ev.type !== 'payment.succeeded') {
        const status = ev.type === 'payment.failed' ? 'FAILED' : 'CANCELLED';
        await this.rewards.releaseOffer(tx, current.id);
        await tx.purchase.update({
          where: { id: current.id },
          data: {
            status,
            failureCode: ev.type === 'payment.failed' ? 'PAYMENT_FAILED' : 'PAYMENT_CANCELLED',
          },
        });
        await this.audit.append(tx, {
          ...sys,
          action: `purchase.${status.toLowerCase()}`,
          data: { eventId: ev.eventId },
        });
        return [];
      }

      const now = new Date();
      await tx.purchase.update({
        where: { id: current.id },
        data: { status: 'PAID', paidAt: now },
      });
      await this.audit.append(tx, {
        ...sys,
        action: 'purchase.paid',
        data: { eventId: ev.eventId, totalMinor: current.totalMinor, currency: current.currency },
      });
      const ids: string[] = [];
      for (let i = 1; i <= current.quantity; i++) {
        const label = `Instant ${sizeLabel(current.accountSizeMinor)}${current.quantity > 1 ? ` #${i}` : ''}`;
        ids.push(
          await this.trading.openRuleAccountTx(tx, {
            userId: current.userId,
            ruleSetId: current.ruleSetId,
            kind: 'FUNDED',
            initialBalanceMinor: current.accountSizeMinor,
            label,
            actor: { type: 'SYSTEM', id: null },
            purchaseId: current.id,
          }),
        );
      }
      await tx.purchase.update({
        where: { id: current.id },
        data: { status: 'FULFILLED', fulfilledAt: now },
      });
      await this.audit.append(tx, {
        ...sys,
        action: 'purchase.fulfilled',
        data: { accountIds: ids },
      });
      return ids;
    });
    for (const id of created) await this.state.reload(id);
  }
}
