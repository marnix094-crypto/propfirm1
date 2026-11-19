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
  DomainSetupDto,
  FirmDomainDto,
  CreateProductDto,
  CreateRuleSetDto,
  FirmAdminDto,
  FirmStatusDto,
  ModulesDto,
  UpdateModulesDto,
  ReasonDto,
  TraderQuery,
  UpdateBrandingDto,
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

  @Post('traders/:id/suspend')
  @HttpCode(200)
  @ApiOkResponse({ type: AdminTraderDetailDto })
  suspend(@Admin() ctx: AdminContext, @Param('id', UUID) id: string, @Body() dto: ReasonDto) {
    return this.admin.setTraderStatus(ctx, id, 'SUSPENDED', dto.reason);
  }

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

  @Post('products')
  @ApiCreatedResponse({ type: AdminProductDto })
  createProduct(@Admin() ctx: AdminContext, @Body() dto: CreateProductDto) {
    return this.catalog.createProduct(ctx, dto);
  }

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

  @Put('branding')
  @ApiOkResponse({ type: AdminFirmDto })
  updateBranding(@Admin() ctx: AdminContext, @Body() dto: UpdateBrandingDto) {
    return this.firm.updateBranding(ctx, dto);
  }

  /** DNS instructions and status of the firm's own domain (D95). */
  @Get('branding/domain')
  @ApiOkResponse({ type: DomainSetupDto })
  domain(@Admin() ctx: AdminContext) {
    return this.firm.domainSetup(ctx.firmId);
  }

  @Post('branding/domain/check')
  @HttpCode(200)
  @ApiOkResponse({ type: DomainSetupDto })
  checkDomain(@Admin() ctx: AdminContext) {
    return this.firm.checkDomain(ctx.firmId);
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

  @Get('audit/verify')
  @ApiOkResponse({ type: AuditVerifyDto })
  verifyAudit() {
    return this.admin.verifyAudit();
  }

  // -------------------------------------------------------------- client dashboard
  @Get('modules')
  @ApiOkResponse({ type: ModulesDto })
  modules(@Admin() ctx: AdminContext) {
    return this.firm.modules(ctx);
  }

  @Put('modules')
  @ApiOkResponse({ type: ModulesDto })
  updateModules(@Admin() ctx: AdminContext, @Body() dto: UpdateModulesDto) {
    return this.firm.updateModules(ctx, dto.disabled);
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

  /** Daily Funded: give the firm a (new) admin. The previous admin is deactivated. */
  @SuperadminOnly()
  @Post('firms/:id/admin')
  @HttpCode(200)
  @ApiOkResponse({ type: AdminFirmListDto })
  async setFirmAdmin(
    @Admin() ctx: AdminContext,
    @Param('id', UUID) id: string,
    @Body() dto: FirmAdminDto,
  ) {
    return { items: await this.firm.setFirmAdmin(ctx, id, dto.email) };
  }

  /** Daily Funded: run the unfinished automatic set-up steps of a firm now. */
  @SuperadminOnly()
  @Post('firms/:id/provisioning/run')
  @HttpCode(200)
  @ApiOkResponse({ type: AdminFirmListDto })
  async runProvisioning(@Admin() ctx: AdminContext, @Param('id', UUID) id: string) {
    return { items: await this.firm.runProvisioning(ctx, id) };
  }

  /** Daily Funded: set or remove a firm's own domain (verified via DNS before it routes). */
  @SuperadminOnly()
  @Post('firms/:id/domain')
  @HttpCode(200)
  @ApiOkResponse({ type: AdminFirmListDto })
  async setFirmDomain(
    @Admin() ctx: AdminContext,
    @Param('id', UUID) id: string,
    @Body() dto: FirmDomainDto,
  ) {
    return { items: await this.firm.setFirmDomain(ctx, id, dto.domain ?? null) };
  }

  /** Daily Funded: send the firm admin a new link to set a password. */
  @SuperadminOnly()
  @Post('firms/:id/admin/invite')
  @HttpCode(204)
  @ApiNoContentResponse()
  async resendInvite(@Admin() ctx: AdminContext, @Param('id', UUID) id: string): Promise<void> {
    await this.firm.resendInvite(ctx, id);
  }
}
