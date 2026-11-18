import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  Equals,
  IsEmail,
  IsIn,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SUPPORTED_LOCALES } from '@brand/shared';

const lower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
const DECIMAL = /^\d{1,12}(\.\d{1,12})?$/;

// ------------------------------------------------------------------ auth

export class CompeteRegisterDto {
  @ApiProperty({ example: 'player@example.com' })
  @Transform(lower)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ minLength: 12, maxLength: 128 })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ description: 'Public name on leaderboards', example: 'bull_rider' })
  @IsString()
  @Matches(/^[A-Za-z0-9_]{3,20}$/)
  nickname!: string;

  @ApiProperty({ example: 'NL', description: 'ISO 3166-1 alpha-2' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @Length(2, 2)
  @Matches(/^[A-Z]{2}$/)
  country!: string;

  @ApiProperty({ enum: SUPPORTED_LOCALES })
  @IsIn(SUPPORTED_LOCALES)
  locale!: string;

  @ApiProperty({ description: 'Must be true' })
  @Equals(true)
  acceptTerms!: boolean;

  @ApiProperty({ description: 'Player confirms being 18 or older; must be true' })
  @Equals(true)
  confirmAdult!: boolean;
}

export class CompeteLoginDto {
  @ApiProperty()
  @Transform(lower)
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(128)
  password!: string;
}

export class CompetePlayerDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() nickname!: string;
  @ApiProperty() country!: string;
  @ApiProperty() locale!: string;
  @ApiProperty() operatorId!: string;
}

export class CompeteAuthResponseDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty() expiresIn!: number;
  @ApiProperty({ type: CompetePlayerDto }) player!: CompetePlayerDto;
}

export class CompeteTokenDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty() expiresIn!: number;
}

// ------------------------------------------------------------------ operator / rounds

export class CompeteOperatorDto {
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty() primaryColor!: string;
  @ApiProperty() timeZone!: string;
  @ApiProperty({ description: 'Local start time, minutes after midnight' })
  startMinuteOfDay!: number;
  @ApiProperty() durationMinutes!: number;
  @ApiProperty() entryFeeMinor!: string;
  @ApiProperty() currency!: string;
  @ApiProperty() startBalanceMinor!: string;
  @ApiProperty() leverage!: number;
  @ApiProperty() maxDrawdownBps!: number;
  @ApiProperty() minParticipants!: number;
  @ApiProperty() prizePoolBps!: number;
  @ApiProperty({ type: [Number] }) prizeSplitBps!: number[];
  @ApiProperty({ description: 'True while only test payments exist (no real money)' })
  testPayments!: boolean;
}

export const ENTRY_STATUSES = [
  'PENDING_PAYMENT',
  'PAYMENT_FAILED',
  'ACTIVE',
  'BREACHED',
  'FINISHED',
  'REFUNDED',
] as const;
export const ROUND_STATUSES = ['OPEN', 'LIVE', 'SETTLED', 'CANCELLED'] as const;

export class CompetePositionDto {
  @ApiProperty() symbol!: string;
  @ApiProperty({ enum: ['LONG', 'SHORT'] }) side!: 'LONG' | 'SHORT';
  @ApiProperty() qty!: string;
  @ApiProperty() avgEntryPrice!: string;
  @ApiProperty({ type: String, nullable: true }) markPrice!: string | null;
  @ApiProperty() unrealizedPnlMinor!: string;
  @ApiProperty() leverage!: number;
}

export class CompeteEntryDto {
  @ApiProperty() id!: string;
  @ApiProperty() roundId!: string;
  @ApiProperty({ enum: ENTRY_STATUSES }) status!: (typeof ENTRY_STATUSES)[number];
  @ApiProperty() startBalanceMinor!: string;
  @ApiProperty() balanceMinor!: string;
  @ApiProperty() equityMinor!: string;
  @ApiProperty() usedMarginMinor!: string;
  @ApiProperty() freeMarginMinor!: string;
  @ApiProperty({ description: 'Equity at or below this ends the entry (static 10%)' })
  floorMinor!: string;
  @ApiProperty({ description: 'Return on the starting balance in bps' }) returnBps!: string;
  @ApiProperty({ type: Number, nullable: true }) rank!: number | null;
  @ApiProperty({ type: String, nullable: true }) prizeMinor!: string | null;
  @ApiProperty({ type: String, nullable: true }) paidAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) endedAt!: string | null;
  @ApiProperty({ type: [CompetePositionDto] }) positions!: CompetePositionDto[];
}

