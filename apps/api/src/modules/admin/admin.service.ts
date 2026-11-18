import { Inject, Injectable } from '@nestjs/common';
import { isClientModule } from '@brand/shared';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { PrismaService } from '../../infra/prisma.service.js';
import { Errors } from '../../common/errors.js';
import type { Firm, Prisma, RuleSet, TradingAccount, User } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { TokensService } from '../auth/tokens.service.js';
import { TradingService } from '../trading/trading.service.js';
import { tradingDateKey } from '../trading/day.js';
import type { AdminContext } from './admin.guard.js';
import type {
  AccountQuery,
  AdminAccountDto,
  AdminAccountPageDto,
  AdminAlertPageDto,
  AdminAuditPageDto,
  AdminFirmDto,
  AdminMeDto,
  AdminOverviewDto,
  AdminTraderDetailDto,
  AdminTraderDto,
  AdminTraderPageDto,
  AlertQuery,
  AuditQuery,
  AuditVerifyDto,
  TraderQuery,
} from './dto.js';

const DAY_MS = 86_400_000;
/** Client (trader) accounts only — firm admins and Daily Funded staff are never listed. */
const CLIENTS = { firmRole: null, NOT: { roles: { has: 'ADMIN' as const } } };
const PAID = ['PAID', 'FULFILLED'] as const;

export const toAdminFirmDto = (f: Firm, defaultSlug: string): AdminFirmDto => ({
  id: f.id,
  slug: f.slug,
  name: f.name,
  status: f.status,
  domain: f.domain,
  primaryColor: f.primaryColor,
  logoDataUrl: f.logoDataUrl,
  supportEmail: f.supportEmail,
  isDefault: f.slug === defaultSlug,
  disabledModules: f.disabledModules.filter(isClientModule),
  createdAt: f.createdAt.toISOString(),
});

const toAccountDto = (
  a: TradingAccount & { user: Pick<User, 'email'>; ruleSet: Pick<RuleSet, 'name'> | null },
): AdminAccountDto => ({
  id: a.id,
  userId: a.userId,
  userEmail: a.user.email,
  label: a.label,
  kind: a.kind,
  status: a.status,
  currency: a.currency,
  initialBalanceMinor: a.initialBalanceMinor.toString(),
  balanceMinor: a.balanceMinor.toString(),
  pnlMinor: (a.balanceMinor - a.initialBalanceMinor).toString(),
  ruleSetName: a.ruleSet?.name ?? null,
  failReason: a.failReason,
  createdAt: a.createdAt.toISOString(),
  endedAt: a.endedAt?.toISOString() ?? null,
});

