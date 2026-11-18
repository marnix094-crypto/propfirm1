import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const DECIMAL = /^\d+(\.\d+)?$/;

export class PlaceOrderDto {
  @ApiProperty({
    description: 'Client-generated id, unique per account (optimistic UI + idempotency)',
  })
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

  @ApiProperty({ enum: ['MARKET', 'LIMIT', 'STOP'] })
  @IsIn(['MARKET', 'LIMIT', 'STOP'])
  type!: 'MARKET' | 'LIMIT' | 'STOP';

  @ApiProperty({ description: 'Decimal string in base asset units', example: '0.010' })
  @Matches(DECIMAL)
  qty!: string;

  @ApiPropertyOptional({ description: 'Decimal string; required for LIMIT' })
  @ValidateIf((o: PlaceOrderDto) => o.type === 'LIMIT' || o.limitPrice !== undefined)
  @Matches(DECIMAL)
  limitPrice?: string;

  @ApiPropertyOptional({ description: 'Decimal string; required for STOP' })
  @ValidateIf((o: PlaceOrderDto) => o.type === 'STOP' || o.stopPrice !== undefined)
  @Matches(DECIMAL)
  stopPrice?: string;

  @ApiPropertyOptional({ description: 'Stop loss for the resulting position' })
  @IsOptional()
  @Matches(DECIMAL)
  slPrice?: string;

  @ApiPropertyOptional({ description: 'Take profit for the resulting position' })
  @IsOptional()
  @Matches(DECIMAL)
  tpPrice?: string;

  @ApiProperty({ minimum: 1, maximum: 125 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(125)
  leverage!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  reduceOnly?: boolean;
}

export class UpdatePositionDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Decimal string, or null to remove',
  })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Matches(DECIMAL)
  slPrice?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Decimal string, or null to remove',
  })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Matches(DECIMAL)
  tpPrice?: string | null;
}

export class ClosePositionDto {
  @ApiPropertyOptional({
    description: 'Partial close quantity (decimal string); omit to close fully',
  })
  @IsOptional()
  @Matches(DECIMAL)
  qty?: string;
}

export class OrderDto {
  @ApiProperty() id!: string;
  @ApiProperty() clientOrderId!: string;
  @ApiProperty() symbol!: string;
  @ApiProperty({ enum: ['BUY', 'SELL'] }) side!: string;
  @ApiProperty({ enum: ['MARKET', 'LIMIT', 'STOP'] }) type!: string;
  @ApiProperty() qty!: string;
  @ApiProperty({ type: String, nullable: true }) limitPrice!: string | null;
  @ApiProperty({ type: String, nullable: true }) stopPrice!: string | null;
  @ApiProperty({ type: String, nullable: true }) slPrice!: string | null;
  @ApiProperty({ type: String, nullable: true }) tpPrice!: string | null;
  @ApiProperty() leverage!: number;
  @ApiProperty() reduceOnly!: boolean;
  @ApiProperty({ enum: ['PENDING', 'OPEN', 'FILLED', 'CANCELLED', 'REJECTED'] }) status!: string;
  @ApiProperty() filledQty!: string;
  @ApiProperty({ type: String, nullable: true }) avgFillPrice!: string | null;
  @ApiProperty({ type: String, nullable: true }) rejectCode!: string | null;
  @ApiProperty() source!: string;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class PositionDto {
  @ApiProperty() id!: string;
  @ApiProperty() symbol!: string;
  @ApiProperty({ enum: ['LONG', 'SHORT'] }) side!: string;
  @ApiProperty() qty!: string;
  @ApiProperty() avgEntryPrice!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Price the position would close at now',
  })
  markPrice!: string | null;
  @ApiProperty() leverage!: number;
  @ApiProperty() usedMarginMinor!: string;
  @ApiProperty({ type: String, nullable: true }) unrealizedPnlMinor!: string | null;
  @ApiProperty() realizedPnlMinor!: string;
  @ApiProperty() fundingAccruedMinor!: string;
  @ApiProperty({ type: String, nullable: true }) slPrice!: string | null;
  @ApiProperty({ type: String, nullable: true }) tpPrice!: string | null;
  @ApiProperty() openedAt!: string;
}

export class FillDto {
  @ApiProperty() id!: string;
  @ApiProperty() orderId!: string;
  @ApiProperty() symbol!: string;
  @ApiProperty() side!: string;
  @ApiProperty() qty!: string;
  @ApiProperty() price!: string;
  @ApiProperty() commissionMinor!: string;
  @ApiProperty() realizedPnlMinor!: string;
  @ApiProperty() executedAt!: string;
}

export class AccountDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['DEMO', 'CHALLENGE', 'FUNDED', 'LIVE_BROKER'] }) kind!: string;
  @ApiProperty() label!: string;
  @ApiProperty() status!: string;
  @ApiProperty() isSimulated!: boolean;
  @ApiProperty() currency!: string;
  @ApiProperty() initialBalanceMinor!: string;
  @ApiProperty() balanceMinor!: string;
  @ApiProperty() equityMinor!: string;
  @ApiProperty() unrealizedPnlMinor!: string;
  @ApiProperty() usedMarginMinor!: string;
  @ApiProperty() freeMarginMinor!: string;
  @ApiProperty({ type: String, nullable: true }) marginLevelBps!: string | null;
  @ApiProperty({ description: 'Equity change since 00:00 Europe/Amsterdam' })
  dailyPnlMinor!: string;
  @ApiProperty() maxLeverage!: number;
  @ApiProperty() seq!: string;
  @ApiProperty({ description: 'Account is governed by a rule set (challenge/funded)' })
  hasRules!: boolean;
  @ApiProperty({ type: String, nullable: true, description: 'Rule that failed the account' })
  failReason!: string | null;
}

