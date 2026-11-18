import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { Errors } from '../../common/errors.js';
import { PrismaService } from '../../infra/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthService } from './auth.service.js';
import { CurrentUser, type AuthUser } from './current-user.decorator.js';
import {
  AuthResponseDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  LoginResponseDto,
  MfaVerifyDto,
  RecoveryCodesDto,
  RegisterDto,
  ResetPasswordDto,
  SessionDto,
  TokenDto,
  TwoFactorCodeDto,
  TwoFactorDisableDto,
  TwoFactorSetupDto,
  UserDto,
} from './dto.js';
import { Public } from './public.decorator.js';
import { TokensService, type IssuedTokens } from './tokens.service.js';
import { TwoFactorService } from './two-factor.service.js';

export const REFRESH_COOKIE = 'brand_rt';
const COOKIE_PATH = '/api/v1/auth';
const cookieOf = (req: Request) =>
  (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];

@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly auth: AuthService,
    private readonly tokens: TokensService,
    private readonly twoFactor: TwoFactorService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private setRefreshCookie(res: Response, t: IssuedTokens) {
    res.cookie(REFRESH_COOKIE, t.refreshToken, {
      httpOnly: true,
      secure: this.config.cookieSecure,
      sameSite: 'strict',
      path: COOKIE_PATH,
      expires: t.refreshExpiresAt,
    });
  }

  // ------------------------------------------------------------ sign up / in

  @Public()
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  @Post('auth/register')
  @ApiCreatedResponse({ type: AuthResponseDto })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const { user, tokens } = await this.auth.register(dto, req.headers['user-agent']);
    this.setRefreshCookie(res, tokens);
    return {
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      user: await this.auth.userDto(user),
    };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('auth/login')
  @HttpCode(200)
  @ApiOkResponse({
    type: LoginResponseDto,
    description: 'Tokens, or { mfaRequired, mfaToken } when 2FA is enabled',
  })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const r = await this.auth.login(dto, req.headers['user-agent']);
    if ('mfaToken' in r) return { mfaRequired: true, mfaToken: r.mfaToken };
    this.setRefreshCookie(res, r.tokens);
    return {
      accessToken: r.tokens.accessToken,
      expiresIn: r.tokens.expiresIn,
      user: await this.auth.userDto(r.user),
    };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('auth/2fa/verify')
  @HttpCode(200)
  @ApiOkResponse({ type: AuthResponseDto })
  async verifyMfa(
    @Body() dto: MfaVerifyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    if (!dto.code && !dto.recoveryCode)
      throw Errors.unprocessable('TWO_FACTOR_CODE_INVALID', 'Enter a code');
    const { user, tokens } = await this.auth.completeMfa(
      dto.mfaToken,
      dto.code,
      dto.recoveryCode,
      req.headers['user-agent'],
    );
    this.setRefreshCookie(res, tokens);
    return {
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      user: await this.auth.userDto(user),
    };
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('auth/refresh')
  @HttpCode(200)
  @ApiOkResponse({ type: AuthResponseDto })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const presented = cookieOf(req);
    if (!presented) throw Errors.unauthorized('REFRESH_MISSING');
    const { userId, tokens } = await this.tokens.rotate(presented, req.headers['user-agent']);
    this.setRefreshCookie(res, tokens);
    return {
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      user: await this.auth.userDto(await this.auth.me(userId)),
    };
  }

  @Public()
  @Post('auth/logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const presented = cookieOf(req);
    if (presented) await this.tokens.revoke(presented);
    res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
  }

  // ------------------------------------------------------------ email & password recovery

  @Public()
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @Post('auth/verify-email')
  @HttpCode(204)
  async verifyEmail(@Body() dto: TokenDto): Promise<void> {
    await this.auth.verifyEmail(dto.token);
  }

  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  @Post('auth/verify-email/resend')
  @HttpCode(204)
  async resendVerification(@CurrentUser() u: AuthUser): Promise<void> {
    await this.auth.sendVerification(await this.auth.me(u.id));
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @Post('auth/password/forgot')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Always 204, whether or not the email exists' })
  async forgot(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.auth.forgotPassword(dto.email);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @Post('auth/password/reset')
  @HttpCode(204)
  async reset(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.auth.resetPassword(dto.token, dto.password);
  }

  // ------------------------------------------------------------ me

  @Get('me')
  @ApiOkResponse({ type: UserDto })
  async me(@CurrentUser() user: AuthUser): Promise<UserDto> {
    return this.auth.userDto(await this.auth.me(user.id));
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('me/password')
  @HttpCode(204)
  async changePassword(
    @CurrentUser() u: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.auth.changePassword(u.id, dto, await this.tokens.familyOf(cookieOf(req)));
  }

  @Post('me/2fa/setup')
  @HttpCode(200)
  @ApiOkResponse({ type: TwoFactorSetupDto })
  async setup2fa(@CurrentUser() u: AuthUser): Promise<TwoFactorSetupDto> {
    const user = await this.auth.me(u.id);
    return this.twoFactor.setup(u.id, user.email);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('me/2fa/enable')
  @HttpCode(200)
  @ApiOkResponse({ type: RecoveryCodesDto })
  async enable2fa(
    @CurrentUser() u: AuthUser,
    @Body() dto: TwoFactorCodeDto,
  ): Promise<RecoveryCodesDto> {
    return { recoveryCodes: await this.twoFactor.enable(u.id, dto.code) };
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('me/2fa/disable')
  @HttpCode(204)
  async disable2fa(@CurrentUser() u: AuthUser, @Body() dto: TwoFactorDisableDto): Promise<void> {
    // Step-up: password AND a current code.
    if (!(await this.auth.checkPassword(u.id, dto.password)))
      throw Errors.unprocessable('PASSWORD_INCORRECT', 'Password is incorrect');
    if (!(await this.twoFactor.verify(u.id, dto.code)))
      throw Errors.unprocessable('TWO_FACTOR_CODE_INVALID', 'The code is not valid');
    await this.twoFactor.disable(u.id);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('me/2fa/recovery-codes')
  @HttpCode(200)
  @ApiOkResponse({ type: RecoveryCodesDto })
  async recoveryCodes(
    @CurrentUser() u: AuthUser,
    @Body() dto: TwoFactorCodeDto,
  ): Promise<RecoveryCodesDto> {
    if (!(await this.twoFactor.verify(u.id, dto.code)))
      throw Errors.unprocessable('TWO_FACTOR_CODE_INVALID', 'The code is not valid');
    return { recoveryCodes: await this.twoFactor.regenerateRecoveryCodes(u.id) };
  }

  /** Active sessions = refresh-token families with a live (unrevoked, unexpired) token. */
  @Get('me/sessions')
  @ApiOkResponse({ type: [SessionDto] })
  async sessions(@CurrentUser() u: AuthUser, @Req() req: Request): Promise<SessionDto[]> {
    const current = await this.tokens.familyOf(cookieOf(req));
    const live = await this.prisma.refreshToken.findMany({
      where: { userId: u.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    const firsts = await this.prisma.refreshToken.groupBy({
      by: ['familyId'],
      where: { familyId: { in: live.map((l) => l.familyId) } },
      _min: { createdAt: true },
    });
    const startedAt = new Map(firsts.map((f) => [f.familyId, f._min.createdAt!]));
    return live.map((l) => ({
      id: l.familyId,
      userAgent: l.userAgent ?? null,
      createdAt: (startedAt.get(l.familyId) ?? l.createdAt).toISOString(),
      lastUsedAt: l.createdAt.toISOString(),
      current: l.familyId === current,
    }));
  }

  @Delete('me/sessions/:id')
  @HttpCode(204)
  async revokeSession(
    @CurrentUser() u: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    const n = await this.tokens.revokeFamily(u.id, id);
    if (n === 0) throw Errors.notFound('Session');
    await this.prisma.$transaction((tx) =>
      this.audit.append(tx, {
        actorType: 'USER',
        actorId: u.id,
        action: 'user.session_revoked',
        entityType: 'User',
        entityId: u.id,
        data: { sessionId: id },
      }),
    );
  }
}
