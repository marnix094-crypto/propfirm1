import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  createParamDecorator,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { jwtVerify, SignJWT } from 'jose';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { Errors } from '../../common/errors.js';
import { PrismaService } from '../../infra/prisma.service.js';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * Player identity of the compete product. Tokens carry `purpose: "compete"` and an audience,
 * so they are never accepted by the prop-firm API (whose guard rejects any token with a
 * purpose) and prop-firm tokens are never accepted here (D98).
 */
export interface CompetePlayerCtx {
  id: string;
  operatorId: string;
}

const AUDIENCE = 'compete';

export interface CompeteTokens {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
}

@Injectable()
export class CompeteTokensService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
  ) {}

  private signAccess(p: CompetePlayerCtx): Promise<string> {
    return new SignJWT({ purpose: 'compete', op: p.operatorId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(p.id)
      .setIssuer(this.config.jwt.issuer)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${this.config.jwt.accessTtlSec}s`)
      .sign(this.config.jwt.accessSecret);
  }

  async verifyAccess(token: string): Promise<CompetePlayerCtx> {
    try {
      const { payload } = await jwtVerify(token, this.config.jwt.accessSecret, {
        issuer: this.config.jwt.issuer,
        audience: AUDIENCE,
        algorithms: ['HS256'],
      });
      if (payload.purpose !== 'compete' || !payload.sub || typeof payload.op !== 'string')
        throw new Error('not a compete token');
      return { id: payload.sub, operatorId: payload.op };
    } catch {
      throw Errors.unauthorized('TOKEN_INVALID');
    }
  }

  async issue(p: CompetePlayerCtx, userAgent?: string, familyId?: string): Promise<CompeteTokens> {
    const refreshToken = randomBytes(32).toString('base64url');
    const refreshExpiresAt = new Date(Date.now() + this.config.jwt.refreshTtlDays * 86_400_000);
    await this.prisma.competeSession.create({
      data: {
        playerId: p.id,
        familyId: familyId ?? randomUUID(),
        tokenHash: sha256(refreshToken),
        userAgent: userAgent?.slice(0, 200),
        expiresAt: refreshExpiresAt,
      },
    });
    return {
      accessToken: await this.signAccess(p),
      expiresIn: this.config.jwt.accessTtlSec,
      refreshToken,
      refreshExpiresAt,
    };
  }

  /** Rotation with reuse detection: presenting a used token revokes the whole family. */
  async rotate(presented: string, userAgent?: string) {
    const row = await this.prisma.competeSession.findUnique({
      where: { tokenHash: sha256(presented) },
      include: { player: { include: { operator: { select: { status: true } } } } },
    });
    if (!row) throw Errors.unauthorized('REFRESH_INVALID');
    if (row.revokedAt) {
      await this.prisma.competeSession.updateMany({
        where: { familyId: row.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw Errors.unauthorized('REFRESH_REUSED');
    }
    if (
      row.expiresAt < new Date() ||
      row.player.status === 'SUSPENDED' ||
      row.player.operator.status !== 'ACTIVE'
    )
      throw Errors.unauthorized('REFRESH_INVALID');
    await this.prisma.competeSession.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });
    const tokens = await this.issue(
      { id: row.playerId, operatorId: row.player.operatorId },
      userAgent,
      row.familyId,
    );
    return { player: row.player, tokens };
  }

  async revoke(presented: string): Promise<void> {
    await this.prisma.competeSession.updateMany({
      where: { tokenHash: sha256(presented), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

/** Guard for player routes (controllers are @Public() for the prop-firm guard). */
@Injectable()
export class CompeteAuthGuard implements CanActivate {
  constructor(private readonly tokens: CompeteTokensService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { competePlayer?: CompetePlayerCtx }>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw Errors.unauthorized();
    req.competePlayer = await this.tokens.verifyAccess(header.slice(7));
    return true;
  }
}

export const Player = createParamDecorator(
  (_d: unknown, ctx: ExecutionContext): CompetePlayerCtx =>
    ctx.switchToHttp().getRequest<{ competePlayer: CompetePlayerCtx }>().competePlayer,
);