export class RuleProgressDto {
  @ApiProperty({ enum: ['DAILY_LOSS', 'MAX_DRAWDOWN', 'PROFIT_TARGET', 'MIN_TRADING_DAYS'] })
  rule!: string;
  @ApiProperty({ description: 'Loss so far (limits) or progress (targets), minor units or days' })
  usedMinor!: string;
  @ApiProperty() limitMinor!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Equity level that breaches the rule' })
  floorEquityMinor!: string | null;
  @ApiProperty({ enum: ['safe', 'warn', 'breach'] }) state!: string;
  @ApiProperty({ type: Boolean, nullable: true }) reached!: boolean | null;
}

export class RuleSetDto {
  @ApiProperty() code!: string;
  @ApiProperty() version!: number;
  @ApiProperty() name!: string;
  @ApiProperty() isExample!: boolean;
  @ApiProperty() maxDailyLossBps!: number;
  @ApiProperty() maxDrawdownBps!: number;
  @ApiProperty({ enum: ['STATIC', 'TRAILING'] }) drawdownType!: string;
  @ApiProperty({ type: Number, nullable: true }) profitTargetBps!: number | null;
  @ApiProperty() minTradingDays!: number;
  @ApiProperty({ type: Number, nullable: true }) profitSplitBps!: number | null;
  @ApiProperty() maxLeverage!: number;
}

export class AccountRulesDto {
  @ApiProperty({ type: RuleSetDto, nullable: true }) ruleSet!: RuleSetDto | null;
  @ApiProperty({ type: [RuleProgressDto] }) rules!: RuleProgressDto[];
  @ApiProperty({ type: String, nullable: true }) breach!: string | null;
  @ApiProperty() passed!: boolean;
  @ApiProperty() status!: string;
  @ApiProperty({ type: String, nullable: true }) failReason!: string | null;
  @ApiProperty() tradingDays!: number;
}

export class LedgerEntryDto {
  @ApiProperty() id!: string;
  @ApiProperty() type!: string;
  @ApiProperty() amountMinor!: string;
  @ApiProperty() balanceAfterMinor!: string;
  @ApiProperty() createdAt!: string;
}

export class EquityPointDto {
  @ApiProperty() t!: number;
  @ApiProperty() equityMinor!: string;
  @ApiProperty() balanceMinor!: string;
}

export class EquityQuery {
  @ApiProperty({ enum: ['1D', '1W', '1M', '3M', '6M', '1Y'], default: '1M' })
  @IsIn(['1D', '1W', '1M', '3M', '6M', '1Y'])
  range: '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' = '1M';
}

export class OrdersQuery {
  @ApiProperty({ enum: ['open', 'history'], default: 'open' })
  @IsIn(['open', 'history'])
  status: 'open' | 'history' = 'open';
}

export class PayoutConditionDto {
  @ApiProperty({
    enum: [
      'PAYOUT_INTERVAL',
      'PAYOUT_TRADING_DAYS',
      'PAYOUT_MIN_AMOUNT',
      'PAYOUT_NO_OPEN_POSITIONS',
    ],
  })
  code!: string;
  @ApiProperty() met!: boolean;
  @ApiProperty({ description: 'Days, count or minor units depending on the code (integer string)' })
  current!: string;
  @ApiProperty() required!: string;
}

export class PayoutProgressDto {
  @ApiProperty() eligible!: boolean;
  @ApiProperty() eligibleFrom!: string;
  @ApiProperty({ type: [PayoutConditionDto] }) conditions!: PayoutConditionDto[];
  @ApiProperty({ description: 'KYC is required before the first payout (phase 9)' })
  kycRequired!: boolean;
}

export class ScalingProgressDto {
  @ApiProperty() profitMinor!: string;
  @ApiProperty() targetMinor!: string;
  @ApiProperty() targetBps!: number;
  @ApiProperty() payouts!: number;
  @ApiProperty() requiredPayouts!: number;
  @ApiProperty() eligible!: boolean;
  @ApiProperty() stepBps!: number;
  @ApiProperty() nextSizeMinor!: string;
  @ApiProperty() maxSizeMinor!: string;
  @ApiProperty() atMaximum!: boolean;
}

export class FundingProgressDto {
  @ApiProperty({ description: 'False when the rule set defines no payout/scaling terms' })
  available!: boolean;
  @ApiProperty({ description: 'Values are examples, not the final offer' }) isExample!: boolean;
  @ApiProperty() accountSizeMinor!: string;
  @ApiProperty({ type: Number, nullable: true }) profitSplitBps!: number | null;
  @ApiProperty({ description: 'Closed profit in the current payout cycle' }) profitMinor!: string;
  @ApiProperty({ description: 'Trader share of that profit (simulated)' })
  traderShareMinor!: string;
  @ApiProperty({ type: PayoutProgressDto, nullable: true }) payout!: PayoutProgressDto | null;
  @ApiProperty({ type: ScalingProgressDto, nullable: true }) scaling!: ScalingProgressDto | null;
}
