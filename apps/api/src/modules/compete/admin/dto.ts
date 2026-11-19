import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { CompeteLeaderboardRowDto, CompeteRoundDto } from '../dto.js';

const lower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

// ---------------------------------------------------------------- auth

export class CompeteAdminLoginDto {
  @ApiProperty() @Transform(lower) @IsEmail() email!: string;
  @ApiProperty() @IsString() @MaxLength(128) password!: string;
  @ApiPropertyOptional({ description: '6-digit TOTP code (when 2FA is enabled)' })
  @IsOptional()
  @Matches(/^\d{6}$/)
  code?: string;
}

export class CompeteStaffDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: ['OWNER', 'SUPERADMIN'] }) role!: 'OWNER' | 'SUPERADMIN';
  @ApiProperty({ type: String, nullable: true }) operatorId!: string | null;
  @ApiProperty({ type: String, nullable: true }) operatorName!: string | null;
  @ApiProperty({ type: String, nullable: true }) operatorSlug!: string | null;
  @ApiProperty() twoFactorEnabled!: boolean;
  @ApiProperty({ description: 'True when 2FA must be set up before the panel opens' })
  twoFactorRequired!: boolean;
}

export class CompeteAdminAuthDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty() expiresIn!: number;
  @ApiProperty({ type: CompeteStaffDto }) staff!: CompeteStaffDto;
}

export class CompeteAdminTokenDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty() expiresIn!: number;
}

export class CompeteAdminSetupPasswordDto {
  @ApiProperty() @IsString() @MaxLength(200) token!: string;
  @ApiProperty({ minLength: 12 }) @IsString() @MinLength(12) @MaxLength(128) password!: string;
}

export class CompeteTwoFactorSetupDto {
  @ApiProperty() secret!: string;
  @ApiProperty() otpauthUri!: string;
}

export class CompeteTwoFactorCodeDto {
  @ApiProperty() @Matches(/^\d{6}$/) code!: string;
}

// ---------------------------------------------------------------- overview

export class CompeteAdminRoundSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['OPEN', 'LIVE', 'SETTLED', 'CANCELLED'] }) status!: string;
  @ApiProperty() startsAt!: string;
  @ApiProperty() participants!: number;
  @ApiProperty() potMinor!: string;
  @ApiProperty() prizesMinor!: string;
  @ApiProperty() operatorShareMinor!: string;
}

export class CompeteAdminOverviewDto {
  @ApiProperty({ type: CompeteRoundDto }) current!: CompeteRoundDto;
  @ApiProperty() currency!: string;
  @ApiProperty() players!: number;
  @ApiProperty() roundsSettled30d!: number;
  @ApiProperty() roundsCancelled30d!: number;
  @ApiProperty() entries30d!: number;
  @ApiProperty({ description: 'Entry fees collected minus refunds, last 30 days' })
  netEntryFeesMinor30d!: string;
  @ApiProperty() prizesMinor30d!: string;
  @ApiProperty({ description: 'Operator share of settled rounds, last 30 days' })
  operatorRevenueMinor30d!: string;
  @ApiProperty() awaitingPayouts!: number;
  @ApiProperty() awaitingPayoutsMinor!: string;
  @ApiProperty({ type: [CompeteAdminRoundSummaryDto], description: 'Last 14 finished rounds' })
  recent!: CompeteAdminRoundSummaryDto[];
}

// ---------------------------------------------------------------- rounds / players / payouts

export class CompeteAdminRoundRowDto extends CompeteLeaderboardRowDto {
  @ApiProperty() entryId!: string;
  @ApiProperty() playerId!: string;
}

export class CompeteAdminRoundDetailDto {
  @ApiProperty({ type: CompeteAdminRoundSummaryDto }) round!: CompeteAdminRoundSummaryDto;
  @ApiProperty() endsAt!: string;
  @ApiProperty() minParticipants!: number;
  @ApiProperty() entryFeeMinor!: string;
  @ApiProperty() currency!: string;
  @ApiProperty({ type: [CompeteAdminRoundRowDto] }) rows!: CompeteAdminRoundRowDto[];
}

