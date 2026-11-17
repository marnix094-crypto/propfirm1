import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { jwtVerify, SignJWT } from 'jose';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { PrismaService } from '../../infra/prisma.service.js';
import { Errors } from '../../common/errors.js';
import type { Role } from '../../generated/prisma/client.js';
import type { AuthUser } from './current-user.decorator.js';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export interface IssuedTokens {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
}

@Injectable()
export class TokensService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
  ) {}

  async signAccess(userId: string, roles: Role[]): Promise<string> {
    return new SignJWT({ roles })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuer(this.config.jwt.issuer)
      .setIssuedAt()
      .setExpirationTime(`${this.config.jwt.accessTtlSec}s`)
      .sign(this.config.jwt.accessSecret);
  }

  async verifyAccess(token: string): Promise<AuthUser> {
    try {
      const { payload } = await jwtVerify(token, this.config.jwt.accessSecret, {
        issuer: this.config.jwt.issuer,
        algorithms: ['HS256'],
      });
      if (!payload.sub) throw new Error('no sub');
      return { id: payload.sub, roles: (payload.roles as Role[]) ?? [] };
    } catch {
      throw Errors.unauthorized('TOKEN_INVALID');
    }
  }

  /** Issues an access token and a new refresh token (optionally continuing a rotation family). */
  async issue(
    userId: string,
    roles: Role[],
    userAgent?: string,
    familyId?: string,
  ): Promise<IssuedTokens> {
    const refreshToken = randomBytes(32).toString('base64url');
    const refreshExpiresAt = new Date(Date.now() + this.config.jwt.refreshTtlDays * 86_400_000);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId: familyId ?? randomUUID(),
        tokenHash: sha256(refreshToken),
        userAgent: userAgent?.slice(0, 200),
        expiresAt: refreshExpiresAt,
      },
    });
    return {
      accessToken: await this.signAccess(userId, roles),
      expiresIn: this.config.jwt.accessTtlSec,
      refreshToken,
      refreshExpiresAt,
    };
  }

  /**
   * Rotates a refresh token. Presenting an already-used (revoked) token revokes the whole
   * family — a sign the token was stolen.
   */
  async rotate(
    presented: string,
    userAgent?: string,
  ): Promise<{ userId: string; tokens: IssuedTokens }> {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(presented) },
      include: { user: { select: { roles: true, status: true } } },
    });
    if (!row) throw Errors.unauthorized('REFRESH_INVALID');
    if (row.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: row.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw Errors.unauthorized('REFRESH_REUSED');
    }
    if (row.expiresAt < new Date() || row.user.status !== 'ACTIVE')
      throw Errors.unauthorized('REFRESH_INVALID');

    const tokens = await this.issue(row.userId, row.user.roles, userAgent, row.familyId);
    const next = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(tokens.refreshToken) },
    });
    await this.prisma.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date(), replacedById: next?.id },
    });
    return { userId: row.userId, tokens };
  }

  async revoke(presented: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(presented), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
