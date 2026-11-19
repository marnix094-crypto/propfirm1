import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { Errors } from '../../common/errors.js';
import { Public } from '../auth/public.decorator.js';
import {
  CompeteAuthGuard,
  CompeteTokensService,
  Player,
  type CompeteTokens,
  type CompetePlayerCtx,
} from './compete-auth.js';
import { CompeteService } from './compete.service.js';
import { CompeteOperatorsService } from './operators.service.js';
import { CompetePlayersService, toPlayerDto } from './players.service.js';
import { CompeteSsoService } from './sso.service.js';
import { COMPETE_PAYMENTS, type CompetePaymentProvider } from './payments.js';
import {
  CompeteAuthResponseDto,
  CompeteEntryDto,
  CompeteHistoryItemDto,
  CompeteJoinResponseDto,
  CompeteLeaderboardDto,
  CompeteLoginDto,
  CompeteOperatorDto,
  CompeteOrderDto,
  CompetePlayerDto,
  CompeteRegisterDto,
  CompeteSsoDto,
  CompeteRoundDto,
  CompeteTestPaymentDto,
  CompeteTokenDto,
  PlaceCompeteOrderDto,
} from './dto.js';

export const COMPETE_REFRESH_COOKIE = 'compete_rt';
const COOKIE_PATH = '/api/v1/compete/auth';
const UUID = new ParseUUIDPipe({ version: '7' });

function requireIdempotencyKey(key: string | undefined): string {
  if (!key || !/^[A-Za-z0-9_-]{8,80}$/.test(key))
    throw Errors.unprocessable('IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required');
  return key;
}

/**
 * Compete product API (separate white-label product, D97). Every route is @Public() for the
 * prop-firm JWT guard; player routes use CompeteAuthGuard instead.
 */
