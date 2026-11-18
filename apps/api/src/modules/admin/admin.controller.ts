import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  Admin,
  ADMIN_FIRM_HEADER,
  AdminGuard,
  AdminRoles,
  AllowWithout2fa,
  SuperadminOnly,
  type AdminContext,
} from './admin.guard.js';
import { AdminService } from './admin.service.js';
import { AdminCatalogService } from './admin-catalog.service.js';
import { AdminFirmService } from './admin-firm.service.js';
import {
  AccountQuery,
  AdminAccountDto,
  AdminAccountPageDto,
  AdminAlertPageDto,
  AdminAuditPageDto,
  AdminFirmDto,
  AdminFirmListDto,
  AdminMeDto,
  AdminOverviewDto,
  AdminProductDto,
  AdminProductListDto,
  AdminRuleSetDto,
  AdminRuleSetListDto,
  AdminTraderDetailDto,
  AdminTraderPageDto,
  AlertQuery,
  AuditQuery,
  AuditVerifyDto,
  CreateFirmDto,
  CreateProductDto,
  CreateRuleSetDto,
  FirmStatusDto,
  InviteMemberDto,
  ReasonDto,
  TeamListDto,
  TraderQuery,
  UpdateBrandingDto,
  UpdateMemberDto,
  UpdateProductDto,
} from './dto.js';

const UUID = new ParseUUIDPipe();

