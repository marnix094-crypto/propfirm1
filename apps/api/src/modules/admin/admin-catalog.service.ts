import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service.js';
import { Errors } from '../../common/errors.js';
import { Prisma, type Product, type RuleSet } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import type { AdminContext } from './admin.guard.js';
import type {
  AdminProductDto,
  AdminRuleSetDto,
  CreateProductDto,
  CreateRuleSetDto,
  UpdateProductDto,
} from './dto.js';

const toRuleSetDto = (r: RuleSet, accounts: number): AdminRuleSetDto => ({
  id: r.id,
  code: r.code,
  version: r.version,
  name: r.name,
  isTemplate: r.firmId === null,
  isExample: r.isExample,
  maxDailyLossBps: r.maxDailyLossBps,
  maxDrawdownBps: r.maxDrawdownBps,
  drawdownType: r.drawdownType,
  profitTargetBps: r.profitTargetBps,
  minTradingDays: r.minTradingDays,
  maxLeverage: r.maxLeverage,
  profitSplitBps: r.profitSplitBps,
  payoutIntervalDays: r.payoutIntervalDays,
  minTradingDaysPerPayout: r.minTradingDaysPerPayout,
  minPayoutMinor: r.minPayoutMinor?.toString() ?? null,
  accounts,
  createdAt: r.createdAt.toISOString(),
});

const MAX_ACCOUNT_SIZE = 1_000_000_000n; // $10M in minor units
const MAX_PRICE = 10_000_000n; // €100k in minor units

/**
 * Products and rule sets per firm (D87). Rule sets are immutable: a change is always a new
 * version; accounts keep the version they were opened with. Products may change price or
 * visibility — a purchase snapshots size, price and rule set, so earlier buyers are unaffected.
 */