export class CompeteAdminPlayerDto {
  @ApiProperty() id!: string;
  @ApiProperty() nickname!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Null for SSO-only players' })
  email!: string | null;
  @ApiProperty({ description: 'Signs in via the operator website (SSO, D109)' }) sso!: boolean;
  @ApiProperty() country!: string;
  @ApiProperty({ enum: ['ACTIVE', 'SUSPENDED', 'SELF_EXCLUDED'] }) status!: string;
  @ApiProperty({ type: String, nullable: true }) statusReason!: string | null;
  @ApiProperty() entries!: number;
  @ApiProperty() prizesMinor!: string;
  @ApiProperty() createdAt!: string;
}

export class CompeteAdminPlayerPageDto {
  @ApiProperty({ type: [CompeteAdminPlayerDto] }) items!: CompeteAdminPlayerDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}

export class CompeteAdminReasonDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(300) reason!: string;
}

export class CompeteAdminPayoutDto {
  @ApiProperty() id!: string;
  @ApiProperty() entryId!: string;
  @ApiProperty() roundId!: string;
  @ApiProperty() roundStartsAt!: string;
  @ApiProperty() nickname!: string;
  @ApiProperty({ type: Number, nullable: true }) rank!: number | null;
  @ApiProperty() amountMinor!: string;
  @ApiProperty() currency!: string;
  @ApiProperty({ enum: ['AWAITING_PAYOUT', 'SUCCEEDED'] }) status!: string;
  @ApiProperty() updatedAt!: string;
}

