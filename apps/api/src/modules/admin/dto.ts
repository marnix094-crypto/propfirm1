import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { CLIENT_MODULES, type ClientModule } from '@brand/shared';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const FIRM_ROLES = ['OWNER', 'ADMIN', 'SUPPORT'] as const;
type FirmRoleT = (typeof FIRM_ROLES)[number];
const ACCOUNT_KINDS = ['DEMO', 'CHALLENGE', 'FUNDED', 'LIVE_BROKER', 'COMPETITION'] as const;
const ACCOUNT_STATUSES = [
  'ACTIVE',
  'PASSED',
  'FAILED',
  'PENDING_FUNDED',
  'FUNDED_ACTIVE',
  'SUSPENDED',
  'CLOSED',
] as const;
/** Integer string in minor units (cents), ≥ 0. */
const MINOR = /^(0|[1-9]\d{0,14})$/;
const SLUG = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/;
const HOSTNAME = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const HEX = /^#[0-9A-Fa-f]{6}$/;
/** PNG/JPEG/WebP data URL, at most ~200 KB of image data. */
const LOGO = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
export const LOGO_MAX_LENGTH = 280_000;

// ------------------------------------------------------------------ common

export class CursorQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) cursor?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

// ------------------------------------------------------------------ me / firm

export class AdminFirmDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ['ACTIVE', 'SUSPENDED'] }) status!: 'ACTIVE' | 'SUSPENDED';
  @ApiProperty({ type: String, nullable: true }) domain!: string | null;
  @ApiProperty({ enum: ['NONE', 'PENDING_DNS', 'ACTIVE', 'FAILED'] })
  domainStatus!: 'NONE' | 'PENDING_DNS' | 'ACTIVE' | 'FAILED';
  @ApiProperty({ type: String, nullable: true, description: 'Automatic <slug>.<platform> host' })
  subdomain!: string | null;
  @ApiProperty() dedicatedDatabase!: boolean;
  @ApiProperty({ type: String, nullable: true }) primaryColor!: string | null;
  @ApiProperty({ type: String, nullable: true }) logoDataUrl!: string | null;
  @ApiProperty({ type: String, nullable: true }) supportEmail!: string | null;
  @ApiProperty() isDefault!: boolean;
  @ApiProperty({ enum: CLIENT_MODULES, isArray: true }) disabledModules!: ClientModule[];
  @ApiProperty() createdAt!: string;
}

export class AdminMeDto {
  @ApiProperty({ enum: FIRM_ROLES }) role!: FirmRoleT;
  @ApiProperty({ description: 'Daily Funded platform staff (can manage every firm)' })
  superadmin!: boolean;
  @ApiProperty({ type: AdminFirmDto }) firm!: AdminFirmDto;
  @ApiProperty() twoFactorEnabled!: boolean;
  @ApiProperty({ description: 'Admin routes refuse access until 2FA is enabled' })
  twoFactorRequired!: boolean;
}

// ------------------------------------------------------------------ overview

export class DailySalesDto {
  @ApiProperty({ example: '2026-11-18' }) date!: string;
  @ApiProperty() salesMinor!: string;
  @ApiProperty() orders!: number;
}

export class AdminOverviewDto {
  @ApiProperty() traders!: number;
  @ApiProperty({ description: 'Registered in the last 30 days' }) newTraders30d!: number;
  @ApiProperty() demoAccounts!: number;
  @ApiProperty() fundedActive!: number;
  @ApiProperty({ description: 'Funded accounts that failed in the last 30 days' })
  fundedFailed30d!: number;
  @ApiProperty() competitionAccounts!: number;
  @ApiProperty({ description: 'Paid purchases, last 30 days (EUR minor units)' })
  sales30dMinor!: string;
  @ApiProperty() orders30d!: number;
  @ApiProperty() salesAllTimeMinor!: string;
  @ApiProperty() openAlerts!: number;
  @ApiProperty() criticalAlerts!: number;
  @ApiProperty({ type: [DailySalesDto] }) salesByDay!: DailySalesDto[];
  @ApiProperty({ enum: ['EUR'] }) currency!: 'EUR';
}

// ------------------------------------------------------------------ traders

export class AdminAccountCountsDto {
  @ApiProperty() total!: number;
  @ApiProperty() funded!: number;
  @ApiProperty() failed!: number;
}

export class AdminTraderDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() country!: string;
  @ApiProperty({ enum: ['ACTIVE', 'SUSPENDED', 'PENDING_DELETION', 'DELETED'] })
  status!: 'ACTIVE' | 'SUSPENDED' | 'PENDING_DELETION' | 'DELETED';
  @ApiProperty() emailVerified!: boolean;
  @ApiProperty({ enum: FIRM_ROLES, nullable: true }) firmRole!: FirmRoleT | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ type: String, nullable: true }) lastLoginAt!: string | null;
  @ApiProperty({ type: AdminAccountCountsDto }) accounts!: AdminAccountCountsDto;
}

