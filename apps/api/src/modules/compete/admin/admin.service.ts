import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { validateCompeteParams } from '@brand/engine';
import { APP_CONFIG, type AppConfig } from '../../../config/env.js';
import { AppError, Errors } from '../../../common/errors.js';
import { PrismaService } from '../../../infra/prisma.service.js';
import { Prisma, type CompeteRound, type CompeteStaff } from '../../../generated/prisma/client.js';
import { FIELD_CRYPTO, type FieldCrypto } from '../../security/field-crypto.js';
import { generateSecret, otpauthUri, verifyTotp } from '../../security/totp.js';
import { CompeteAuditService } from '../compete-audit.service.js';
import { CompeteService } from '../compete.service.js';
import { CompeteOperatorsService } from '../operators.service.js';
import { CompeteStaffTokens, sha256, type StaffCtx } from './staff-auth.js';
import type {
  CompeteAdminAuditPageDto,
  CompeteAdminOperatorDto,
  CompeteAdminOverviewDto,
  CompeteAdminPayoutDto,
  CompeteAdminPlayerPageDto,
  CompeteAdminRoundDetailDto,
  CompeteAdminRoundSummaryDto,
  CompeteAdminSettingsDto,
  CompeteStaffDto,
  UpdateCompeteSettingsDto,
} from './dto.js';

const ARGON = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };
const DUMMY_HASH = await hash('dummy-password-for-timing', ARGON);
const DAY = 86_400_000;
const PAGE = 50;
const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);

/**
 * Admin panel of the compete product (D104): one owner per operator, plus Daily Funded
 * superadmins. Every query is scoped to the operator from the staff row (owners) or the
 * explicitly chosen operator (superadmins). Every mutation is written to the compete audit log.
 */