/** Next-page cursor: the last row's id when there was one more row than requested. */
function page<T extends { id: string }>(rows: T[], limit: number) {
  const more = rows.length > limit;
  const items = more ? rows.slice(0, limit) : rows;
  return { items, nextCursor: more ? items[items.length - 1]!.id : null };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidCursor = (c?: string) => {
  if (c === undefined) return undefined;
  if (!UUID_RE.test(c)) throw Errors.unprocessable('CURSOR_INVALID', 'Invalid cursor');
  return c;
};

/**
 * Firm admin panel: read models and trader/account actions (D84–D86). Every query is
 * scoped by `ctx.firmId`; every action is written to the audit log as an ADMIN event.
 */
@Injectable()
export class AdminService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tokens: TokensService,
    private readonly trading: TradingService,
  ) {}

  async me(ctx: AdminContext): Promise<AdminMeDto> {
    const firm = await this.prisma.firm.findUniqueOrThrow({ where: { id: ctx.firmId } });
    return {
      role: ctx.role,
      superadmin: ctx.superadmin,
      firm: toAdminFirmDto(firm, this.config.defaultFirmSlug),
      twoFactorEnabled: ctx.twoFactorEnabled,
      twoFactorRequired: this.config.adminRequire2fa,
    };
  }

  // ---------------------------------------------------------------- overview
  async overview(ctx: AdminContext): Promise<AdminOverviewDto> {
    const firmId = ctx.firmId;
    const since = new Date(Date.now() - 30 * DAY_MS);
    const ofFirm = { user: { firmId } };
    const [
      traders,
      newTraders30d,
      demoAccounts,
      fundedActive,
      fundedFailed30d,
      competitionAccounts,
      sales30,
      salesAll,
      openAlerts,
      criticalAlerts,
      recentSales,
    ] = await Promise.all([
      this.prisma.user.count({ where: { firmId, ...CLIENTS } }),
      this.prisma.user.count({ where: { firmId, ...CLIENTS, createdAt: { gte: since } } }),
      this.prisma.tradingAccount.count({ where: { ...ofFirm, kind: 'DEMO' } }),
      this.prisma.tradingAccount.count({
        where: { ...ofFirm, kind: 'FUNDED', status: 'FUNDED_ACTIVE' },
      }),
      this.prisma.tradingAccount.count({
        where: { ...ofFirm, kind: 'FUNDED', status: 'FAILED', endedAt: { gte: since } },
      }),
      this.prisma.tradingAccount.count({ where: { ...ofFirm, kind: 'COMPETITION' } }),
      this.prisma.purchase.aggregate({
        where: { ...ofFirm, status: { in: [...PAID] }, paidAt: { gte: since } },
        _sum: { totalMinor: true },
        _count: { _all: true },
      }),
      this.prisma.purchase.aggregate({
        where: { ...ofFirm, status: { in: [...PAID] } },
        _sum: { totalMinor: true },
      }),
      this.prisma.riskAlert.count({ where: { firmId, ackAt: null } }),
      this.prisma.riskAlert.count({ where: { firmId, ackAt: null, severity: 'CRITICAL' } }),
      this.prisma.purchase.findMany({
        where: { ...ofFirm, status: { in: [...PAID] }, paidAt: { gte: since } },
        select: { paidAt: true, totalMinor: true },
      }),
    ]);
    // One row per Amsterdam day for the last 30 days, oldest first (zero days included).
    const byDay = new Map<string, { sales: bigint; orders: number }>();
    for (let i = 29; i >= 0; i--)
      byDay.set(tradingDateKey(new Date(Date.now() - i * DAY_MS)), { sales: 0n, orders: 0 });
    for (const p of recentSales) {
      const d = byDay.get(tradingDateKey(p.paidAt!));
      if (d) {
        d.sales += p.totalMinor;
        d.orders += 1;
      }
    }
    return {
      traders,
      newTraders30d,
      demoAccounts,
      fundedActive,
      fundedFailed30d,
      competitionAccounts,
      sales30dMinor: (sales30._sum.totalMinor ?? 0n).toString(),
      orders30d: sales30._count._all,
      salesAllTimeMinor: (salesAll._sum.totalMinor ?? 0n).toString(),
      openAlerts,
      criticalAlerts,
      salesByDay: [...byDay].map(([date, v]) => ({
        date,
        salesMinor: v.sales.toString(),
        orders: v.orders,
      })),
      currency: 'EUR',
    };
  }

  // ---------------------------------------------------------------- traders
  private async traderRows(where: Prisma.UserWhereInput, limit: number) {
    const rows = await this.prisma.user.findMany({
      where,
      orderBy: { id: 'desc' },
      take: limit + 1,
      include: { accounts: { select: { kind: true, status: true } } },
    });
    return rows.map((u): AdminTraderDto => ({
      id: u.id,
      email: u.email,
      country: u.country,
      status: u.status,
      emailVerified: u.emailVerifiedAt !== null,
      firmRole: u.firmRole,
      createdAt: u.createdAt.toISOString(),
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      accounts: {
        total: u.accounts.length,
        funded: u.accounts.filter((a) => a.kind === 'FUNDED').length,
        failed: u.accounts.filter((a) => a.status === 'FAILED').length,
      },
    }));
  }

  async traders(ctx: AdminContext, q: TraderQuery): Promise<AdminTraderPageDto> {
    const limit = q.limit ?? 50;
    const cursor = uuidCursor(q.cursor);
    const rows = await this.traderRows(
      {
        firmId: ctx.firmId,
        ...CLIENTS,
        ...(q.q ? { email: { contains: q.q.trim(), mode: 'insensitive' } } : {}),
        ...(q.status ? { status: q.status } : {}),
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      limit,
    );
    return page(rows, limit);
  }

  private async userOfFirm(ctx: AdminContext, id: string) {
    const u = await this.prisma.user.findFirst({ where: { id, firmId: ctx.firmId, ...CLIENTS } });
    if (!u) throw Errors.notFound('Trader');
    return u;
  }

  async trader(ctx: AdminContext, id: string): Promise<AdminTraderDetailDto> {
    await this.userOfFirm(ctx, id);
    const [row] = await this.traderRows({ id, firmId: ctx.firmId }, 1);
    const [twoFactor, profile, accounts, purchases] = await Promise.all([
      this.prisma.twoFactor.findUnique({ where: { userId: id } }),
      this.prisma.traderProfile.findUnique({ where: { userId: id } }),
      this.prisma.tradingAccount.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { email: true } }, ruleSet: { select: { name: true } } },
      }),
      this.prisma.purchase.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);
    return {
      ...row!,
      twoFactorEnabled: !!twoFactor?.enabledAt,
      nickname: profile?.nickname ?? null,
      accountList: accounts.map(toAccountDto),
      purchases: purchases.map((p) => ({
        id: p.id,
        accountSizeMinor: p.accountSizeMinor.toString(),
        quantity: p.quantity,
        totalMinor: p.totalMinor.toString(),
        currency: p.currency,
        status: p.status,
        createdAt: p.createdAt.toISOString(),
      })),
    };
  }

  /** Suspend or reactivate a trader. Staff are managed under Team, never here. */
  async setTraderStatus(
    ctx: AdminContext,
    id: string,
    status: 'ACTIVE' | 'SUSPENDED',
    reason: string,
  ): Promise<AdminTraderDetailDto> {
    const u = await this.userOfFirm(ctx, id);
    if (u.id === ctx.userId || u.firmRole || u.roles.includes('ADMIN'))
      throw Errors.unprocessable('STAFF_PROTECTED', 'Manage staff under Team');
    if (u.status !== 'ACTIVE' && u.status !== 'SUSPENDED')
      throw Errors.unprocessable('USER_NOT_MANAGEABLE', 'This user is being deleted');
    if (u.status !== status) {
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id }, data: { status } });
        await this.audit.append(tx, {
          actorType: 'ADMIN',
          actorId: ctx.userId,
          firmId: ctx.firmId,
          action: status === 'SUSPENDED' ? 'admin.user_suspended' : 'admin.user_reactivated',
          entityType: 'User',
          entityId: id,
          data: { reason },
        });
      });
      // A suspended trader is signed out everywhere.
      if (status === 'SUSPENDED') await this.tokens.revokeAll(id);
    }
    return this.trader(ctx, id);
  }

  // ---------------------------------------------------------------- accounts
  async accounts(ctx: AdminContext, q: AccountQuery): Promise<AdminAccountPageDto> {
    const limit = q.limit ?? 50;
    const cursor = uuidCursor(q.cursor);
    const rows = await this.prisma.tradingAccount.findMany({
      where: {
        user: { firmId: ctx.firmId },
        ...(q.kind ? { kind: q.kind } : {}),
        ...(q.status ? { status: q.status } : {}),
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: limit + 1,
      include: { user: { select: { email: true } }, ruleSet: { select: { name: true } } },
    });
    return page(rows.map(toAccountDto), limit);
  }

  async failAccount(ctx: AdminContext, id: string, reason: string): Promise<AdminAccountDto> {
    const acc = await this.prisma.tradingAccount.findFirst({
      where: { id, user: { firmId: ctx.firmId } },
      select: { id: true },
    });
    if (!acc) throw Errors.notFound('Account');
    await this.trading.failByAdmin(id, ctx.userId, reason);
    const row = await this.prisma.tradingAccount.findUniqueOrThrow({
      where: { id },
      include: { user: { select: { email: true } }, ruleSet: { select: { name: true } } },
    });
    return toAccountDto(row);
  }

  // ---------------------------------------------------------------- alerts
  async alerts(ctx: AdminContext, q: AlertQuery): Promise<AdminAlertPageDto> {
    const limit = q.limit ?? 50;
    const cursor = uuidCursor(q.cursor);
    const rows = await this.prisma.riskAlert.findMany({
      where: {
        firmId: ctx.firmId,
        ...((q.state ?? 'open') === 'open' ? { ackAt: null } : {}),
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: limit + 1,
    });
    const accountIds = [...new Set(rows.map((r) => r.accountId))];
    const accounts = await this.prisma.tradingAccount.findMany({
      where: { id: { in: accountIds } },
      select: { id: true, label: true, user: { select: { email: true } } },
    });
    const byId = new Map(accounts.map((a) => [a.id, a]));
    return page(
      rows.map((r) => ({
        id: r.id,
        type: r.type,
        severity: r.severity,
        accountId: r.accountId,
        accountLabel: byId.get(r.accountId)?.label ?? '—',
        userId: r.userId,
        userEmail: byId.get(r.accountId)?.user.email ?? '—',
        details: r.details as Record<string, unknown>,
        createdAt: r.createdAt.toISOString(),
        ackAt: r.ackAt?.toISOString() ?? null,
      })),
      limit,
    );
  }

  async ackAlert(ctx: AdminContext, id: string): Promise<void> {
    const res = await this.prisma.$transaction(async (tx) => {
      const r = await tx.riskAlert.updateMany({
        where: { id, firmId: ctx.firmId, ackAt: null },
        data: { ackAt: new Date(), ackById: ctx.userId },
      });
      if (r.count > 0)
        await this.audit.append(tx, {
          actorType: 'ADMIN',
          actorId: ctx.userId,
          firmId: ctx.firmId,
          action: 'admin.alert_acknowledged',
          entityType: 'RiskAlert',
          entityId: id,
          data: {},
        });
      return r.count;
    });
    if (res === 0) {
      const exists = await this.prisma.riskAlert.count({ where: { id, firmId: ctx.firmId } });
      if (!exists) throw Errors.notFound('Alert');
    }
  }

  // ---------------------------------------------------------------- audit log
  async auditLog(ctx: AdminContext, q: AuditQuery): Promise<AdminAuditPageDto> {
    const limit = q.limit ?? 50;
    if (q.cursor !== undefined && !/^\d{1,19}$/.test(q.cursor))
      throw Errors.unprocessable('CURSOR_INVALID', 'Invalid cursor');
    const rows = await this.prisma.auditLog.findMany({
      where: {
        firmId: ctx.firmId,
        ...(q.action ? { action: { startsWith: q.action } } : {}),
        ...(q.cursor ? { id: { lt: BigInt(q.cursor) } } : {}),
      },
      orderBy: { id: 'desc' },
      take: limit + 1,
    });
    return page(
      rows.map((r) => ({
        id: r.id.toString(),
        ts: r.ts.toISOString(),
        actorType: r.actorType,
        actorId: r.actorId,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        data: r.data as Record<string, unknown>,
        hash: r.hash,
      })),
      limit,
    );
  }

  /** Recomputes the whole (platform-wide) hash chain. */
  verifyAudit(): Promise<AuditVerifyDto> {
    return this.audit.verify();
  }
}