export class AdminTraderPageDto {
  @ApiProperty({ type: [AdminTraderDto] }) items!: AdminTraderDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}

export class TraderQuery extends CursorQuery {
  @ApiPropertyOptional({ description: 'Part of the email address' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'SUSPENDED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status?: 'ACTIVE' | 'SUSPENDED';
}

export class AdminAccountDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() userEmail!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ enum: ACCOUNT_KINDS }) kind!: (typeof ACCOUNT_KINDS)[number];
  @ApiProperty({ enum: ACCOUNT_STATUSES }) status!: (typeof ACCOUNT_STATUSES)[number];
  @ApiProperty() currency!: string;
  @ApiProperty() initialBalanceMinor!: string;
  @ApiProperty() balanceMinor!: string;
  @ApiProperty({ description: 'Balance minus starting balance' }) pnlMinor!: string;
  @ApiProperty({ type: String, nullable: true }) ruleSetName!: string | null;
  @ApiProperty({ type: String, nullable: true }) failReason!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ type: String, nullable: true }) endedAt!: string | null;
}

export class AdminAccountPageDto {
  @ApiProperty({ type: [AdminAccountDto] }) items!: AdminAccountDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}

export class AccountQuery extends CursorQuery {
  @ApiPropertyOptional({ enum: ACCOUNT_KINDS })
  @IsOptional()
  @IsIn(ACCOUNT_KINDS)
  kind?: (typeof ACCOUNT_KINDS)[number];

  @ApiPropertyOptional({ enum: ACCOUNT_STATUSES })
  @IsOptional()
  @IsIn(ACCOUNT_STATUSES)
  status?: (typeof ACCOUNT_STATUSES)[number];
}

export class AdminPurchaseDto {
  @ApiProperty() id!: string;
  @ApiProperty() accountSizeMinor!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty() totalMinor!: string;
  @ApiProperty() currency!: string;
  @ApiProperty({ enum: ['PENDING', 'PAID', 'FULFILLED', 'FAILED', 'CANCELLED'] })
  status!: 'PENDING' | 'PAID' | 'FULFILLED' | 'FAILED' | 'CANCELLED';
  @ApiProperty() createdAt!: string;
}

export class AdminTraderDetailDto extends AdminTraderDto {
  @ApiProperty() twoFactorEnabled!: boolean;
  @ApiProperty({ type: String, nullable: true }) nickname!: string | null;
  @ApiProperty({ type: [AdminAccountDto] }) accountList!: AdminAccountDto[];
  @ApiProperty({ type: [AdminPurchaseDto] }) purchases!: AdminPurchaseDto[];
}

export class ReasonDto {
  @ApiProperty({ minLength: 3, maxLength: 200, description: 'Stored in the audit log' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  reason!: string;
}

// ------------------------------------------------------------------ products & rules

export class AdminRuleSetDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() version!: number;
  @ApiProperty() name!: string;
  @ApiProperty({ description: 'Platform template (read-only) vs. this firm’s own version' })
  isTemplate!: boolean;
  @ApiProperty() isExample!: boolean;
  @ApiProperty() maxDailyLossBps!: number;
  @ApiProperty() maxDrawdownBps!: number;
  @ApiProperty({ enum: ['STATIC', 'TRAILING'] }) drawdownType!: 'STATIC' | 'TRAILING';
  @ApiProperty({ type: Number, nullable: true }) profitTargetBps!: number | null;
  @ApiProperty() minTradingDays!: number;
  @ApiProperty() maxLeverage!: number;
  @ApiProperty({ type: Number, nullable: true }) profitSplitBps!: number | null;
  @ApiProperty({ type: Number, nullable: true }) payoutIntervalDays!: number | null;
  @ApiProperty({ type: Number, nullable: true }) minTradingDaysPerPayout!: number | null;
  @ApiProperty({ type: String, nullable: true }) minPayoutMinor!: string | null;
  @ApiProperty({ description: 'Accounts opened with this exact version' }) accounts!: number;
  @ApiProperty() createdAt!: string;
}

export class AdminRuleSetListDto {
  @ApiProperty({ type: [AdminRuleSetDto] }) items!: AdminRuleSetDto[];
}

/** Creates a NEW immutable version based on an existing one (D5). Omitted fields are copied. */
export class CreateRuleSetDto {
  @ApiProperty({ description: 'Template or own rule set to start from' })
  @IsUUID()
  basedOnId!: string;

  @ApiProperty({ minLength: 2, maxLength: 60 })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name!: string;