@Injectable()
export class AdminCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- rule sets
  /** Rule sets a firm may use: platform templates plus its own versions. */
  private usable(firmId: string): Prisma.RuleSetWhereInput {
    return { OR: [{ firmId: null }, { firmId }] };
  }

  async ruleSets(ctx: AdminContext): Promise<AdminRuleSetDto[]> {
    const rows = await this.prisma.ruleSet.findMany({
      where: this.usable(ctx.firmId),
      orderBy: [{ firmId: { sort: 'desc', nulls: 'last' } }, { code: 'asc' }, { version: 'desc' }],
      include: {
        _count: { select: { accounts: { where: { user: { firmId: ctx.firmId } } } } },
      },
    });
    return rows.map((r) => toRuleSetDto(r, r._count.accounts));
  }

  async createRuleSet(ctx: AdminContext, dto: CreateRuleSetDto): Promise<AdminRuleSetDto> {
    const base = await this.prisma.ruleSet.findFirst({
      where: { id: dto.basedOnId, ...this.usable(ctx.firmId) },
    });
    if (!base) throw Errors.notFound('RuleSet');
    // A firm's own line of versions keeps the base code; versions count up per firm and code.
    const code = base.code;
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ruleset:${ctx.firmId}:${code}`}))`;
      const last = await tx.ruleSet.findFirst({
        where: { firmId: ctx.firmId, code },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const funded = base.profitSplitBps !== null || dto.profitSplitBps !== undefined;
      const r = await tx.ruleSet.create({
        data: {
          firmId: ctx.firmId,
          code,
          version: (last?.version ?? 0) + 1,
          name: dto.name,
          maxDailyLossBps: dto.maxDailyLossBps ?? base.maxDailyLossBps,
          dailyLossBasis: base.dailyLossBasis,
          dailyLossReference: base.dailyLossReference,
          maxDrawdownBps: dto.maxDrawdownBps ?? base.maxDrawdownBps,
          drawdownType: dto.drawdownType ?? base.drawdownType,
          trailingBasis: base.trailingBasis,
          trailingLocksAtInitial: base.trailingLocksAtInitial,
          profitTargetBps: base.profitTargetBps,
          minTradingDays: dto.minTradingDays ?? base.minTradingDays,
          maxLeverage: dto.maxLeverage ?? base.maxLeverage,
          profitSplitBps: dto.profitSplitBps ?? base.profitSplitBps,
          warnRatioBps: base.warnRatioBps,
          isExample: false,
          payoutIntervalDays: funded
            ? (dto.payoutIntervalDays ?? base.payoutIntervalDays)
            : base.payoutIntervalDays,
          minTradingDaysPerPayout: dto.minTradingDaysPerPayout ?? base.minTradingDaysPerPayout,
          minPayoutMinor:
            dto.minPayoutMinor !== undefined ? BigInt(dto.minPayoutMinor) : base.minPayoutMinor,
          scalingProfitTargetBps: base.scalingProfitTargetBps,
          scalingMinPayouts: base.scalingMinPayouts,
          scalingStepBps: base.scalingStepBps,
          scalingMaxBalanceMinor: base.scalingMaxBalanceMinor,
        },
      });
      if (r.maxDailyLossBps >= r.maxDrawdownBps)
        throw Errors.unprocessable(
          'RULES_INCONSISTENT',
          'Daily loss limit must be smaller than the max drawdown',
        );
      await this.audit.append(tx, {
        actorType: 'ADMIN',
        actorId: ctx.userId,
        firmId: ctx.firmId,
        action: 'admin.ruleset_created',
        entityType: 'RuleSet',
        entityId: r.id,
        data: { code: r.code, version: r.version, basedOnId: base.id },
      });
      return r;
    });
    return toRuleSetDto(created, 0);
  }

  // ---------------------------------------------------------------- products
  private async toProductDtos(
    rows: (Product & { ruleSet: RuleSet })[],
  ): Promise<AdminProductDto[]> {
    const sold = await this.prisma.purchase.groupBy({
      by: ['productId'],
      where: {
        productId: { in: rows.map((p) => p.id) },
        status: { in: ['PAID', 'FULFILLED'] },
      },
      _sum: { quantity: true },
    });
    const soldBy = new Map(sold.map((s) => [s.productId, s._sum.quantity ?? 0]));
    return rows.map((p) => ({
      id: p.id,
      slug: p.slug,
      type: p.type,
      accountSizeMinor: p.accountSizeMinor.toString(),
      priceMinor: p.priceMinor.toString(),
      priceCurrency: p.priceCurrency,
      ruleSetId: p.ruleSetId,
      ruleSetName: p.ruleSet.name,
      ruleSetVersion: p.ruleSet.version,
      isActive: p.isActive,
      isRecommended: p.isRecommended,
      isExample: p.isExample || p.ruleSet.isExample,
      sortOrder: p.sortOrder,
      sold: soldBy.get(p.id) ?? 0,
    }));
  }

  async products(ctx: AdminContext): Promise<AdminProductDto[]> {
    const rows = await this.prisma.product.findMany({
      where: { firmId: ctx.firmId },
      include: { ruleSet: true },
      orderBy: [{ sortOrder: 'asc' }, { accountSizeMinor: 'asc' }],
    });
    return this.toProductDtos(rows);
  }

  private async assertRuleSet(ctx: AdminContext, id: string): Promise<RuleSet> {
    const r = await this.prisma.ruleSet.findFirst({ where: { id, ...this.usable(ctx.firmId) } });
    if (!r) throw Errors.notFound('RuleSet');
    if (r.profitSplitBps === null)
      throw Errors.unprocessable(
        'RULESET_NOT_FUNDED',
        'Products need a rule set with a profit split (instant funding)',
      );
    return r;
  }

  private checkAmounts(sizeMinor?: bigint, priceMinor?: bigint) {
    if (sizeMinor !== undefined && (sizeMinor < 100_000n || sizeMinor > MAX_ACCOUNT_SIZE))
      throw Errors.unprocessable('ACCOUNT_SIZE_INVALID', 'Account size is out of range');
    if (priceMinor !== undefined && (priceMinor < 100n || priceMinor > MAX_PRICE))
      throw Errors.unprocessable('PRICE_INVALID', 'Price is out of range');
  }

  async createProduct(ctx: AdminContext, dto: CreateProductDto): Promise<AdminProductDto> {
    const size = BigInt(dto.accountSizeMinor);
    const price = BigInt(dto.priceMinor);
    this.checkAmounts(size, price);
    await this.assertRuleSet(ctx, dto.ruleSetId);
    try {
      const p = await this.prisma.$transaction(async (tx) => {
        const created = await tx.product.create({
          data: {
            firmId: ctx.firmId,
            slug: dto.slug,
            type: 'INSTANT',
            accountSizeMinor: size,
            priceMinor: price,
            ruleSetId: dto.ruleSetId,
            isRecommended: dto.isRecommended ?? false,
            sortOrder: dto.sortOrder ?? 0,
          },
          include: { ruleSet: true },
        });
        await this.audit.append(tx, {
          actorType: 'ADMIN',
          actorId: ctx.userId,
          firmId: ctx.firmId,
          action: 'admin.product_created',
          entityType: 'Product',
          entityId: created.id,
          data: {
            slug: created.slug,
            accountSizeMinor: size,
            priceMinor: price,
            ruleSetId: dto.ruleSetId,
          },
        });
        return created;
      });
      return (await this.toProductDtos([p]))[0]!;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw Errors.conflict('SLUG_TAKEN', 'A product with this slug already exists');
      throw e;
    }
  }

  async updateProduct(
    ctx: AdminContext,
    id: string,
    dto: UpdateProductDto,
  ): Promise<AdminProductDto> {
    const existing = await this.prisma.product.findFirst({ where: { id, firmId: ctx.firmId } });
    if (!existing) throw Errors.notFound('Product');
    const price = dto.priceMinor !== undefined ? BigInt(dto.priceMinor) : undefined;
    this.checkAmounts(undefined, price);
    if (dto.ruleSetId) await this.assertRuleSet(ctx, dto.ruleSetId);
    const p = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id },
        data: {
          ...(price !== undefined ? { priceMinor: price } : {}),
          ...(dto.ruleSetId ? { ruleSetId: dto.ruleSetId } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.isRecommended !== undefined ? { isRecommended: dto.isRecommended } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          // Edited by the firm: no longer the example catalogue.
          isExample: false,
        },
        include: { ruleSet: true },
      });
      await this.audit.append(tx, {
        actorType: 'ADMIN',
        actorId: ctx.userId,
        firmId: ctx.firmId,
        action: 'admin.product_updated',
        entityType: 'Product',
        entityId: id,
        data: {
          before: {
            priceMinor: existing.priceMinor,
            ruleSetId: existing.ruleSetId,
            isActive: existing.isActive,
          },
          after: {
            priceMinor: updated.priceMinor,
            ruleSetId: updated.ruleSetId,
            isActive: updated.isActive,
          },
        },
      });
      return updated;
    });
    return (await this.toProductDtos([p]))[0]!;
  }
}
