import { randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { hash } from '@node-rs/argon2';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { PrismaService } from '../../infra/prisma.service.js';
import { Errors } from '../../common/errors.js';
import { Prisma } from '../../generated/prisma/client.js';
import { CLIENT_MODULES, isClientModule, type ClientModule } from '@brand/shared';
import type { Tx } from '../../infra/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
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
  ModulesDto,
  UpdateBrandingDto,
} from './dto.js';

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

  // ---------------------------------------------------------------- client dashboard
  async modules(ctx: AdminContext): Promise<ModulesDto> {
    const f = await this.prisma.firm.findUniqueOrThrow({ where: { id: ctx.firmId } });
    return { available: [...CLIENT_MODULES], disabled: f.disabledModules.filter(isClientModule) };
  }

  /** Switch client-dashboard modules on/off (D92). Enforced by ModuleGuard on the API. */
  async updateModules(ctx: AdminContext, disabled: ClientModule[]): Promise<ModulesDto> {
    const unique = [...new Set(disabled)].filter(isClientModule).sort();
    await this.prisma.$transaction(async (tx) => {
      await tx.firm.update({ where: { id: ctx.firmId }, data: { disabledModules: unique } });
      await this.audit.append(tx, {
        actorType: 'ADMIN',
        actorId: ctx.userId,
        firmId: ctx.firmId,
        action: 'admin.modules_updated',
        entityType: 'Firm',
        entityId: ctx.firmId,
        data: { disabled: unique },
      });
    });
    this.firms.invalidate();
    return this.modules(ctx);
  }

  // ---------------------------------------------------------------- firm admin
  /**
   * Creates the firm's admin account (D91): a staff-only user (no trading account) that can
   * only sign in on the admin login. Staff emails are unique across all firms.
   */
  private async createAdmin(tx: Tx, firmId: string, email: string, actorId: string) {
    const staff = await tx.user.findMany({
      where: { email, OR: [{ firmRole: { not: null } }, { roles: { has: 'ADMIN' } }] },
    });
    // A former admin of this same firm is reactivated instead of duplicated.
    const former = staff.find((u) => u.firmId === firmId && u.status === 'SUSPENDED');
    if (staff.some((u) => u !== former))
      throw Errors.conflict('STAFF_EMAIL_TAKEN', 'This email is already an admin');
    if (former) {
      const u = await tx.user.update({ where: { id: former.id }, data: { status: 'ACTIVE' } });
      await this.audit.append(tx, {
        actorType: 'ADMIN',
        actorId,
        firmId,
        action: 'platform.firm_admin_created',
        entityType: 'User',
        entityId: u.id,
        data: { reactivated: true },
      });
      return u;
    }
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { locale: true } });
    // Unusable random password until the invitation link is used.
    const passwordHash = await hash(randomBytes(32).toString('base64url'));
    const u = await tx.user.create({
      data: {
        firmId,
        email,
        firmRole: 'OWNER',
        passwordHash,
        country: 'NL',
        locale: actor?.locale ?? 'en',
        termsAcceptedAt: new Date(),
        termsVersion: 'staff',
        emailVerifiedAt: null,
      },
    });
    await this.audit.append(tx, {
      actorType: 'ADMIN',
      actorId,
      firmId,
      action: 'platform.firm_admin_created',
      entityType: 'User',
      entityId: u.id,
      data: {},
    });
    return u;
  }

  private async sendInvite(user: { id: string; email: string; locale: string }) {
    const token = await this.emailTokens.issue(user.id, 'RESET_PASSWORD');
    const link = `${this.config.appBaseUrl}/${user.locale}/reset-password?token=${token}&for=admin`;
    await this.mailer
      .send({ to: user.email, ...renderMail('invite', user.locale, link) })
      .catch((e: Error) => this.logger.warn(`invite mail failed: ${e.message}`));
  }

  private currentAdmin(firmId: string) {
    return this.prisma.user.findFirst({
      where: { firmId, firmRole: 'OWNER', status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** One admin per firm: a new admin replaces (deactivates) the previous one. */
  async setFirmAdmin(
    ctx: AdminContext,
    firmId: string,
    email: string,
  ): Promise<AdminFirmSummaryDto[]> {
    const firm = await this.prisma.firm.findUnique({ where: { id: firmId } });
    if (!firm) throw Errors.notFound('Firm');
    const lower = email.toLowerCase();
    let created;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const previous = await tx.user.findMany({
          where: { firmId, firmRole: { not: null }, status: 'ACTIVE', email: { not: lower } },
          select: { id: true },
        });
        for (const p of previous) {
          // Stays marked as staff (never becomes a client account), but can no longer sign in.
          await tx.user.update({ where: { id: p.id }, data: { status: 'SUSPENDED' } });
          await this.audit.append(tx, {
            actorType: 'ADMIN',
            actorId: ctx.userId,
            firmId,
            action: 'platform.firm_admin_removed',
            entityType: 'User',
            entityId: p.id,
            data: {},
          });
        }
        return { user: await this.createAdmin(tx, firmId, lower, ctx.userId), previous };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw Errors.conflict('EMAIL_TAKEN', 'This email is already used on this platform');
      throw e;
    }
    // Previous admins are signed out everywhere.
    await this.prisma.refreshToken.updateMany({
      where: { userId: { in: created.previous.map((p) => p.id) }, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.sendInvite(created.user);
    return this.listFirms();
  }

  async resendInvite(ctx: AdminContext, firmId: string): Promise<void> {
    const admin = await this.currentAdmin(firmId);
    if (!admin) throw Errors.notFound('Admin');
    await this.prisma.$transaction((tx) =>
      this.audit.append(tx, {
        actorType: 'ADMIN',
        actorId: ctx.userId,
        firmId,
        action: 'platform.firm_admin_invited',
        entityType: 'User',
        entityId: admin.id,
        data: {},
      }),
    );
    await this.sendInvite(admin);
  }

  // ---------------------------------------------------------------- firms (superadmin)
  async listFirms(): Promise<AdminFirmSummaryDto[]> {
    const firms = await this.prisma.firm.findMany({ orderBy: { createdAt: 'asc' } });
    const [traders, funded] = await Promise.all([
      this.prisma.user.groupBy({
        by: ['firmId'],
        where: { firmRole: null, NOT: { roles: { has: 'ADMIN' } } },
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<{ firmId: string; n: bigint }[]>`
        SELECT u."firmId", COUNT(*)::bigint AS n
        FROM "TradingAccount" a JOIN "User" u ON u.id = a."userId"
        WHERE a.kind = 'FUNDED' AND a.status = 'FUNDED_ACTIVE'
        GROUP BY u."firmId"`,
    ]);
    const admins = await this.prisma.user.findMany({
      where: { firmRole: 'OWNER', status: 'ACTIVE' },
      select: {
        firmId: true,
        email: true,
        lastLoginAt: true,
        twoFactor: { select: { enabledAt: true } },
      },
    });
    const adminBy = new Map(admins.map((a) => [a.firmId, a]));
    const t = new Map(traders.map((r) => [r.firmId, r._count._all]));
    const fa = new Map(funded.map((r) => [r.firmId, Number(r.n)]));
    return firms.map((f) => ({
      ...toAdminFirmDto(f, this.config.defaultFirmSlug),
      traders: t.get(f.id) ?? 0,
      fundedActive: fa.get(f.id) ?? 0,
      admin: adminBy.has(f.id)
        ? {
            email: adminBy.get(f.id)!.email,
            activated: adminBy.get(f.id)!.lastLoginAt !== null,
            twoFactorEnabled: !!adminBy.get(f.id)!.twoFactor?.enabledAt,
          }
        : null,
    }));
  }

  /** New tenant with the example catalogue; its admin is invited by email (D91). */
  async createFirm(ctx: AdminContext, dto: CreateFirmDto): Promise<AdminFirmSummaryDto[]> {
    let admin;
    try {
      admin = await this.prisma.$transaction(async (tx) => {
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
        return this.createAdmin(tx, f.id, dto.ownerEmail.toLowerCase(), ctx.userId);
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw Errors.conflict('SLUG_TAKEN', 'A firm with this slug already exists');
      throw e;
    }
    await this.products.seedCatalog(admin.firmId);
    await this.sendInvite(admin);
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
