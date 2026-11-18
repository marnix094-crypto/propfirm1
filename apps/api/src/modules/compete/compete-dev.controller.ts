import { Body, Controller, Inject, Post, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { Request } from 'express';
import { hash } from '@node-rs/argon2';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { Errors } from '../../common/errors.js';
import { PrismaService } from '../../infra/prisma.service.js';
import { Public } from '../auth/public.decorator.js';
import { CompeteService } from './compete.service.js';
import { CompeteOperatorsService } from './operators.service.js';

class DevRoundDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(86_400) startsInSec!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(10) @Max(86_400) durationSec?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(3) @Max(10_000) minParticipants?: number;
}
class DevOperatorDto {
  @Matches(/^[a-z0-9-]{1,40}$/) slug!: string;
  @IsOptional() @IsString() @MaxLength(60) name?: string;
}
class DevStaffDto {
  @IsString() @MaxLength(254) email!: string;
  @IsString() @MaxLength(128) password!: string;
  @IsOptional() @Matches(/^[a-z0-9-]{1,40}$/) operatorSlug?: string;
}
class DevTickDto {
  @IsOptional() @IsISO8601() at?: string;
}
class DevBotsDto {
  @IsUUID() roundId!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(200) count!: number;
}

/** Dev/test helpers for the compete product. Only with DEV_TOOLS_ENABLED (refused in production). */
@ApiExcludeController()
@Public()
@Controller('compete/dev')
export class CompeteDevController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly compete: CompeteService,
    private readonly operators: CompeteOperatorsService,
  ) {}

  private guard() {
    if (!this.config.devToolsEnabled) throw Errors.notFound('Route');
  }

  /** Creates (or returns) an operator, e.g. an isolated tenant per e2e test. */
  @Post('operators')
  async operator(@Body() dto: DevOperatorDto) {
    this.guard();
    const op = await this.prisma.competeOperator.upsert({
      where: { slug: dto.slug },
      create: { slug: dto.slug, name: dto.name ?? dto.slug },
      update: {},
    });
    return { id: op.id, slug: op.slug };
  }

  /** Staff account with a password (no invite link): owner of an operator, or superadmin. */
  @Post('staff')
  async staff(@Body() dto: DevStaffDto) {
    this.guard();
    const op = dto.operatorSlug
      ? await this.prisma.competeOperator.upsert({
          where: { slug: dto.operatorSlug },
          create: { slug: dto.operatorSlug, name: dto.operatorSlug },
          update: {},
        })
      : null;
    const passwordHash = await hash(dto.password, {
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
    const s = await this.prisma.competeStaff.upsert({
      where: { email: dto.email.toLowerCase() },
      create: {
        email: dto.email.toLowerCase(),
        passwordHash,
        role: op ? 'OWNER' : 'SUPERADMIN',
        operatorId: op?.id ?? null,
      },
      update: { passwordHash },
    });
    return { id: s.id, role: s.role, operatorId: s.operatorId };
  }

  /** Creates a round that starts soon (shorter duration / lower minimum for testing). */
  @Post('rounds')
  async round(@Req() req: Request, @Body() dto: DevRoundDto) {
    this.guard();
    const op = await this.operators.fromRequest(req);
    const startsAt = new Date(Math.ceil((Date.now() + dto.startsInSec * 1000) / 1000) * 1000);
    const round = await this.compete.createRound(op, startsAt, {
      endsAt: new Date(startsAt.getTime() + (dto.durationSec ?? op.durationMinutes * 60) * 1000),
      ...(dto.minParticipants ? { minParticipants: dto.minParticipants } : {}),
    });
    return {
      id: round.id,
      startsAt: round.startsAt.toISOString(),
      endsAt: round.endsAt.toISOString(),
    };
  }

  /** Runs one scheduler tick, optionally "at" a given time. */
  @Post('tick')
  async tick(@Body() dto: DevTickDto) {
    this.guard();
    await this.compete.tick(dto.at ? Date.parse(dto.at) : Date.now());
    return { ok: true };
  }

  /** Adds paid example players ("bots") to a round so it reaches its minimum in dev. */
  @Post('bots')
  async bots(@Body() dto: DevBotsDto) {
    this.guard();
    const round = await this.prisma.competeRound.findUnique({ where: { id: dto.roundId } });
    if (!round || round.status !== 'OPEN') throw Errors.unprocessable('ROUND_CLOSED');
    const passwordHash = await hash(`bot-${Date.now()}-unused`, {
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
    const base = await this.prisma.competePlayer.count({ where: { operatorId: round.operatorId } });
    const ids: string[] = [];
    for (let i = 0; i < dto.count; i++) {
      const n = base + i;
      const p = await this.prisma.competePlayer.create({
        data: {
          operatorId: round.operatorId,
          email: `bot${n}-${round.id.slice(-6)}@example.invalid`,
          passwordHash,
          nickname: `bot_${round.id.slice(-4)}_${n}`.slice(0, 20),
          country: 'NL',
          adultConfirmedAt: new Date(),
        },
      });
      await this.compete.join(round.id, {
        id: p.id,
        operatorId: round.operatorId,
        locale: 'en',
        country: 'NL',
      });
      const entry = await this.prisma.competeEntry.findUniqueOrThrow({
        where: { roundId_playerId: { roundId: round.id, playerId: p.id } },
      });
      await this.compete.testPayment(entry.id, p.id, 'succeeded');
      ids.push(entry.id);
    }
    return { entryIds: ids };
  }
}