/** Admin panel for firm staff and platform superadmins (D84–D90). */
@ApiTags('admin')
@ApiHeader({
  name: ADMIN_FIRM_HEADER,
  required: false,
  description: 'Superadmins only: id of the firm to administer',
})
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly catalog: AdminCatalogService,
    private readonly firm: AdminFirmService,
  ) {}

  @AllowWithout2fa()
  @Get('me')
  @ApiOkResponse({ type: AdminMeDto })
  me(@Admin() ctx: AdminContext) {
    return this.admin.me(ctx);
  }

  @Get('overview')
  @ApiOkResponse({ type: AdminOverviewDto })
  overview(@Admin() ctx: AdminContext) {
    return this.admin.overview(ctx);
  }

  // -------------------------------------------------------------- traders
  @Get('traders')
  @ApiOkResponse({ type: AdminTraderPageDto })
  traders(@Admin() ctx: AdminContext, @Query() q: TraderQuery) {
    return this.admin.traders(ctx, q);
  }

  @Get('traders/:id')
  @ApiOkResponse({ type: AdminTraderDetailDto })
  trader(@Admin() ctx: AdminContext, @Param('id', UUID) id: string) {
    return this.admin.trader(ctx, id);
  }

  @AdminRoles('OWNER', 'ADMIN')
  @Post('traders/:id/suspend')
  @HttpCode(200)
  @ApiOkResponse({ type: AdminTraderDetailDto })
  suspend(@Admin() ctx: AdminContext, @Param('id', UUID) id: string, @Body() dto: ReasonDto) {
    return this.admin.setTraderStatus(ctx, id, 'SUSPENDED', dto.reason);
  }

  @AdminRoles('OWNER', 'ADMIN')
  @Post('traders/:id/reactivate')
  @HttpCode(200)
  @ApiOkResponse({ type: AdminTraderDetailDto })
  reactivate(@Admin() ctx: AdminContext, @Param('id', UUID) id: string, @Body() dto: ReasonDto) {
    return this.admin.setTraderStatus(ctx, id, 'ACTIVE', dto.reason);
  }

  // -------------------------------------------------------------- accounts
  @Get('accounts')
  @ApiOkResponse({ type: AdminAccountPageDto })
  accounts(@Admin() ctx: AdminContext, @Query() q: AccountQuery) {
    return this.admin.accounts(ctx, q);
  }

  @AdminRoles('OWNER', 'ADMIN')
  @Post('accounts/:id/fail')
  @HttpCode(200)
  @ApiOkResponse({ type: AdminAccountDto })
  failAccount(@Admin() ctx: AdminContext, @Param('id', UUID) id: string, @Body() dto: ReasonDto) {
    return this.admin.failAccount(ctx, id, dto.reason);
  }

  // -------------------------------------------------------------- products & rules
  @Get('products')
  @ApiOkResponse({ type: AdminProductListDto })
  async products(@Admin() ctx: AdminContext): Promise<AdminProductListDto> {
    return { items: await this.catalog.products(ctx) };
  }

  @AdminRoles('OWNER', 'ADMIN')
  @Post('products')
  @ApiCreatedResponse({ type: AdminProductDto })
  createProduct(@Admin() ctx: AdminContext, @Body() dto: CreateProductDto) {
    return this.catalog.createProduct(ctx, dto);
  }

  @AdminRoles('OWNER', 'ADMIN')
  @Patch('products/:id')
  @ApiOkResponse({ type: AdminProductDto })
  updateProduct(
    @Admin() ctx: AdminContext,
    @Param('id', UUID) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.catalog.updateProduct(ctx, id, dto);
  }

  @Get('rule-sets')
  @ApiOkResponse({ type: AdminRuleSetListDto })
  async ruleSets(@Admin() ctx: AdminContext): Promise<AdminRuleSetListDto> {
    return { items: await this.catalog.ruleSets(ctx) };
  }

  @AdminRoles('OWNER', 'ADMIN')
  @Post('rule-sets')
  @ApiCreatedResponse({ type: AdminRuleSetDto })
  createRuleSet(@Admin() ctx: AdminContext, @Body() dto: CreateRuleSetDto) {
    return this.catalog.createRuleSet(ctx, dto);
  }

  // -------------------------------------------------------------- branding
  @Get('branding')
  @ApiOkResponse({ type: AdminFirmDto })
  branding(@Admin() ctx: AdminContext) {
    return this.firm.branding(ctx);
  }

  @AdminRoles('OWNER', 'ADMIN')
  @Put('branding')
  @ApiOkResponse({ type: AdminFirmDto })
  updateBranding(@Admin() ctx: AdminContext, @Body() dto: UpdateBrandingDto) {
    return this.firm.updateBranding(ctx, dto);
  }

  // -------------------------------------------------------------- risk & audit
  @Get('alerts')
  @ApiOkResponse({ type: AdminAlertPageDto })
  alerts(@Admin() ctx: AdminContext, @Query() q: AlertQuery) {
    return this.admin.alerts(ctx, q);
  }

  @Post('alerts/:id/ack')
  @HttpCode(204)
  @ApiNoContentResponse()
  async ack(@Admin() ctx: AdminContext, @Param('id', UUID) id: string): Promise<void> {
    await this.admin.ackAlert(ctx, id);
  }

  @Get('audit')
  @ApiOkResponse({ type: AdminAuditPageDto })
  auditLog(@Admin() ctx: AdminContext, @Query() q: AuditQuery) {
    return this.admin.auditLog(ctx, q);
  }

  @AdminRoles('OWNER', 'ADMIN')
  @Get('audit/verify')
  @ApiOkResponse({ type: AuditVerifyDto })
  verifyAudit() {
    return this.admin.verifyAudit();
  }

  // -------------------------------------------------------------- team
  @Get('team')
  @ApiOkResponse({ type: TeamListDto })
  async team(@Admin() ctx: AdminContext): Promise<TeamListDto> {
    return { items: await this.firm.team(ctx) };
  }

  @AdminRoles('OWNER', 'ADMIN')
  @Post('team')
  @ApiCreatedResponse({ type: TeamListDto })
  async invite(@Admin() ctx: AdminContext, @Body() dto: InviteMemberDto): Promise<TeamListDto> {
    return { items: await this.firm.invite(ctx, dto) };
  }

  @AdminRoles('OWNER', 'ADMIN')
  @Patch('team/:id')
  @ApiOkResponse({ type: TeamListDto })
  async changeRole(
    @Admin() ctx: AdminContext,
    @Param('id', UUID) id: string,
    @Body() dto: UpdateMemberDto,
  ): Promise<TeamListDto> {
    return { items: await this.firm.changeRole(ctx, id, dto.role) };
  }

  @AdminRoles('OWNER', 'ADMIN')
  @Delete('team/:id')
  @ApiOkResponse({ type: TeamListDto })
  async removeMember(
    @Admin() ctx: AdminContext,
    @Param('id', UUID) id: string,
  ): Promise<TeamListDto> {
    return { items: await this.firm.removeMember(ctx, id) };
  }

  // -------------------------------------------------------------- firms (superadmin)
  @SuperadminOnly()
  @Get('firms')
  @ApiOkResponse({ type: AdminFirmListDto })
  async firms(): Promise<AdminFirmListDto> {
    return { items: await this.firm.listFirms() };
  }

  @SuperadminOnly()
  @Post('firms')
  @ApiCreatedResponse({ type: AdminFirmListDto })
  async createFirm(@Admin() ctx: AdminContext, @Body() dto: CreateFirmDto) {
    return { items: await this.firm.createFirm(ctx, dto) };
  }

  @SuperadminOnly()
  @Post('firms/:id/status')
  @HttpCode(200)
  @ApiOkResponse({ type: AdminFirmListDto })
  async firmStatus(
    @Admin() ctx: AdminContext,
    @Param('id', UUID) id: string,
    @Body() dto: FirmStatusDto,
  ) {
    return { items: await this.firm.setFirmStatus(ctx, id, dto.status) };
  }
}
