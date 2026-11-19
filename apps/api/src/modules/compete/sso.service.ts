import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { errors as joseErrors, jwtVerify } from 'jose';
import { Errors } from '../../common/errors.js';
import { PrismaService } from '../../infra/prisma.service.js';
import { RedisService } from '../../infra/redis.service.js';
import { Prisma, type CompeteOperator, type CompetePlayer } from '../../generated/prisma/client.js';
import { BLOCKED_COUNTRIES } from '../auth/restrictions.js';
import { CompeteAuditService } from './compete-audit.service.js';
import { CompeteTokensService, type CompeteTokens } from './compete-auth.js';
import { CompeteIntegrationService } from './integration.service.js';

/** Audience every operator SSO token must carry. */
export const SSO_AUDIENCE = 'dailyfunded-compete-sso';
/** Tokens may live at most this long (the operator signs one per click). */
const MAX_AGE_SEC = 300;
const NICK_RE = /^[A-Za-z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;
const LOCALES = new Set(['en', 'nl', 'es']);

interface SsoClaims {
  sub?: string;
  jti?: string;
  nickname?: unknown;
  email?: unknown;
  country?: unknown;
  locale?: unknown;
  adult?: unknown;
}

/**
 * Single sign-on from the operator's own website (D109). The operator's backend signs a
 * short-lived HS256 JWT with its secret: `iss` = operator slug, `aud` = SSO_AUDIENCE,
 * `sub` = its own user id, `jti` (single use), `exp` ≤ 5 min, `country` (ISO-2), `adult: true`,
 * optional `nickname`, `email`, `locale`. We create or find the player by (operator, sub)
 * and start a normal Compete session — the operator's users never need a second password.
 */
@Injectable()
export class CompeteSsoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly integration: CompeteIntegrationService,
    private readonly tokens: CompeteTokensService,
    private readonly audit: CompeteAuditService,
  ) {}

  async signIn(
    op: CompeteOperator,
    token: string,
    userAgent?: string,
  ): Promise<{ player: CompetePlayer; tokens: CompeteTokens }> {
    const secret = this.integration.ssoSecret(op);
    if (!secret) throw Errors.forbidden('SSO_DISABLED');
    let claims: SsoClaims;
    try {
      const { payload } = await jwtVerify(token, secret, {
        algorithms: ['HS256'],
        issuer: op.slug,
        audience: SSO_AUDIENCE,
        maxTokenAge: `${MAX_AGE_SEC}s`,
        requiredClaims: ['sub', 'jti', 'exp', 'iat'],
      });
      claims = payload as SsoClaims;
    } catch (e) {
      if (e instanceof joseErrors.JWTExpired) throw Errors.unauthorized('SSO_EXPIRED');
      throw Errors.unauthorized('SSO_INVALID');
    }
    const externalId = String(claims.sub);
    if (externalId.length < 1 || externalId.length > 128) throw Errors.unauthorized('SSO_INVALID');
    if (claims.adult !== true) throw Errors.unprocessable('ADULT_REQUIRED', 'Players must be 18+');
    const country = typeof claims.country === 'string' ? claims.country.toUpperCase() : '';
    if (!/^[A-Z]{2}$/.test(country)) throw Errors.unprocessable('SSO_COUNTRY_MISSING', 'country');
    if (BLOCKED_COUNTRIES.has(country))
      throw Errors.unprocessable('COUNTRY_RESTRICTED', 'Not available in your country');

    // Single use: a token can never be replayed (kept a little longer than its lifetime).
    const fresh = await this.redis.client.set(
      `compete:sso:jti:${op.id}:${String(claims.jti).slice(0, 128)}`,
      '1',
      'EX',
      MAX_AGE_SEC * 2,
      'NX',
    );
    if (fresh !== 'OK') throw Errors.unauthorized('SSO_REPLAYED');

    let player = await this.prisma.competePlayer.findUnique({
      where: { operatorId_externalId: { operatorId: op.id, externalId } },
    });
    if (!player) player = await this.create(op, externalId, claims, country);
    if (player.status !== 'ACTIVE') throw Errors.forbidden('PLAYER_SUSPENDED');
    const tokens = await this.tokens.issue({ id: player.id, operatorId: op.id }, userAgent);
    return { player, tokens };
  }

  private async create(
    op: CompeteOperator,
    externalId: string,
    claims: SsoClaims,
    country: string,
  ): Promise<CompetePlayer> {
    const wanted =
      typeof claims.nickname === 'string' && NICK_RE.test(claims.nickname)
        ? claims.nickname
        : `player_${randomInt(1000, 9999)}`;
    const email =
      typeof claims.email === 'string' && EMAIL_RE.test(claims.email)
        ? claims.email.toLowerCase()
        : null;
    const locale =
      typeof claims.locale === 'string' && LOCALES.has(claims.locale) ? claims.locale : 'en';
    let nickname = wanted;
    let useEmail = email !== null;
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const p = await tx.competePlayer.create({
            data: {
              operatorId: op.id,
              externalId,
              // An e-mail already used by a password account stays with that account.
              email: useEmail ? email : null,
              passwordHash: null,
              nickname,
              country,
              locale,
              adultConfirmedAt: new Date(),
            },
          });
          await this.audit.append(tx, {
            actorType: 'USER',
            actorId: p.id,
            operatorId: op.id,
            action: 'compete.player.registered_sso',
            entityType: 'CompetePlayer',
            entityId: p.id,
            data: {},
          });
          return p;
        });
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') throw e;
        const target = String((e.meta as { target?: unknown } | undefined)?.target ?? '');
        if (target.includes('externalId')) {
          // Two first clicks at once: the other request created the player.
          const p = await this.prisma.competePlayer.findUnique({
            where: { operatorId_externalId: { operatorId: op.id, externalId } },
          });
          if (p) return p;
        } else if (target.includes('email')) useEmail = false;
        else nickname = `${wanted.slice(0, 14)}_${randomInt(100, 99999)}`;
      }
    }
    throw Errors.conflict('NICKNAME_TAKEN', 'Could not find a free nickname');
  }
}
