import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { Errors } from '../../common/errors.js';
import { PrismaService } from '../../infra/prisma.service.js';
import { Prisma, type CompetePlayer } from '../../generated/prisma/client.js';
import { BLOCKED_COUNTRIES } from '../auth/restrictions.js';
import { CompeteAuditService } from './compete-audit.service.js';
import { CompeteTokensService, type CompeteTokens } from './compete-auth.js';
import type { CompeteLoginDto, CompetePlayerDto, CompeteRegisterDto } from './dto.js';

const ARGON = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };
const DUMMY_HASH = await hash('dummy-password-for-timing', ARGON);

export const toPlayerDto = (p: CompetePlayer): CompetePlayerDto => ({
  id: p.id,
  email: p.email,
  nickname: p.nickname,
  country: p.country,
  locale: p.locale,
  operatorId: p.operatorId,
});

/** Player accounts of the compete product (separate from prop-firm users, D98). */
@Injectable()
export class CompetePlayersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: CompeteTokensService,
    private readonly audit: CompeteAuditService,
  ) {}

  async register(
    dto: CompeteRegisterDto,
    operatorId: string,
    userAgent?: string,
  ): Promise<{ player: CompetePlayer; tokens: CompeteTokens }> {
    // Same blocklist as the platform (D13); gambling-specific geo rules per operator licence follow.
    if (BLOCKED_COUNTRIES.has(dto.country))
      throw Errors.unprocessable('COUNTRY_RESTRICTED', 'Not available in your country');
    const taken = await this.prisma.competePlayer.findUnique({
      where: { operatorId_nickname: { operatorId, nickname: dto.nickname } },
      select: { id: true },
    });
    if (taken) throw Errors.conflict('NICKNAME_TAKEN', 'This nickname is already taken');
    const passwordHash = await hash(dto.password, ARGON);
    try {
      const player = await this.prisma.$transaction(async (tx) => {
        const p = await tx.competePlayer.create({
          data: {
            operatorId,
            email: dto.email,
            passwordHash,
            nickname: dto.nickname,
            country: dto.country,
            locale: dto.locale,
            adultConfirmedAt: new Date(),
          },
        });
        await this.audit.append(tx, {
          actorType: 'USER',
          actorId: p.id,
          operatorId,
          action: 'compete.player.registered',
          entityType: 'CompetePlayer',
          entityId: p.id,
          data: {},
        });
        return p;
      });
      const tokens = await this.tokens.issue({ id: player.id, operatorId }, userAgent);
      return { player, tokens };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const target = String((e.meta as { target?: unknown } | undefined)?.target ?? '');
        if (target.includes('nickname'))
          throw Errors.conflict('NICKNAME_TAKEN', 'This nickname is already taken');
        throw Errors.conflict('EMAIL_TAKEN', 'An account with this email already exists');
      }
      throw e;
    }
  }

  async login(
    dto: CompeteLoginDto,
    operatorId: string,
    userAgent?: string,
  ): Promise<{ player: CompetePlayer; tokens: CompeteTokens }> {
    const player = await this.prisma.competePlayer.findUnique({
      where: { operatorId_email: { operatorId, email: dto.email } },
    });
    const ok = await verify(player?.passwordHash ?? DUMMY_HASH, dto.password);
    if (!player || !ok) throw Errors.unauthorized('INVALID_CREDENTIALS');
    if (player.status === 'SUSPENDED') throw Errors.forbidden('PLAYER_SUSPENDED');
    const tokens = await this.tokens.issue({ id: player.id, operatorId }, userAgent);
    return { player, tokens };
  }

  async byId(id: string): Promise<CompetePlayer> {
    const p = await this.prisma.competePlayer.findUnique({ where: { id } });
    if (!p) throw Errors.unauthorized();
    return p;
  }
}
