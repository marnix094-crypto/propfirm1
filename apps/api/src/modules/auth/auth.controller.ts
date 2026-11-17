import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { Errors } from '../../common/errors.js';
import { AuthService, toUserDto } from './auth.service.js';
import { CurrentUser, type AuthUser } from './current-user.decorator.js';
import { AuthResponseDto, LoginDto, RegisterDto, UserDto } from './dto.js';
import { Public } from './public.decorator.js';
import { TokensService, type IssuedTokens } from './tokens.service.js';

export const REFRESH_COOKIE = 'brand_rt';
const COOKIE_PATH = '/api/v1/auth';

@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly auth: AuthService,
    private readonly tokens: TokensService,
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
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn, user: toUserDto(user) };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('auth/login')
  @HttpCode(200)
  @ApiOkResponse({ type: AuthResponseDto })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const { user, tokens } = await this.auth.login(dto, req.headers['user-agent']);
    this.setRefreshCookie(res, tokens);
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn, user: toUserDto(user) };
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
    const presented = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    if (!presented) throw Errors.unauthorized('REFRESH_MISSING');
    const { userId, tokens } = await this.tokens.rotate(presented, req.headers['user-agent']);
    this.setRefreshCookie(res, tokens);
    return {
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      user: toUserDto(await this.auth.me(userId)),
    };
  }

  @Public()
  @Post('auth/logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const presented = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    if (presented) await this.tokens.revoke(presented);
    res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
  }

  @Get('me')
  @ApiOkResponse({ type: UserDto })
  async me(@CurrentUser() user: AuthUser): Promise<UserDto> {
    return toUserDto(await this.auth.me(user.id));
  }
}