export class CompeteAdminMarkPaidDto {
  @ApiProperty({ description: 'Bank / PSP reference of the payout' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  reference!: string;
}

// ---------------------------------------------------------------- settings

export class CompeteAdminSettingsDto {
  @ApiProperty() name!: string;
  @ApiProperty() primaryColor!: string;
  @ApiProperty({ type: String, nullable: true }) domain!: string | null;
  @ApiProperty() timeZone!: string;
  @ApiProperty() startMinuteOfDay!: number;
  @ApiProperty() durationMinutes!: number;
  @ApiProperty() entryFeeMinor!: string;
  @ApiProperty() currency!: string;
  @ApiProperty() startBalanceMinor!: string;
  @ApiProperty() leverage!: number;
  @ApiProperty() maxDrawdownBps!: number;
  @ApiProperty() minParticipants!: number;
  @ApiProperty() prizePoolBps!: number;
  @ApiProperty({ type: [Number] }) prizeSplitBps!: number[];
}

export class UpdateCompeteSettingsDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(60) name!: string;
  @ApiProperty() @Matches(/^#[0-9a-fA-F]{6}$/) primaryColor!: string;
  @ApiProperty() @IsString() @MaxLength(64) timeZone!: string;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(0) @Max(1439) startMinuteOfDay!: number;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(5) @Max(720) durationMinutes!: number;
  @ApiProperty({ description: 'Integer string in minor units' })
  @Matches(/^\d{1,9}$/)
  entryFeeMinor!: string;
  @ApiProperty() @Matches(/^\d{1,12}$/) startBalanceMinor!: string;
  @ApiProperty() @Type(() => Number) @IsInt() leverage!: number;
  @ApiProperty() @Type(() => Number) @IsInt() maxDrawdownBps!: number;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(3) @Max(100_000) minParticipants!: number;
  @ApiProperty() @Type(() => Number) @IsInt() prizePoolBps!: number;
  @ApiProperty({ type: [Number] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsInt({ each: true })
  prizeSplitBps!: number[];
}

// ---------------------------------------------------------------- audit / operators

export class CompeteAdminAuditDto {
  @ApiProperty() id!: string;
  @ApiProperty() ts!: string;
  @ApiProperty() actorType!: string;
  @ApiProperty({ type: String, nullable: true }) actorId!: string | null;
  @ApiProperty() action!: string;
  @ApiProperty() entityType!: string;
  @ApiProperty() entityId!: string;
  @ApiProperty({ type: Object }) data!: Record<string, unknown>;
}

export class CompeteAdminAuditPageDto {
  @ApiProperty({ type: [CompeteAdminAuditDto] }) items!: CompeteAdminAuditDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
  @ApiProperty() chainIntact!: boolean;
}

export class CompeteAdminOperatorDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) domain!: string | null;
  @ApiProperty({ enum: ['ACTIVE', 'SUSPENDED'] }) status!: string;
  @ApiProperty({ type: String, nullable: true }) ownerEmail!: string | null;
  @ApiProperty() ownerTwoFactor!: boolean;
  @ApiProperty() players!: number;
  @ApiProperty() createdAt!: string;
}

export class CreateCompeteOperatorDto {
  @ApiProperty() @Matches(/^[a-z0-9-]{3,40}$/) slug!: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(60) name!: string;
  @ApiProperty() @Transform(lower) @IsEmail() ownerEmail!: string;
}

export class CompeteAdminInviteDto {
  @ApiProperty({ type: CompeteAdminOperatorDto }) operator!: CompeteAdminOperatorDto;
  @ApiProperty({ description: 'One-time link (24 h) for the owner to set a password' })
  setupUrl!: string;
}

export class CompeteOperatorStatusDto {
  @ApiProperty({ enum: ['ACTIVE', 'SUSPENDED'] }) @IsIn(['ACTIVE', 'SUSPENDED']) status!:
    'ACTIVE' | 'SUSPENDED';
}

// ---------------------------------------------------------------- integration (D108/D109)

export class CompeteDnsRecordDto {
  @ApiProperty({ enum: ['TXT', 'CNAME'] }) type!: string;
  @ApiProperty() name!: string;
  @ApiProperty() value!: string;
}

export class CompeteAdminIntegrationDto {
  @ApiProperty() slug!: string;
  @ApiProperty({ type: String, nullable: true, description: '<slug>.<COMPETE_BASE_DOMAIN>' })
  subdomain!: string | null;
  @ApiProperty({ type: String, nullable: true }) domain!: string | null;
  @ApiProperty({ enum: ['NONE', 'PENDING_DNS', 'ACTIVE'] }) domainStatus!: string;
  @ApiProperty({ type: String, nullable: true }) domainCheckedAt!: string | null;
  @ApiProperty({ type: [CompeteDnsRecordDto] }) dnsRecords!: CompeteDnsRecordDto[];
  @ApiProperty({ type: String, nullable: true, description: 'Where players play' })
  playUrl!: string | null;
  @ApiProperty({ type: String, nullable: true }) logoDataUrl!: string | null;
  @ApiProperty({ type: [String] }) widgetOrigins!: string[];
  @ApiProperty() ssoEnabled!: boolean;
  @ApiProperty({ description: 'An SSO secret exists (never returned again)' })
  ssoConfigured!: boolean;
}

export class UpdateCompeteIntegrationDto {
  @ApiProperty({ type: String, nullable: true })
  @IsOptional()
  @Matches(/^(?=.{3,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/)
  domain!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'data:image/...;base64, ≤ 200 kB' })
  @IsOptional()
  @IsString()
  @MaxLength(200_000)
  logoDataUrl!: string | null;
  @ApiProperty({ type: [String], description: 'Origins allowed to embed widgets' })
  @IsArray()
  @ArrayMaxSize(20)
  @Matches(/^https:\/\/([a-z0-9-]+\.)+[a-z]{2,}(:\d{1,5})?\/?$/i, { each: true })
  widgetOrigins!: string[];
  @ApiProperty() @IsBoolean() ssoEnabled!: boolean;
}

export class CompeteAdminSsoSecretDto {
  @ApiProperty({ description: 'Shown once; store it on your server only' }) secret!: string;
}