  @ApiPropertyOptional({ minimum: 50, maximum: 2000 })
  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(2000)
  maxDailyLossBps?: number;

  @ApiPropertyOptional({ minimum: 100, maximum: 5000 })
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(5000)
  maxDrawdownBps?: number;

  @ApiPropertyOptional({ enum: ['STATIC', 'TRAILING'] })
  @IsOptional()
  @IsIn(['STATIC', 'TRAILING'])
  drawdownType?: 'STATIC' | 'TRAILING';

  @ApiPropertyOptional({ minimum: 1, maximum: 200 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  maxLeverage?: number;

  @ApiPropertyOptional({ minimum: 1000, maximum: 10000 })
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(10000)
  profitSplitBps?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 60 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  minTradingDays?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 90 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  payoutIntervalDays?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 60 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  minTradingDaysPerPayout?: number;

  @ApiPropertyOptional({ description: 'USD minor units' })
  @IsOptional()
  @Matches(MINOR)
  minPayoutMinor?: string;
}

export class AdminProductDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ enum: ['INSTANT', 'ONE_STEP', 'TWO_STEP'] })
  type!: 'INSTANT' | 'ONE_STEP' | 'TWO_STEP';
  @ApiProperty() accountSizeMinor!: string;
  @ApiProperty() priceMinor!: string;
  @ApiProperty() priceCurrency!: string;
  @ApiProperty() ruleSetId!: string;
  @ApiProperty() ruleSetName!: string;
  @ApiProperty() ruleSetVersion!: number;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() isRecommended!: boolean;
  @ApiProperty() isExample!: boolean;
  @ApiProperty() sortOrder!: number;
  @ApiProperty({ description: 'Paid or fulfilled purchases' }) sold!: number;
}

export class AdminProductListDto {
  @ApiProperty({ type: [AdminProductDto] }) items!: AdminProductDto[];
}

export class CreateProductDto {
  @ApiProperty({ example: 'instant-15k' }) @Matches(SLUG) slug!: string;
  @ApiProperty({ description: 'USD minor units' }) @Matches(MINOR) accountSizeMinor!: string;
  @ApiProperty({ description: 'EUR minor units' }) @Matches(MINOR) priceMinor!: string;
  @ApiProperty() @IsUUID() ruleSetId!: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isRecommended?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(999) sortOrder?: number;
}

/** Price changes only affect new purchases: a purchase snapshots its price and rules. */
export class UpdateProductDto {
  @ApiPropertyOptional({ description: 'EUR minor units' })
  @IsOptional()
  @Matches(MINOR)
  priceMinor?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() ruleSetId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isRecommended?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(999) sortOrder?: number;
}

// ------------------------------------------------------------------ branding

export class UpdateBrandingDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 80 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: '#AFE604' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Matches(HEX)
  primaryColor?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'PNG/JPEG/WebP data URL' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @MaxLength(LOGO_MAX_LENGTH)
  @Matches(LOGO)
  logoDataUrl?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'trade.yourfirm.com' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Matches(HOSTNAME)
  domain?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsEmail()
  @MaxLength(254)
  supportEmail?: string | null;
}

// ------------------------------------------------------------------ alerts & audit

export class AdminAlertDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['BREACH', 'NEAR_BREACH', 'LARGE_LOSS'] })
  type!: 'BREACH' | 'NEAR_BREACH' | 'LARGE_LOSS';
  @ApiProperty({ enum: ['INFO', 'WARNING', 'CRITICAL'] })
  severity!: 'INFO' | 'WARNING' | 'CRITICAL';
  @ApiProperty() accountId!: string;
  @ApiProperty() accountLabel!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() userEmail!: string;
  @ApiProperty({ type: 'object', additionalProperties: true }) details!: Record<string, unknown>;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ type: String, nullable: true }) ackAt!: string | null;
}

export class AdminAlertPageDto {
  @ApiProperty({ type: [AdminAlertDto] }) items!: AdminAlertDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}

export class AlertQuery extends CursorQuery {
  @ApiPropertyOptional({ enum: ['open', 'all'], default: 'open' })
  @IsOptional()
  @IsIn(['open', 'all'])
  state?: 'open' | 'all';
}

export class AdminAuditDto {
  @ApiProperty() id!: string;
  @ApiProperty() ts!: string;
  @ApiProperty({ enum: ['USER', 'ADMIN', 'SUPPORT', 'SYSTEM'] })
  actorType!: 'USER' | 'ADMIN' | 'SUPPORT' | 'SYSTEM';
  @ApiProperty({ type: String, nullable: true }) actorId!: string | null;
  @ApiProperty() action!: string;
  @ApiProperty() entityType!: string;
  @ApiProperty() entityId!: string;
  @ApiProperty({ type: 'object', additionalProperties: true }) data!: Record<string, unknown>;
  @ApiProperty() hash!: string;
}

