import { randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { hash } from '@node-rs/argon2';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { PrismaService } from '../../infra/prisma.service.js';
import { Errors } from '../../common/errors.js';
import { Prisma, type FirmRole } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { openDemoAccount } from '../auth/auth.service.js';
import { EmailTokensService } from '../auth/email-tokens.service.js';
import { FirmsService } from '../firms/firms.service.js';
import { ProductsService } from '../commerce/products.service.js';
import { MAILER, type Mailer } from '../mail/mailer.js';
import { renderMail } from '../mail/templates.js';
import type { AdminContext } from './admin.guard.js';
import { toAdminFirmDto } from './admin.service.js';
import type {
  AdminFirmDto,
  AdminFirmSummaryDto,
  CreateFirmDto,
  InviteMemberDto,
  TeamMemberDto,
  UpdateBrandingDto,
} from './dto.js';

/** Which roles a member may hand out: owners anything, admins only support staff. */
const CAN_GRANT: Record<FirmRole, FirmRole[]> = {
  OWNER: ['OWNER', 'ADMIN', 'SUPPORT'],
  ADMIN: ['SUPPORT'],
  SUPPORT: [],
};

@Injectable()
export class AdminFirmService {
  private readonly logger = new Logger(AdminFirmService.name);
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly firms: FirmsService,
    private readonly products: ProductsService,
    private readonly emailTokens: EmailTokensService,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  // ---------------------------------------------------------------- branding
  async branding(ctx: AdminContext): Promise<AdminFirmDto> {
    const f = await this.prisma.firm.findUniqueOrThrow({ where: { id: ctx.firmId } });
    return toAdminFirmDto(f, this.config.defaultFirmSlug);
  }

  async updateBranding(ctx: AdminContext, dto: UpdateBrandingDto): Promise<AdminFirmDto> {
    const data: Prisma.FirmUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.primaryColor !== undefined) data.primaryColor = dto.primaryColor?.toUpperCase() ?? null;
    if (dto.logoDataUrl !== undefined) data.logoDataUrl = dto.logoDataUrl;
    if (dto.domain !== undefined) data.domain = dto.domain?.toLowerCase() ?? null;
    if (dto.supportEmail !== undefined) data.supportEmail = dto.supportEmail;
    try {
      const f = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.firm.update({ where: { id: ctx.firmId }, data });
        await this.audit.append(tx, {
          actorType: 'ADMIN',
          actorId: ctx.userId,
          firmId: ctx.firmId,
          action: 'admin.branding_updated',
          entityType: 'Firm',
          entityId: ctx.firmId,
          // Field names only (a logo is large, an email is personal data).
          data: { fields: Object.keys(data).sort() },
        });
        return updated;
      });
      this.firms.invalidate();
      return toAdminFirmDto(f, this.config.defaultFirmSlug);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw Errors.conflict('DOMAIN_TAKEN', 'This domain is already used by another firm');
      throw e;
    }
  }

  // ---------------------------------------------------------------- team
  async team(ctx: AdminContext): Promise<TeamMemberDto[]> {
    const rows = await this.prisma.user.findMany({
      where: { firmId: ctx.firmId, firmRole: { not: null } },
      orderBy: { createdAt: 'asc' },
      include: { twoFactor: { select: { enabledAt: true } } },
    });
    return rows.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.firmRole!,
      twoFactorEnabled: !!u.twoFactor?.enabledAt,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      isYou: u.id === ctx.userId,
    }));
  }

  private assertCanGrant(ctx: AdminContext, role: FirmRole) {
    if (!CAN_GRANT[ctx.role].includes(role)) throw Errors.forbidden('ADMIN_ROLE_INSUFFICIENT');
  }

  /**
   * Adds someone to the firm's team. An existing user of this firm gets the role; otherwise an
   * account is created (with the usual free demo account) and an invitation to set a password
   * is emailed.
   */
  async invite(ctx: AdminContext, dto: InviteMemberDto): Promise<TeamMemberDto[]> {
    this.assertCanGrant(ctx, dto.role);
    await this.addMember(ctx.firmId, dto.email.toLowerCase(), dto.role, ctx.userId);
    return this.team(ctx);
  }

  private async addMember(
    firmId: string,
    email: string,
    role: FirmRole,
    actorId: string,
  ): Promise<void> {
    const { userId, created, locale } = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { firmId_email: { firmId, email } } });
      if (existing) {
        if (existing.firmRole)
          throw Errors.conflict('ALREADY_MEMBER', 'This person is already on the team');
        await tx.user.update({ where: { id: existing.id }, data: { firmRole: role } });
        await this.audit.append(tx, {
          actorType: 'ADMIN',
          actorId,
          firmId,
          action: 'admin.member_added',
          entityType: 'User',
          entityId: existing.id,
          data: { role },
        });
        return { userId: existing.id, created: false, locale: existing.locale };
      }
      const inviter = await tx.user.findUnique({
        where: { id: actorId },
        select: { country: true, locale: true },
      });
      // Unusable random password until the invitation link is used.
      const passwordHash = await hash(randomBytes(32).toString('base64url'));
      const u = await tx.user.create({
        data: {
          firmId,
          email,
          firmRole: role,
          passwordHash,
          country: inviter?.country ?? 'NL',
          locale: inviter?.locale ?? 'en',
          termsAcceptedAt: new Date(),
          termsVersion: 'staff-invite',
        },
      });
      await openDemoAccount(tx, this.audit, u.id, this.config.demoInitialBalanceMinor);
      await this.audit.append(tx, {
        actorType: 'ADMIN',
        actorId,
        firmId,
        action: 'admin.member_invited',
        entityType: 'User',
        entityId: u.id,
        data: { role },
      });
      return { userId: u.id, created: true, locale: u.locale };
    });
    if (created) {
      const token = await this.emailTokens.issue(userId, 'RESET_PASSWORD');
      const link = `${this.config.appBaseUrl}/${locale}/reset-password?token=${token}`;
      await this.mailer
        .send({ to: email, ...renderMail('invite', locale, link) })
        .catch((e: Error) => this.logger.warn(`invite mail failed: ${e.message}`));
    }
  }

  private async memberOf(ctx: AdminContext, id: string) {
    const u = await this.prisma.user.findFirst({
      where: { id, firmId: ctx.firmId, firmRole: { not: null } },
    });
    if (!u) throw Errors.notFound('Member');
    return u;
  }

  /** A firm must always keep at least one owner. */
  private async assertNotLastOwner(firmId: string, userId: string) {
    const owners = await this.prisma.user.count({
      where: { firmId, firmRole: 'OWNER', status: 'ACTIVE', id: { not: userId } },
    });
    if (owners === 0)
      throw Errors.unprocessable('LAST_OWNER', 'A firm needs at least one other owner first');
  }

  async changeRole(ctx: AdminContext, id: string, role: FirmRole): Promise<TeamMemberDto[]> {
    const m = await this.memberOf(ctx, id);
    // Changing someone's role requires being allowed to grant both the old and the new one.
    this.assertCanGrant(ctx, role);
    this.assertCanGrant(ctx, m.firmRole!);
    if (m.firmRole === 'OWNER' && role !== 'OWNER') await this.assertNotLastOwner(ctx.firmId, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { firmRole: role } });
      await this.audit.append(tx, {
        actorType: 'ADMIN',
        actorId: ctx.userId,
        firmId: ctx.firmId,
        action: 'admin.member_role_changed',
        entityType: 'User',
        entityId: id,
        data: { from: m.firmRole, to: role },
      });
    });
    return this.team(ctx);
  }

  async removeMember(ctx: AdminContext, id: string): Promise<TeamMemberDto[]> {
    const m = await this.memberOf(ctx, id);
    this.assertCanGrant(ctx, m.firmRole!);
    if (m.firmRole === 'OWNER') await this.assertNotLastOwner(ctx.firmId, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { firmRole: null } });
      await this.audit.append(tx, {
        actorType: 'ADMIN',
        actorId: ctx.userId,
        firmId: ctx.firmId,
        action: 'admin.member_removed',
        entityType: 'User',
        entityId: id,
        data: { role: m.firmRole },
      });
    });
    // Sessions keep working for the trading platform; admin access is checked per request.
    return this.team(ctx);
  }

  // ---------------------------------------------------------------- firms (superadmin)
  async listFirms(): Promise<AdminFirmSummaryDto[]> {
    const firms = await this.prisma.firm.findMany({ orderBy: { createdAt: 'asc' } });
    const [traders, funded] = await Promise.all([
      this.prisma.user.groupBy({
        by: ['firmId'],
        where: { firmRole: null },
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<{ firmId: string; n: bigint }[]>`
        SELECT u."firmId", COUNT(*)::bigint AS n
        FROM "TradingAccount" a JOIN "User" u ON u.id = a."userId"
        WHERE a.kind = 'FUNDED' AND a.status = 'FUNDED_ACTIVE'
        GROUP BY u."firmId"`,
    ]);
    const t = new Map(traders.map((r) => [r.firmId, r._count._all]));
    const fa = new Map(funded.map((r) => [r.firmId, Number(r.n)]));
    return firms.map((f) => ({
      ...toAdminFirmDto(f, this.config.defaultFirmSlug),
      traders: t.get(f.id) ?? 0,
      fundedActive: fa.get(f.id) ?? 0,
    }));
  }

  /** New tenant with the example catalogue; the owner is invited by email. */
  async createFirm(ctx: AdminContext, dto: CreateFirmDto): Promise<AdminFirmSummaryDto[]> {
    let firmId: string;
    try {
      firmId = await this.prisma.$transaction(async (tx) => {
        const f = await tx.firm.create({ data: { name: dto.name.trim(), slug: dto.slug } });
        await this.audit.append(tx, {
          actorType: 'ADMIN',
          actorId: ctx.userId,
          firmId: f.id,
          action: 'platform.firm_created',
          entityType: 'Firm',
          entityId: f.id,
          data: { slug: f.slug },
        });
        return f.id;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw Errors.conflict('SLUG_TAKEN', 'A firm with this slug already exists');
      throw e;
    }
    await this.products.seedCatalog(firmId);
    await this.addMember(firmId, dto.ownerEmail.toLowerCase(), 'OWNER', ctx.userId);
    this.firms.invalidate();
    return this.listFirms();
  }

  async setFirmStatus(
    ctx: AdminContext,
    id: string,
    status: 'ACTIVE' | 'SUSPENDED',
  ): Promise<AdminFirmSummaryDto[]> {
    const f = await this.prisma.firm.findUnique({ where: { id } });
    if (!f) throw Errors.notFound('Firm');
    if (f.slug === this.config.defaultFirmSlug && status === 'SUSPENDED')
      throw Errors.unprocessable('DEFAULT_FIRM_PROTECTED', 'The default firm cannot be suspended');
    if (f.status !== status) {
      await this.prisma.$transaction(async (tx) => {
        await tx.firm.update({ where: { id }, data: { status } });
        await this.audit.append(tx, {
          actorType: 'ADMIN',
          actorId: ctx.userId,
          firmId: id,
          action: status === 'SUSPENDED' ? 'platform.firm_suspended' : 'platform.firm_activated',
          entityType: 'Firm',
          entityId: id,
          data: {},
        });
      });
      this.firms.invalidate();
      if (status === 'SUSPENDED') {
        // Everyone on a suspended platform is signed out.
        await this.prisma.refreshToken.updateMany({
          where: { user: { firmId: id }, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    }
    return this.listFirms();
  }
}
