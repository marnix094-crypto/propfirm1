import { createHash, randomBytes, randomUUID } from 'node:crypto';
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
import { jwtVerify, SignJWT } from 'jose';
import { APP_CONFIG, type AppConfig } from '../../../config/env.js';
import { Errors } from '../../../common/errors.js';
import { PrismaService } from '../../../infra/prisma.service.js';
import type { CompeteStaffRole } from '../../../generated/prisma/client.js';

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const AUDIENCE = 'compete-admin';

export interface StaffCtx {
  id: string;
  email: string;
  role: CompeteStaffRole;
  operatorId: string | null;
  twoFactorEnabled: boolean;
}

export interface StaffTokens {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
}

/**
 * Tokens of compete admins (D104): `purpose: compete-admin` + own audience. Never valid for
 * players, the prop-firm API or the prop-firm admin panel (and vice versa).
 */
@Injectable()
export class CompeteStaffTokens {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
  ) {}

  async verify(token: string): Promise<string> {
    try {
      const { payload } = await jwtVerify(token, this.config.jwt.accessSecret, {
        issuer: this.config.jwt.issuer,
        audience: AUDIENCE,
        algorithms: ['HS256'],
      });
      if (payload.purpose !== 'compete-admin' || !payload.sub) throw new Error('wrong token');
      return payload.sub;
    } catch {
      throw Errors.unauthorized('TOKEN_INVALID');
    }
  }

  async issue(staffId: string, familyId?: string): Promise<StaffTokens> {
    const refreshToken = randomBytes(32).toString('base64url');
    // Admin sessions are short: 12 hours.
    const refreshExpiresAt = new Date(Date.now() + 12 * 3_600_000);
    await this.prisma.competeStaffSession.create({
      data: {
        staffId,
        familyId: familyId ?? randomUUID(),
        tokenHash: sha256(refreshToken),
        expiresAt: refreshExpiresAt,
      },
    });
    const accessToken = await new SignJWT({ purpose: 'compete-admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(staffId)
      .setIssuer(this.config.jwt.issuer)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${this.config.jwt.accessTtlSec}s`)
      .sign(this.config.jwt.accessSecret);
    return { accessToken, expiresIn: this.config.jwt.accessTtlSec, refreshToken, refreshExpiresAt };
  }

  async rotate(presented: string): Promise<StaffTokens> {
    const row = await this.prisma.competeStaffSession.findUnique({
      where: { tokenHash: sha256(presented) },
      include: { staff: { select: { active: true } } },
    });
    if (!row) throw Errors.unauthorized('REFRESH_INVALID');
    if (row.revokedAt) {
      await this.prisma.competeStaffSession.updateMany({
        where: { familyId: row.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw Errors.unauthorized('REFRESH_REUSED');
    }
    if (row.expiresAt < new Date() || !row.staff.active)
      throw Errors.unauthorized('REFRESH_INVALID');
    await this.prisma.competeStaffSession.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });
    return this.issue(row.staffId, row.familyId);
  }

  async revoke(presented: string) {
    await this.prisma.competeStaffSession.updateMany({
      where: { tokenHash: sha256(presented), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAll(staffId: string) {
    await this.prisma.competeStaffSession.updateMany({
      where: { staffId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

const PENDING_MFA_OK = 'competeAdminPendingMfaOk';
/** Route usable before 2FA is set up (setup itself, `me`). */
export const AllowPendingMfa = () => SetMetadata(PENDING_MFA_OK, true);
const SUPERADMIN_ONLY = 'competeAdminSuperadminOnly';
export const SuperadminOnly = () => SetMetadata(SUPERADMIN_ONLY, true);

/** Guard of the compete admin panel: active staff, 2FA enforced (ADMIN_REQUIRE_2FA). */
@Injectable()
export class CompeteAdminGuard implements CanActivate {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly reflector: Reflector,
    private readonly tokens: CompeteStaffTokens,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { competeStaff?: StaffCtx }>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw Errors.unauthorized();
    const id = await this.tokens.verify(header.slice(7));
    const s = await this.prisma.competeStaff.findUnique({ where: { id } });
    if (!s || !s.active) throw Errors.unauthorized('TOKEN_INVALID');
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (
      this.config.adminRequire2fa &&
      !s.totpEnabledAt &&
      !this.reflector.getAllAndOverride<boolean>(PENDING_MFA_OK, targets)
    )
      throw Errors.forbidden('TWO_FACTOR_SETUP_REQUIRED');
    if (
      this.reflector.getAllAndOverride<boolean>(SUPERADMIN_ONLY, targets) &&
      s.role !== 'SUPERADMIN'
    )
      throw Errors.forbidden();
    req.competeStaff = {
      id: s.id,
      email: s.email,
      role: s.role,
      operatorId: s.operatorId,
      twoFactorEnabled: !!s.totpEnabledAt,
    };
    return true;
  }
}

export const Staff = createParamDecorator(
  (_d: unknown, ctx: ExecutionContext): StaffCtx =>
    ctx.switchToHttp().getRequest<{ competeStaff: StaffCtx }>().competeStaff,
);