@ApiTags('compete')
@Public()
@Controller('compete')
export class CompeteController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(COMPETE_PAYMENTS) private readonly payments: CompetePaymentProvider,
    private readonly compete: CompeteService,
    private readonly operators: CompeteOperatorsService,
    private readonly players: CompetePlayersService,
    private readonly tokens: CompeteTokensService,
    private readonly sso: CompeteSsoService,
  ) {}

  private setCookie(res: Response, t: CompeteTokens) {
    res.cookie(COMPETE_REFRESH_COOKIE, t.refreshToken, {
      httpOnly: true,
      secure: this.config.cookieSecure,
      sameSite: 'strict',
      path: COOKIE_PATH,
      expires: t.refreshExpiresAt,
    });
  }

  // ------------------------------------------------------------ public

  @Get('operator')
  @ApiOkResponse({ type: CompeteOperatorDto })
  async operator(@Req() req: Request): Promise<CompeteOperatorDto> {
    const { op, byHost } = await this.operators.resolve(req);
    return {
      slug: op.slug,
      name: op.name,
      onOwnHost: byHost,
      isExample: op.slug === this.config.compete.defaultOperatorSlug && !byHost,
      primaryColor: op.primaryColor,
      logoDataUrl: op.logoDataUrl,
      ssoEnabled: op.ssoEnabled && !!op.ssoSecretEnc,
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
      testPayments: this.payments.isTest,
    };
  }

  @Get('rounds/current')
  @ApiOkResponse({ type: CompeteRoundDto })
  async current(@Req() req: Request): Promise<CompeteRoundDto> {
    const op = await this.operators.fromRequest(req);
    return this.compete.currentRound(op.id);
  }

  @Get('rounds/recent')
  @ApiOkResponse({ type: [CompeteRoundDto] })
  async recent(@Req() req: Request, @Query('limit') limit?: string) {
    const op = await this.operators.fromRequest(req);
    return this.compete.recentRounds(op.id, Number(limit) || 10);
  }

  @Get('rounds/:id/leaderboard')
  @ApiOkResponse({ type: CompeteLeaderboardDto })
  async publicLeaderboard(@Req() req: Request, @Param('id', UUID) id: string) {
    const op = await this.operators.fromRequest(req);
    return this.compete.leaderboard(id, op.id);
  }

  // ------------------------------------------------------------ auth

  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  @Post('auth/register')
  @ApiCreatedResponse({ type: CompeteAuthResponseDto })
  async register(
    @Body() dto: CompeteRegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CompeteAuthResponseDto> {
    const op = await this.operators.fromRequest(req);
    const { player, tokens } = await this.players.register(dto, op.id, req.headers['user-agent']);
    this.setCookie(res, tokens);
    return {
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      player: toPlayerDto(player),
    };
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('auth/login')
  @HttpCode(200)
  @ApiOkResponse({ type: CompeteAuthResponseDto })
  async login(
    @Body() dto: CompeteLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CompeteAuthResponseDto> {
    const op = await this.operators.fromRequest(req);
    const { player, tokens } = await this.players.login(dto, op.id, req.headers['user-agent']);
    this.setCookie(res, tokens);
    return {
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      player: toPlayerDto(player),
    };
  }

  /** Single sign-on from the operator's website (D109): exchanges its signed token for a session. */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('auth/sso')
  @HttpCode(200)
  @ApiOkResponse({ type: CompeteAuthResponseDto })
  async ssoSignIn(
    @Body() dto: CompeteSsoDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CompeteAuthResponseDto> {
    const op = await this.operators.fromRequest(req);
    const { player, tokens } = await this.sso.signIn(op, dto.token, req.headers['user-agent']);
    this.setCookie(res, tokens);
    return {
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      player: toPlayerDto(player),
    };
  }

  @Post('auth/refresh')
  @HttpCode(200)
  @ApiOkResponse({ type: CompeteTokenDto })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CompeteTokenDto> {
    const presented = (req.cookies as Record<string, string> | undefined)?.[COMPETE_REFRESH_COOKIE];
    if (!presented) throw Errors.unauthorized('REFRESH_MISSING');
    const { tokens } = await this.tokens.rotate(presented, req.headers['user-agent']);
    this.setCookie(res, tokens);
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn };
  }

  @Post('auth/logout')
  @HttpCode(204)
  @ApiNoContentResponse()
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const presented = (req.cookies as Record<string, string> | undefined)?.[COMPETE_REFRESH_COOKIE];
    if (presented) await this.tokens.revoke(presented);
    res.clearCookie(COMPETE_REFRESH_COOKIE, { path: COOKIE_PATH });
  }

  // ------------------------------------------------------------ player

  @UseGuards(CompeteAuthGuard)
  @ApiBearerAuth()
  @Get('me')
  @ApiOkResponse({ type: CompetePlayerDto })
  async me(@Player() p: CompetePlayerCtx): Promise<CompetePlayerDto> {
    return toPlayerDto(await this.players.byId(p.id));
  }

  @UseGuards(CompeteAuthGuard)
  @ApiBearerAuth()
  @Get('me/round')
  @ApiOkResponse({ type: CompeteRoundDto, description: 'Current round with my entry' })
  myRound(@Player() p: CompetePlayerCtx): Promise<CompeteRoundDto> {
    return this.compete.currentRound(p.operatorId, p.id);
  }

  @UseGuards(CompeteAuthGuard)
  @ApiBearerAuth()
  @Get('me/history')
  @ApiOkResponse({ type: [CompeteHistoryItemDto] })
  history(@Player() p: CompetePlayerCtx) {
    return this.compete.history(p.id);
  }

  @UseGuards(CompeteAuthGuard)
  @ApiBearerAuth()
  @Get('me/rounds/:id')
  @ApiOkResponse({ type: CompeteRoundDto })
  myRoundById(@Player() p: CompetePlayerCtx, @Param('id', UUID) id: string) {
    return this.compete.round(id, p.operatorId, p.id);
  }

  @UseGuards(CompeteAuthGuard)
  @ApiBearerAuth()
  @Get('me/rounds/:id/leaderboard')
  @ApiOkResponse({ type: CompeteLeaderboardDto })
  myLeaderboard(@Player() p: CompetePlayerCtx, @Param('id', UUID) id: string) {
    return this.compete.leaderboard(id, p.operatorId, p.id);
  }

  @UseGuards(CompeteAuthGuard)
  @ApiBearerAuth()
  @Post('rounds/:id/entries')
  @ApiCreatedResponse({ type: CompeteJoinResponseDto })
  async join(
    @Player() p: CompetePlayerCtx,
    @Param('id', UUID) id: string,
    @Headers('idempotency-key') key?: string,
  ): Promise<CompeteJoinResponseDto> {
    requireIdempotencyKey(key);
    const player = await this.players.byId(p.id);
    return this.compete.join(id, { ...p, locale: player.locale, country: player.country });
  }

  @UseGuards(CompeteAuthGuard)
  @ApiBearerAuth()
  @Post('entries/:id/test-payment')
  @HttpCode(200)
  @ApiOkResponse({ type: CompeteEntryDto, description: 'Fake provider only (dev/test)' })
  testPayment(
    @Player() p: CompetePlayerCtx,
    @Param('id', UUID) id: string,
    @Body() dto: CompeteTestPaymentDto,
    @Headers('idempotency-key') key?: string,
  ) {
    requireIdempotencyKey(key);
    return this.compete.testPayment(id, p.id, dto.outcome);
  }

  @UseGuards(CompeteAuthGuard)
  @ApiBearerAuth()
  @Get('entries/:id')
  @ApiOkResponse({ type: CompeteEntryDto })
  entry(@Player() p: CompetePlayerCtx, @Param('id', UUID) id: string) {
    return this.compete.entry(id, p.id);
  }

  @UseGuards(CompeteAuthGuard)
  @ApiBearerAuth()
  @Get('entries/:id/orders')
  @ApiOkResponse({ type: [CompeteOrderDto] })
  orders(@Player() p: CompetePlayerCtx, @Param('id', UUID) id: string) {
    return this.compete.orders(id, p.id);
  }

  @UseGuards(CompeteAuthGuard)
  @ApiBearerAuth()
  @Post('entries/:id/orders')
  @ApiCreatedResponse({ type: CompeteOrderDto })
  placeOrder(
    @Player() p: CompetePlayerCtx,
    @Param('id', UUID) id: string,
    @Body() dto: PlaceCompeteOrderDto,
    @Headers('idempotency-key') key?: string,
  ) {
    requireIdempotencyKey(key);
    return this.compete.placeOrder(id, p.id, dto);
  }

  @UseGuards(CompeteAuthGuard)
  @ApiBearerAuth()
  @Post('entries/:id/positions/:symbol/close')
  @ApiCreatedResponse({ type: CompeteOrderDto })
  closePosition(
    @Player() p: CompetePlayerCtx,
    @Param('id', UUID) id: string,
    @Param('symbol') symbol: string,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.compete.closePosition(id, p.id, symbol, `close-${requireIdempotencyKey(key)}`);
  }
}