export class AdminAuditPageDto {
  @ApiProperty({ type: [AdminAuditDto] }) items!: AdminAuditDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}

export class AuditQuery extends CursorQuery {
  @ApiPropertyOptional({ description: 'Action prefix, e.g. "order." or "admin."' })
  @IsOptional()
  @Matches(/^[a-z_.]{1,40}$/)
  action?: string;
}

export class AuditVerifyDto {
  @ApiProperty() ok!: boolean;
  @ApiProperty() checked!: number;
  @ApiProperty({ type: String, nullable: true }) brokenAtId!: string | null;
}

// ------------------------------------------------------------------ client dashboard

export class ModulesDto {
  @ApiProperty({ enum: CLIENT_MODULES, isArray: true, description: 'All switchable modules' })
  available!: ClientModule[];
  @ApiProperty({ enum: CLIENT_MODULES, isArray: true, description: 'Modules switched off' })
  disabled!: ClientModule[];
}

export class UpdateModulesDto {
  @ApiProperty({ enum: CLIENT_MODULES, isArray: true })
  @IsArray()
  @ArrayMaxSize(CLIENT_MODULES.length)
  @IsIn(CLIENT_MODULES, { each: true })
  disabled!: ClientModule[];
}

// ------------------------------------------------------------------ firms (superadmin)

export class FirmAdminInfoDto {
  @ApiProperty() email!: string;
  @ApiProperty({ description: 'Has set a password and logged in at least once' })
  activated!: boolean;
  @ApiProperty() twoFactorEnabled!: boolean;
}

const STEP_KEYS = ['TENANT', 'ADMIN', 'DATABASE', 'SUBDOMAIN', 'CUSTOM_DOMAIN'] as const;
const STEP_STATUSES = ['PENDING', 'RUNNING', 'WAITING', 'DONE', 'SKIPPED', 'FAILED'] as const;

export class ProvisioningStepDto {
  @ApiProperty({ enum: STEP_KEYS }) step!: (typeof STEP_KEYS)[number];
  @ApiProperty({ enum: STEP_STATUSES }) status!: (typeof STEP_STATUSES)[number];
  @ApiProperty({ type: String, nullable: true, description: 'Outcome code' })
  detail!: string | null;
  @ApiProperty() attempts!: number;
  @ApiProperty() updatedAt!: string;
}

export class DomainSetupDto {
  @ApiProperty({ type: String, nullable: true }) domain!: string | null;
  @ApiProperty({ enum: ['NONE', 'PENDING_DNS', 'ACTIVE', 'FAILED'] })
  status!: 'NONE' | 'PENDING_DNS' | 'ACTIVE' | 'FAILED';
  @ApiProperty({ type: String, nullable: true }) subdomain!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'CNAME the domain to this host' })
  cnameTarget!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'TXT record name' })
  txtName!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'TXT record value' })
  txtValue!: string | null;
  @ApiProperty({ type: String, nullable: true }) checkedAt!: string | null;
}

export class AdminFirmSummaryDto extends AdminFirmDto {
  @ApiProperty() traders!: number;
  @ApiProperty() fundedActive!: number;
  @ApiProperty({ type: FirmAdminInfoDto, nullable: true }) admin!: FirmAdminInfoDto | null;
  @ApiProperty({ type: [ProvisioningStepDto] }) provisioning!: ProvisioningStepDto[];
}

export class AdminFirmListDto {
  @ApiProperty({ type: [AdminFirmSummaryDto] }) items!: AdminFirmSummaryDto[];
}

export class CreateFirmDto {
  @ApiProperty({ minLength: 2, maxLength: 80 })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @ApiProperty({ example: 'acme-trading' }) @Matches(SLUG) slug!: string;

  @ApiProperty({ description: 'The firm admin; receives an email to set a password' })
  @IsEmail()
  @MaxLength(254)
  ownerEmail!: string;

  @ApiPropertyOptional({ description: 'Create a dedicated database for this firm (D94)' })
  @IsOptional()
  @IsBoolean()
  dedicatedDatabase?: boolean;

  @ApiPropertyOptional({ example: 'trade.acmeprop.com', description: 'Own domain (verified via DNS)' })
  @IsOptional()
  @Matches(HOSTNAME)
  domain?: string;
}

export class FirmAdminDto {
  @ApiProperty({ description: 'New admin of the firm (replaces the current one)' })
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class FirmStatusDto {
  @ApiProperty({ enum: ['ACTIVE', 'SUSPENDED'] })
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status!: 'ACTIVE' | 'SUSPENDED';
}
