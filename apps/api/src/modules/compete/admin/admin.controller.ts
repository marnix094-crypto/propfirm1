import {
  createParamDecorator,
  type ExecutionContext,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiQuery,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../../../config/env.js';
import { Errors } from '../../../common/errors.js';
import { PrismaService } from '../../../infra/prisma.service.js';
import { Public } from '../../auth/public.decorator.js';
import { CompeteAdminService } from './admin.service.js';
import {
  AllowPendingMfa,
  CompeteAdminGuard,
  CompeteStaffTokens,
  Staff,
  SuperadminOnly,
  type StaffCtx,
  type StaffTokens,
} from './staff-auth.js';
import {
  CompeteAdminAuditPageDto,
  CompeteAdminAuthDto,
  CompeteAdminInviteDto,
  CompeteAdminLoginDto,
  CompeteAdminMarkPaidDto,
  CompeteAdminOperatorDto,
  CompeteAdminOverviewDto,
  CompeteAdminPayoutDto,
  CompeteAdminPlayerPageDto,
  CompeteAdminReasonDto,
  CompeteAdminRoundDetailDto,
  CompeteAdminRoundSummaryDto,
  CompeteAdminSettingsDto,
  CompeteAdminSetupPasswordDto,
  CompeteAdminTokenDto,
  CompeteOperatorStatusDto,
  CompeteStaffDto,
  CompeteTwoFactorCodeDto,
  CompeteTwoFactorSetupDto,
  CreateCompeteOperatorDto,
  UpdateCompeteSettingsDto,
} from './dto.js';

const COOKIE = 'compete_admin_rt';
const COOKIE_PATH = '/api/v1/compete/admin/auth';
const UUID = new ParseUUIDPipe({ version: '7' });
/** Superadmins: slug of the operator to administer (ignored for owners). */
const OperatorChoice = createParamDecorator((_d: unknown, ctx: ExecutionContext) => {
  const h = ctx.switchToHttp().getRequest<Request>().headers['x-compete-admin-operator'];
  return Array.isArray(h) ? h[0] : h;
});

/**
 * Compete admin panel API (D104). Separate from the prop-firm admin (/admin) and from players.
 * @Public() only opts out of the prop-firm JWT guard; CompeteAdminGuard protects the routes.
 */
@ApiTags('compete-admin')
@ApiHeader({
  name: 'X-Compete-Admin-Operator',
  required: false,
  description: 'Superadmins only: slug of the operator to administer',
})
@Public()
@Controller('compete/admin')
export class CompeteAdminController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly admin: CompeteAdminService,
    private readonly tokens: CompeteStaffTokens,
    private readonly prisma: PrismaService,
  ) {}

  private setCookie(res: Response, t: StaffTokens) {
    res.cookie(COOKIE, t.refreshToken, {
      httpOnly: true,
      secure: this.config.cookieSecure,
      sameSite: 'strict',
      path: COOKIE_PATH,
      expires: t.refreshExpiresAt,
    });
  }

  // ------------------------------------------------------------ auth

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('auth/login')
  @HttpCode(200)
  @ApiOkResponse({ type: CompeteAdminAuthDto })
  async login(
    @Body() dto: CompeteAdminLoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CompeteAdminAuthDto> {
    const { staff, tokens } = await this.admin.login(dto.email, dto.password, dto.code);
    this.setCookie(res, tokens);
    return {
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      staff: await this.admin.staffDto(staff),
    };
  }

  @Post('auth/refresh')
  @HttpCode(200)
  @ApiOkResponse({ type: CompeteAdminTokenDto })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CompeteAdminTokenDto> {
    const presented = (req.cookies as Record<string, string> | undefined)?.[COOKIE];
    if (!presented) throw Errors.unauthorized('REFRESH_MISSING');
    const t = await this.tokens.rotate(presented);
    this.setCookie(res, t);
    return { accessToken: t.accessToken, expiresIn: t.expiresIn };
  }

  @Post('auth/logout')
  @HttpCode(204)
  @ApiNoContentResponse()
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const presented = (req.cookies as Record<string, string> | undefined)?.[COOKIE];
    if (presented) await this.tokens.revoke(presented);
    res.clearCookie(COOKIE, { path: COOKIE_PATH });
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('auth/setup')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Set the password from an invite / reset link' })
  async setup(@Body() dto: CompeteAdminSetupPasswordDto) {
    await this.admin.setupPassword(dto.token, dto.password);
  }

  @UseGuards(CompeteAdminGuard)
  @AllowPendingMfa()
  @ApiBearerAuth()
  @Get('me')
  @ApiOkResponse({ type: CompeteStaffDto })
  async me(@Staff() s: StaffCtx): Promise<CompeteStaffDto> {
    return this.admin.staffDto(
      await this.prisma.competeStaff.findUniqueOrThrow({ where: { id: s.id } }),
    );
  }

  @UseGuards(CompeteAdminGuard)
  @AllowPendingMfa()
  @ApiBearerAuth()
  @Post('2fa/setup')
  @ApiCreatedResponse({ type: CompeteTwoFactorSetupDto })
  twoFactorSetup(@Staff() s: StaffCtx) {
    return this.admin.twoFactorSetup(s);
  }

  @UseGuards(CompeteAdminGuard)
  @AllowPendingMfa()
  @ApiBearerAuth()
  @Post('2fa/enable')
  @HttpCode(204)
  @ApiNoContentResponse()
  async twoFactorEnable(@Staff() s: StaffCtx, @Body() dto: CompeteTwoFactorCodeDto) {
    await this.admin.twoFactorEnable(s, dto.code);
  }

  // ------------------------------------------------------------ operator scoped

  @UseGuards(CompeteAdminGuard)
  @ApiBearerAuth()
  @Get('overview')
  @ApiOkResponse({ type: CompeteAdminOverviewDto })
  async overview(@Staff() s: StaffCtx, @OperatorChoice() op?: string) {
    return this.admin.overview(await this.admin.scope(s, op));
  }

  @UseGuards(CompeteAdminGuard)
  @ApiBearerAuth()
  @Get('rounds')
  @ApiQuery({ name: 'cursor', required: false })
  @ApiOkResponse({ type: [CompeteAdminRoundSummaryDto] })
  async rounds(
    @Staff() s: StaffCtx,
    @OperatorChoice() op?: string,
    @Query('cursor') cursor?: string,
  ) {
    return (await this.admin.rounds(await this.admin.scope(s, op), cursor)).items;
  }

  @UseGuards(CompeteAdminGuard)
  @ApiBearerAuth()
  @Get('rounds/:id')
  @ApiOkResponse({ type: CompeteAdminRoundDetailDto })
  async round(@Staff() s: StaffCtx, @Param('id', UUID) id: string, @OperatorChoice() op?: string) {
    return this.admin.round(await this.admin.scope(s, op), id);
  }

  @UseGuards(CompeteAdminGuard)
  @ApiBearerAuth()
  @Get('players')
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiOkResponse({ type: CompeteAdminPlayerPageDto })
  async players(
    @Staff() s: StaffCtx,
    @OperatorChoice() op?: string,
    @Query('q') q?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.admin.players(await this.admin.scope(s, op), q, cursor);
  }

  @UseGuards(CompeteAdminGuard)
  @ApiBearerAuth()
  @Post('players/:id/suspend')
  @HttpCode(204)
  @ApiNoContentResponse()
  async suspend(
    @Staff() s: StaffCtx,
    @Param('id', UUID) id: string,
    @Body() dto: CompeteAdminReasonDto,
    @OperatorChoice() op?: string,
  ) {
    await this.admin.setPlayerStatus(s, await this.admin.scope(s, op), id, 'SUSPENDED', dto.reason);
  }

  @UseGuards(CompeteAdminGuard)
  @ApiBearerAuth()
  @Post('players/:id/reactivate')
  @HttpCode(204)
  @ApiNoContentResponse()
  async reactivate(
    @Staff() s: StaffCtx,
    @Param('id', UUID) id: string,
    @Body() dto: CompeteAdminReasonDto,
    @OperatorChoice() op?: string,
  ) {
    await this.admin.setPlayerStatus(s, await this.admin.scope(s, op), id, 'ACTIVE', dto.reason);
  }

  @UseGuards(CompeteAdminGuard)
  @ApiBearerAuth()
  @Get('payouts')
  @ApiQuery({ name: 'status', required: false, enum: ['AWAITING_PAYOUT', 'SUCCEEDED'] })
  @ApiOkResponse({ type: [CompeteAdminPayoutDto] })
  async payouts(
    @Staff() s: StaffCtx,
    @OperatorChoice() op?: string,
    @Query('status') status?: string,
  ) {
    return this.admin.payouts(
      await this.admin.scope(s, op),
      status === 'SUCCEEDED' ? 'SUCCEEDED' : 'AWAITING_PAYOUT',
    );
  }

  @UseGuards(CompeteAdminGuard)
  @ApiBearerAuth()
  @Post('payouts/:id/mark-paid')
  @HttpCode(204)
  @ApiNoContentResponse()
  async markPaid(
    @Staff() s: StaffCtx,
    @Param('id', UUID) id: string,
    @Body() dto: CompeteAdminMarkPaidDto,
    @OperatorChoice() op?: string,
  ) {
    await this.admin.markPaid(s, await this.admin.scope(s, op), id, dto.reference);
  }

  @UseGuards(CompeteAdminGuard)
  @ApiBearerAuth()
  @Get('settings')
  @ApiOkResponse({ type: CompeteAdminSettingsDto })
  async settings(@Staff() s: StaffCtx, @OperatorChoice() op?: string) {
    return this.admin.settings(await this.admin.scope(s, op));
  }

  @UseGuards(CompeteAdminGuard)
  @ApiBearerAuth()
  @Put('settings')
  @ApiOkResponse({ type: CompeteAdminSettingsDto })
  async updateSettings(
    @Staff() s: StaffCtx,
    @Body() dto: UpdateCompeteSettingsDto,
    @OperatorChoice() op?: string,
  ) {
    return this.admin.updateSettings(s, await this.admin.scope(s, op), dto);
  }

  @UseGuards(CompeteAdminGuard)
  @ApiBearerAuth()
  @Get('audit')
  @ApiQuery({ name: 'cursor', required: false })
  @ApiOkResponse({ type: CompeteAdminAuditPageDto })
  async audit(
    @Staff() s: StaffCtx,
    @OperatorChoice() op?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.admin.auditLog(await this.admin.scope(s, op), cursor);
  }

  // ------------------------------------------------------------ superadmin

  @UseGuards(CompeteAdminGuard)
  @SuperadminOnly()
  @ApiBearerAuth()
  @Get('operators')
  @ApiOkResponse({ type: [CompeteAdminOperatorDto] })
  operators() {
    return this.admin.listOperators();
  }

  @UseGuards(CompeteAdminGuard)
  @SuperadminOnly()
  @ApiBearerAuth()
  @Post('operators')
  @ApiCreatedResponse({ type: CompeteAdminInviteDto })
  createOperator(@Staff() s: StaffCtx, @Body() dto: CreateCompeteOperatorDto) {
    return this.admin.createOperator(s, dto.slug, dto.name, dto.ownerEmail);
  }

  @UseGuards(CompeteAdminGuard)
  @SuperadminOnly()
  @ApiBearerAuth()
  @Post('operators/:id/status')
  @HttpCode(200)
  @ApiOkResponse({ type: CompeteAdminOperatorDto })
  setStatus(
    @Staff() s: StaffCtx,
    @Param('id', UUID) id: string,
    @Body() dto: CompeteOperatorStatusDto,
  ) {
    return this.admin.setOperatorStatus(s, id, dto.status);
  }

  @UseGuards(CompeteAdminGuard)
  @SuperadminOnly()
  @ApiBearerAuth()
  @Post('operators/:id/owner/reinvite')
  @ApiCreatedResponse({ type: CompeteAdminInviteDto })
  reinvite(@Staff() s: StaffCtx, @Param('id', UUID) id: string) {
    return this.admin.reinviteOwner(s, id);
  }
}