export class CompeteRoundDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ROUND_STATUSES }) status!: (typeof ROUND_STATUSES)[number];
  @ApiProperty() startsAt!: string;
  @ApiProperty() endsAt!: string;
  @ApiProperty() entryFeeMinor!: string;
  @ApiProperty() currency!: string;
  @ApiProperty() startBalanceMinor!: string;
  @ApiProperty() leverage!: number;
  @ApiProperty() maxDrawdownBps!: number;
  @ApiProperty() minParticipants!: number;
  @ApiProperty() prizePoolBps!: number;
  @ApiProperty({ type: [Number] }) prizeSplitBps!: number[];
  @ApiProperty({ description: 'Paid entries' }) participants!: number;
  @ApiProperty() potMinor!: string;
  @ApiProperty({ type: [String], description: 'Prize per place for the current pot' })
  prizesMinor!: string[];
  @ApiProperty({ type: CompeteEntryDto, nullable: true }) myEntry!: CompeteEntryDto | null;
}

export class CompeteJoinResponseDto {
  @ApiProperty({ type: CompeteEntryDto }) entry!: CompeteEntryDto;
  @ApiProperty({ description: 'Where the player pays the entry fee' }) paymentUrl!: string;
}

export class CompeteTestPaymentDto {
  @ApiProperty({ enum: ['succeeded', 'failed'] })
  @IsIn(['succeeded', 'failed'])
  outcome!: 'succeeded' | 'failed';
}

// ------------------------------------------------------------------ trading

export class PlaceCompeteOrderDto {
  @ApiProperty({ description: 'Client-generated id, unique per entry' })
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/)
  clientOrderId!: string;

  @ApiProperty({ example: 'BTCUSDT' })
  @IsString()
  @MaxLength(20)
  symbol!: string;

  @ApiProperty({ enum: ['BUY', 'SELL'] })
  @IsIn(['BUY', 'SELL'])
  side!: 'BUY' | 'SELL';

  @ApiProperty({ description: 'Decimal string in base asset units', example: '0.100' })
  @Matches(DECIMAL)
  qty!: string;
}

export class CompeteOrderDto {
  @ApiProperty() id!: string;
  @ApiProperty() clientOrderId!: string;
  @ApiProperty() symbol!: string;
  @ApiProperty({ enum: ['BUY', 'SELL'] }) side!: 'BUY' | 'SELL';
  @ApiProperty() qty!: string;
  @ApiProperty() price!: string;
  @ApiProperty() feeMinor!: string;
  @ApiProperty() realizedPnlMinor!: string;
  @ApiProperty({ enum: ['PLAYER', 'DRAWDOWN', 'ROUND_END'] }) reason!: string;
  @ApiProperty() createdAt!: string;
}

// ------------------------------------------------------------------ leaderboard / history

export class CompeteLeaderboardRowDto {
  @ApiProperty() rank!: number;
  @ApiProperty() nickname!: string;
  @ApiProperty() returnBps!: string;
  @ApiProperty() equityMinor!: string;
  @ApiProperty({ enum: ENTRY_STATUSES }) status!: (typeof ENTRY_STATUSES)[number];
  @ApiProperty({ description: 'Final prize, or the projected prize while the round runs' })
  prizeMinor!: string;
  @ApiProperty() isMe!: boolean;
}

export class CompeteLeaderboardDto {
  @ApiProperty() roundId!: string;
  @ApiProperty({ enum: ROUND_STATUSES }) status!: (typeof ROUND_STATUSES)[number];
  @ApiProperty() participants!: number;
  @ApiProperty() potMinor!: string;
  @ApiProperty() asOf!: string;
  @ApiProperty({ type: [CompeteLeaderboardRowDto] }) rows!: CompeteLeaderboardRowDto[];
  @ApiPropertyOptional({ type: CompeteLeaderboardRowDto, nullable: true })
  me!: CompeteLeaderboardRowDto | null;
}

export class CompeteHistoryItemDto {
  @ApiProperty({ type: CompeteRoundDto }) round!: Omit<CompeteRoundDto, 'myEntry'>;
  @ApiProperty({ type: CompeteEntryDto }) entry!: CompeteEntryDto;
}
