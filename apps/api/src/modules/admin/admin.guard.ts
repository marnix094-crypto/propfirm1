import {
  createParamDecorator,
  Inject,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { PrismaService } from '../../infra/prisma.service.js';
import { Errors } from '../../common/errors.js';
import type { FirmRole } from '../../generated/prisma/client.js';
import type { AuthUser } from '../auth/current-user.decorator.js';

const ROLES = Symbol('admin-roles');
const SUPERADMIN_ONLY = Symbol('superadmin-only');
const SKIP_2FA = Symbol('admin-skip-2fa');

/** Firm roles allowed on a route (default: any staff role). Superadmins act as OWNER. */
export const AdminRoles = (...roles: FirmRole[]) => SetMetadata(ROLES, roles);
/** Daily Funded platform staff only (Role.ADMIN). */
export const SuperadminOnly = () => SetMetadata(SUPERADMIN_ONLY, true);
/** Allowed before 2FA is set up (only GET /admin/me, so the UI can explain what is missing). */
export const AllowWithout2fa = () => SetMetadata(SKIP_2FA, true);

export interface AdminContext {
  userId: string;
  /** The firm being administered (own firm, or the one a superadmin selected). */
  firmId: string;
  role: FirmRole;
  superadmin: boolean;
  twoFactorEnabled: boolean;
}

/** Header a superadmin uses to administer another firm. */
export const ADMIN_FIRM_HEADER = 'x-admin-firm';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Admin panel access (D85): staff of a firm (OWNER/ADMIN/SUPPORT) see only that firm;
 * platform superadmins may pick any firm via `X-Admin-Firm`. Requires 2FA unless
 * ADMIN_REQUIRE_2FA=false (dev/e2e only). Suspended users and firms are refused.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser; admin?: AdminContext }>();
    if (!req.user) throw Errors.unauthorized();
    const targets = [ctx.getHandler(), ctx.getClass()];
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        firmId: true,
        firmRole: true,
        roles: true,
        status: true,
        firm: { select: { status: true } },
        twoFactor: { select: { enabledAt: true } },
      },
    });
    if (!user || user.status !== 'ACTIVE') throw Errors.forbidden('ADMIN_FORBIDDEN');
    const superadmin = user.roles.includes('ADMIN');
    if (!superadmin && (!user.firmRole || user.firm.status !== 'ACTIVE'))
      throw Errors.forbidden('ADMIN_FORBIDDEN');

    const twoFactorEnabled = !!user.twoFactor?.enabledAt;
    const skip2fa = this.reflector.getAllAndOverride<boolean>(SKIP_2FA, targets);
    if (this.config.adminRequire2fa && !twoFactorEnabled && !skip2fa)
      throw Errors.forbidden('ADMIN_2FA_REQUIRED');

    if (this.reflector.getAllAndOverride<boolean>(SUPERADMIN_ONLY, targets) && !superadmin)
      throw Errors.forbidden('ADMIN_FORBIDDEN');

    let firmId = user.firmId;
    const header = req.headers[ADMIN_FIRM_HEADER];
    const selected = Array.isArray(header) ? header[0] : header;
    if (selected && selected !== user.firmId) {
      if (!superadmin || !UUID_RE.test(selected)) throw Errors.forbidden('ADMIN_FORBIDDEN');
      const exists = await this.prisma.firm.findUnique({
        where: { id: selected },
        select: { id: true },
      });
      if (!exists) throw Errors.notFound('Firm');
      firmId = selected;
    }
    const role: FirmRole = superadmin ? 'OWNER' : user.firmRole!;
    const allowed = this.reflector.getAllAndOverride<FirmRole[] | undefined>(ROLES, targets);
    if (allowed && !allowed.includes(role)) throw Errors.forbidden('ADMIN_ROLE_INSUFFICIENT');

    req.admin = { userId: user.id, firmId, role, superadmin, twoFactorEnabled };
    return true;
  }
}

export const Admin = createParamDecorator(
  (_d: unknown, ctx: ExecutionContext): AdminContext =>
    ctx.switchToHttp().getRequest<{ admin: AdminContext }>().admin,
);