@Injectable()
export class CompeteAdminService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(FIELD_CRYPTO) private readonly crypto: FieldCrypto,
    private readonly prisma: PrismaService,
    private readonly tokens: CompeteStaffTokens,
    private readonly audit: CompeteAuditService,
    private readonly compete: CompeteService,
    private readonly operators: CompeteOperatorsService,
  ) {}

  // ================================================================ auth

  async staffDto(s: CompeteStaff): Promise<CompeteStaffDto> {
    const op = s.operatorId ? await this.operators.byId(s.operatorId) : null;
    return {
      id: s.id,
      email: s.email,
      role: s.role,
      operatorId: s.operatorId,
      operatorName: op?.name ?? null,
      operatorSlug: op?.slug ?? null,
      twoFactorEnabled: !!s.totpEnabledAt,
      twoFactorRequired: this.config.adminRequire2fa && !s.totpEnabledAt,
    };
  }

  async login(email: string, password: string, code?: string) {
    const s = await this.prisma.competeStaff.findUnique({ where: { email } });
    const ok = await verify(s?.passwordHash ?? DUMMY_HASH, password);
    if (!s || !ok || !s.active) throw Errors.unauthorized('INVALID_CREDENTIALS');
    if (s.operatorId) {
      const op = await this.operators.byId(s.operatorId);
      if (op.status !== 'ACTIVE') throw Errors.forbidden('OPERATOR_SUSPENDED');
    }
    if (s.totpEnabledAt) {
      if (!code) throw Errors.unauthorized('MFA_REQUIRED');
      const step = verifyTotp(this.crypto.decrypt(s.totpSecretEnc!), code, s.totpLastStep);
      if (step === null) throw Errors.unauthorized('MFA_INVALID');
      await this.prisma.competeStaff.update({ where: { id: s.id }, data: { totpLastStep: step } });
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.competeStaff.update({
        where: { id: s.id },
        data: { lastLoginAt: new Date() },
      });
      await this.audit.append(tx, {
        actorType: 'ADMIN',
        actorId: s.id,
        operatorId: s.operatorId,
        action: 'compete.admin.login',
        entityType: 'CompeteStaff',
        entityId: s.id,
        data: { twoFactor: !!s.totpEnabledAt },
      });
      return u;
    });
    return { staff: updated, tokens: await this.tokens.issue(s.id) };
  }

  /** Sets the password from a one-time invite / reset link. */
  async setupPassword(token: string, password: string) {
    const s = await this.prisma.competeStaff.findUnique({
      where: { setupTokenHash: sha256(token) },
    });
    if (!s || !s.setupTokenExpires || s.setupTokenExpires < new Date())
      throw Errors.unprocessable('SETUP_TOKEN_INVALID', 'This link is invalid or has expired');
    await this.prisma.$transaction(async (tx) => {
      await tx.competeStaff.update({
        where: { id: s.id },
        data: {
          passwordHash: await hash(password, ARGON),
          setupTokenHash: null,
          setupTokenExpires: null,
        },
      });
      await this.audit.append(tx, {
        actorType: 'ADMIN',
        actorId: s.id,
        operatorId: s.operatorId,
        action: 'compete.admin.password_set',
        entityType: 'CompeteStaff',
        entityId: s.id,
        data: {},
      });
    });
    await this.tokens.revokeAll(s.id);
  }

  async twoFactorSetup(staff: StaffCtx) {
    if (staff.twoFactorEnabled) throw Errors.conflict('TWO_FACTOR_ALREADY_ENABLED');
    const secret = generateSecret();
    await this.prisma.competeStaff.update({
      where: { id: staff.id },
      data: { totpSecretEnc: this.crypto.encrypt(secret), totpLastStep: null },
    });
    return { secret, otpauthUri: otpauthUri('Compete admin', staff.email, secret) };
  }

  async twoFactorEnable(staff: StaffCtx, code: string) {
    const s = await this.prisma.competeStaff.findUniqueOrThrow({ where: { id: staff.id } });
    if (s.totpEnabledAt) throw Errors.conflict('TWO_FACTOR_ALREADY_ENABLED');
    if (!s.totpSecretEnc) throw Errors.unprocessable('TWO_FACTOR_NOT_SET_UP');
    const step = verifyTotp(this.crypto.decrypt(s.totpSecretEnc), code, s.totpLastStep);
    if (step === null) throw Errors.unprocessable('MFA_INVALID');
    await this.prisma.$transaction(async (tx) => {
      await tx.competeStaff.update({
        where: { id: s.id },
        data: { totpEnabledAt: new Date(), totpLastStep: step },
      });
      await this.audit.append(tx, {
        actorType: 'ADMIN',
        actorId: s.id,
        operatorId: s.operatorId,
        action: 'compete.admin.2fa_enabled',
        entityType: 'CompeteStaff',
        entityId: s.id,
        data: {},
      });
    });
  }

  /** Operator the request acts on: owners → their own; superadmins → the one they chose. */
  async scope(staff: StaffCtx, chosenSlug: string | undefined): Promise<string> {
    if (staff.role === 'OWNER') return staff.operatorId!;
    const slug = chosenSlug?.trim().toLowerCase();
    if (!slug) throw Errors.unprocessable('OPERATOR_REQUIRED', 'Choose an operator first');
    const op = await this.prisma.competeOperator.findUnique({ where: { slug } });
    if (!op) throw Errors.notFound('Operator');
    return op.id;
  }

  // ================================================================ overview / rounds

  private async summary(r: CompeteRound): Promise<CompeteAdminRoundSummaryDto> {
    const [participants, prizes] = await Promise.all([
      this.prisma.competeEntry.count({
        where: { roundId: r.id, paidAt: { not: null }, status: { not: 'REFUNDED' } },
      }),
      this.prisma.competeEntry.aggregate({ where: { roundId: r.id }, _sum: { prizeMinor: true } }),
    ]);
    return {
      id: r.id,
      status: r.status,
      startsAt: r.startsAt.toISOString(),
      participants: r.status === 'CANCELLED' ? 0 : participants,
      potMinor: (r.potMinor ?? r.entryFeeMinor * BigInt(participants)).toString(),
      prizesMinor: (prizes._sum.prizeMinor ?? 0n).toString(),
      operatorShareMinor: (r.operatorShareMinor ?? 0n).toString(),
    };
  }

  async overview(operatorId: string): Promise<CompeteAdminOverviewDto> {
    const since = new Date(Date.now() - 30 * DAY);
    const op = await this.operators.byId(operatorId);
    const [current, players, settled, cancelled, entries, payments, revenue, awaiting, recent] =
      await Promise.all([
        this.compete.currentRound(operatorId),
        this.prisma.competePlayer.count({ where: { operatorId } }),
        this.prisma.competeRound.count({
          where: { operatorId, status: 'SETTLED', startsAt: { gte: since } },
        }),
        this.prisma.competeRound.count({
          where: { operatorId, status: 'CANCELLED', startsAt: { gte: since } },
        }),
        this.prisma.competeEntry.count({
          where: { round: { operatorId }, paidAt: { gte: since } },
        }),
        this.prisma.competePayment.groupBy({
          by: ['kind'],
          where: {
            entry: { round: { operatorId } },
            createdAt: { gte: since },
            status: { in: ['SUCCEEDED', 'AWAITING_PAYOUT'] },
          },
          _sum: { amountMinor: true },
        }),
        this.prisma.competeRound.aggregate({
          where: { operatorId, status: 'SETTLED', startsAt: { gte: since } },
          _sum: { operatorShareMinor: true },
        }),
        this.prisma.competePayment.aggregate({
          where: { entry: { round: { operatorId } }, kind: 'PRIZE', status: 'AWAITING_PAYOUT' },
          _sum: { amountMinor: true },
          _count: true,
        }),
        this.prisma.competeRound.findMany({
          where: { operatorId, status: { in: ['SETTLED', 'CANCELLED'] } },
          orderBy: { startsAt: 'desc' },
          take: 14,
        }),
      ]);
    const kind = (k: string) => payments.find((p) => p.kind === k)?._sum.amountMinor ?? 0n;
    return {
      current,
      currency: op.currency,
      players,
      roundsSettled30d: settled,
      roundsCancelled30d: cancelled,
      entries30d: entries,
      netEntryFeesMinor30d: (kind('ENTRY') - kind('REFUND')).toString(),
      prizesMinor30d: kind('PRIZE').toString(),
      operatorRevenueMinor30d: (revenue._sum.operatorShareMinor ?? 0n).toString(),
      awaitingPayouts: awaiting._count,
      awaitingPayoutsMinor: (awaiting._sum.amountMinor ?? 0n).toString(),
      recent: await Promise.all(recent.map((r) => this.summary(r))),
    };
  }

  async rounds(operatorId: string, cursor?: string) {
    const rows = await this.prisma.competeRound.findMany({
      where: { operatorId },
      orderBy: { startsAt: 'desc' },
      take: PAGE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const items = await Promise.all(rows.slice(0, PAGE).map((r) => this.summary(r)));
    return { items, nextCursor: rows.length > PAGE ? rows[PAGE - 1]!.id : null };
  }

  async round(operatorId: string, roundId: string): Promise<CompeteAdminRoundDetailDto> {
    const r = await this.prisma.competeRound.findUnique({ where: { id: roundId } });
    if (!r || r.operatorId !== operatorId) throw Errors.notFound('Round');
    const lb = r.status === 'OPEN' ? null : await this.compete.leaderboard(roundId, operatorId);
    const entries = await this.prisma.competeEntry.findMany({
      where: { roundId },
      include: { player: { select: { nickname: true } } },
    });
    const byNick = new Map(entries.map((e) => [e.player.nickname, e]));
    const rows =
      lb?.rows.map((row) => {
        const e = byNick.get(row.nickname)!;
        return { ...row, entryId: e.id, playerId: e.playerId };
      }) ??
      entries
        .filter((e) => e.paidAt)
        .map((e, i) => ({
          rank: i + 1,
          nickname: e.player.nickname,
          returnBps: '0',
          equityMinor: e.balanceMinor.toString(),
          status: e.status,
          prizeMinor: '0',
          isMe: false,
          entryId: e.id,
          playerId: e.playerId,
        }));
    return {
      round: await this.summary(r),
      endsAt: r.endsAt.toISOString(),
      minParticipants: r.minParticipants,
      entryFeeMinor: r.entryFeeMinor.toString(),
      currency: r.currency,
      rows,
    };
  }

  // ================================================================ players

  async players(
    operatorId: string,
    q?: string,
    cursor?: string,
  ): Promise<CompeteAdminPlayerPageDto> {
    const term = q?.trim();
    const rows = await this.prisma.competePlayer.findMany({
      where: {
        operatorId,
        ...(term
          ? {
              OR: [
                { nickname: { contains: term, mode: 'insensitive' } },
                { email: { contains: term.toLowerCase() } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: PAGE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        entries: { where: { paidAt: { not: null } }, select: { prizeMinor: true } },
      },
    });
    return {
      items: rows.slice(0, PAGE).map((p) => ({
        id: p.id,
        nickname: p.nickname,
        email: p.email,
        country: p.country,
        status: p.status,
        statusReason: p.statusReason,
        entries: p.entries.length,
        prizesMinor: sum(p.entries.map((e) => e.prizeMinor ?? 0n)).toString(),
        createdAt: p.createdAt.toISOString(),
      })),
      nextCursor: rows.length > PAGE ? rows[PAGE - 1]!.id : null,
    };
  }

  async setPlayerStatus(
    staff: StaffCtx,
    operatorId: string,
    playerId: string,
    status: 'ACTIVE' | 'SUSPENDED',
    reason: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const p = await tx.competePlayer.findUnique({ where: { id: playerId } });
      if (!p || p.operatorId !== operatorId) throw Errors.notFound('Player');
      await tx.competePlayer.update({
        where: { id: p.id },
        data: { status, statusReason: status === 'SUSPENDED' ? reason : null },
      });
      if (status === 'SUSPENDED')
        await tx.competeSession.updateMany({
          where: { playerId: p.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      await this.audit.append(tx, {
        actorType: 'ADMIN',
        actorId: staff.id,
        operatorId,
        action: status === 'SUSPENDED' ? 'compete.player.suspended' : 'compete.player.reactivated',
        entityType: 'CompetePlayer',
        entityId: p.id,
        data: { reason },
      });
    });
  }

  // ================================================================ payouts

  async payouts(operatorId: string, status: 'AWAITING_PAYOUT' | 'SUCCEEDED') {
    const rows = await this.prisma.competePayment.findMany({
      where: { kind: 'PRIZE', status, entry: { round: { operatorId } } },
      include: {
        entry: { include: { round: true, player: { select: { nickname: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((p): CompeteAdminPayoutDto => ({
      id: p.id,
      entryId: p.entryId,
      roundId: p.entry.roundId,
      roundStartsAt: p.entry.round.startsAt.toISOString(),
      nickname: p.entry.player.nickname,
      rank: p.entry.rank,
      amountMinor: p.amountMinor.toString(),
      currency: p.currency,
      status: p.status,
      updatedAt: p.updatedAt.toISOString(),
    }));
  }

  /**
   * Records that a prize was paid outside the platform (bank transfer by the operator). The
   * platform never moves the money itself until a licensed payout provider is connected (D101).
   */
  async markPaid(staff: StaffCtx, operatorId: string, paymentId: string, reference: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "CompetePayment" WHERE id = ${paymentId}::uuid FOR UPDATE`;
      const p = await tx.competePayment.findUnique({
        where: { id: paymentId },
        include: { entry: { include: { round: { select: { operatorId: true } } } } },
      });
      if (!p || p.kind !== 'PRIZE' || p.entry.round.operatorId !== operatorId)
        throw Errors.notFound('Payout');
      if (p.status !== 'AWAITING_PAYOUT') throw Errors.conflict('PAYOUT_NOT_PENDING');
      await tx.competePayment.update({ where: { id: p.id }, data: { status: 'SUCCEEDED' } });
      await this.audit.append(tx, {
        actorType: 'ADMIN',
        actorId: staff.id,
        operatorId,
        action: 'compete.prize.marked_paid',
        entityType: 'CompetePayment',
        entityId: p.id,
        data: { amountMinor: p.amountMinor, reference },
      });
    });
  }

  // ================================================================ settings

  async settings(operatorId: string): Promise<CompeteAdminSettingsDto> {
    const op = await this.prisma.competeOperator.findUniqueOrThrow({ where: { id: operatorId } });
    return {
      name: op.name,
      primaryColor: op.primaryColor,
      domain: op.domain,
      timeZone: op.timeZone,
      startMinuteOfDay: op.startMinuteOfDay,
      durationMinutes: op.durationMinutes,
      entryFeeMinor: op.entryFeeMinor.toString(),
      currency: op.currency,
      startBalanceMinor: op.startBalanceMinor.toString(),
      leverage: op.leverage,
      maxDrawdownBps: op.maxDrawdownBps,
      minParticipants: op.minParticipants,
      prizePoolBps: op.prizePoolBps,
      prizeSplitBps: op.prizeSplitBps,
    };
  }

  /** Validated by the engine; applies to rounds created afterwards (open rounds keep their snapshot). */
  async updateSettings(staff: StaffCtx, operatorId: string, dto: UpdateCompeteSettingsDto) {
    try {
      new Intl.DateTimeFormat('en', { timeZone: dto.timeZone });
    } catch {
      throw Errors.unprocessable('TIMEZONE_INVALID', 'Unknown time zone');
    }
    const params = {
      entryFeeMinor: BigInt(dto.entryFeeMinor),
      startBalanceMinor: BigInt(dto.startBalanceMinor),
      leverage: dto.leverage,
      maxDrawdownBps: dto.maxDrawdownBps,
      minParticipants: dto.minParticipants,
      prizePoolBps: dto.prizePoolBps,
      prizeSplitBps: dto.prizeSplitBps,
      durationMs: dto.durationMinutes * 60_000,
    };
    const errors = validateCompeteParams(params);
    if (errors.length > 0)
      throw new AppError('SETTINGS_INVALID', 422, 'Invalid competition settings', { errors });
    const before = await this.settings(operatorId);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.competeOperator.update({
          where: { id: operatorId },
          data: {
            name: dto.name,
            primaryColor: dto.primaryColor.toUpperCase(),
            domain: dto.domain || null,
            timeZone: dto.timeZone,
            startMinuteOfDay: dto.startMinuteOfDay,
            durationMinutes: dto.durationMinutes,
            entryFeeMinor: params.entryFeeMinor,
            startBalanceMinor: params.startBalanceMinor,
            leverage: params.leverage,
            maxDrawdownBps: params.maxDrawdownBps,
            minParticipants: params.minParticipants,
            prizePoolBps: params.prizePoolBps,
            prizeSplitBps: params.prizeSplitBps,
          },
        });
        await this.audit.append(tx, {
          actorType: 'ADMIN',
          actorId: staff.id,
          operatorId,
          action: 'compete.operator.settings_updated',
          entityType: 'CompeteOperator',
          entityId: operatorId,
          data: { before, after: { ...dto } },
        });
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw Errors.conflict('DOMAIN_TAKEN', 'This domain is already in use');
      throw e;
    }
    this.operators.invalidate();
    return this.settings(operatorId);
  }

  // ================================================================ audit

  async auditLog(operatorId: string, cursor?: string): Promise<CompeteAdminAuditPageDto> {
    const rows = await this.prisma.competeAuditLog.findMany({
      where: { operatorId, ...(cursor ? { id: { lt: BigInt(cursor) } } : {}) },
      orderBy: { id: 'desc' },
      take: PAGE + 1,
    });
    const chain = await this.audit.verify();
    return {
      items: rows.slice(0, PAGE).map((r) => ({
        id: r.id.toString(),
        ts: r.ts.toISOString(),
        actorType: r.actorType,
        actorId: r.actorId,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        data: r.data as Record<string, unknown>,
      })),
      nextCursor: rows.length > PAGE ? rows[PAGE - 1]!.id.toString() : null,
      chainIntact: chain.ok,
    };
  }

  // ================================================================ superadmin: operators

  private async operatorDto(id: string): Promise<CompeteAdminOperatorDto> {
    const op = await this.prisma.competeOperator.findUniqueOrThrow({
      where: { id },
      include: { staff: { where: { role: 'OWNER' } }, _count: { select: { players: true } } },
    });
    const owner = op.staff[0];
    return {
      id: op.id,
      slug: op.slug,
      name: op.name,
      domain: op.domain,
      status: op.status,
      ownerEmail: owner?.email ?? null,
      ownerTwoFactor: !!owner?.totpEnabledAt,
      players: op._count.players,
      createdAt: op.createdAt.toISOString(),
    };
  }

  async listOperators(): Promise<CompeteAdminOperatorDto[]> {
    const ops = await this.prisma.competeOperator.findMany({ orderBy: { createdAt: 'asc' } });
    return Promise.all(ops.map((o) => this.operatorDto(o.id)));
  }

  private setupUrl(token: string) {
    return `${this.config.appBaseUrl}/en/compete/admin/setup?token=${token}`;
  }

  private newSetupToken() {
    const token = randomBytes(32).toString('base64url');
    return {
      token,
      data: { setupTokenHash: sha256(token), setupTokenExpires: new Date(Date.now() + DAY) },
    };
  }

  /** Creates an operator and its single owner; returns a one-time link for the owner. */
  async createOperator(staff: StaffCtx, slug: string, name: string, ownerEmail: string) {
    const { token, data } = this.newSetupToken();
    try {
      const op = await this.prisma.$transaction(async (tx) => {
        const op = await tx.competeOperator.create({ data: { slug, name } });
        const owner = await tx.competeStaff.create({
          data: {
            operatorId: op.id,
            email: ownerEmail,
            role: 'OWNER',
            passwordHash: await hash(randomBytes(32).toString('base64url'), ARGON),
            ...data,
          },
        });
        await this.audit.append(tx, {
          actorType: 'ADMIN',
          actorId: staff.id,
          operatorId: op.id,
          action: 'compete.operator.created',
          entityType: 'CompeteOperator',
          entityId: op.id,
          data: { slug, ownerId: owner.id },
        });
        return op;
      });
      this.operators.invalidate();
      return { operator: await this.operatorDto(op.id), setupUrl: this.setupUrl(token) };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw Errors.conflict('OPERATOR_OR_EMAIL_TAKEN', 'Slug or e-mail is already in use');
      throw e;
    }
  }

  async setOperatorStatus(staff: StaffCtx, id: string, status: 'ACTIVE' | 'SUSPENDED') {
    await this.prisma.$transaction(async (tx) => {
      await tx.competeOperator.update({ where: { id }, data: { status } });
      await this.audit.append(tx, {
        actorType: 'ADMIN',
        actorId: staff.id,
        operatorId: id,
        action: 'compete.operator.status',
        entityType: 'CompeteOperator',
        entityId: id,
        data: { status },
      });
    });
    this.operators.invalidate();
    return this.operatorDto(id);
  }

  /** New invite link for the owner; also resets their 2FA (lost device). */
  async reinviteOwner(staff: StaffCtx, id: string) {
    const owner = await this.prisma.competeStaff.findFirst({
      where: { operatorId: id, role: 'OWNER' },
    });
    if (!owner) throw Errors.notFound('Owner');
    const { token, data } = this.newSetupToken();
    await this.prisma.$transaction(async (tx) => {
      await tx.competeStaff.update({
        where: { id: owner.id },
        data: { ...data, totpEnabledAt: null, totpSecretEnc: null, totpLastStep: null },
      });
      await this.audit.append(tx, {
        actorType: 'ADMIN',
        actorId: staff.id,
        operatorId: id,
        action: 'compete.owner.reinvited',
        entityType: 'CompeteStaff',
        entityId: owner.id,
        data: { twoFactorReset: true },
      });
    });
    await this.tokens.revokeAll(owner.id);
    return { operator: await this.operatorDto(id), setupUrl: this.setupUrl(token) };
  }
}
