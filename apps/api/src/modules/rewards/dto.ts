import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { REWARDS } from './catalog.js';

export class PointsEntryDto {
  @ApiProperty() id!: string;
  @ApiProperty({
    enum: ['TRADING_DAY', 'EMAIL_VERIFIED', 'TWO_FACTOR', 'FUNDED_ACCOUNT', 'REDEEM'],
  })
  reason!: string;
  @ApiProperty({ description: 'Date, account id or reward id the entry belongs to' })
  refKey!: string;
  @ApiProperty() amount!: number;
  @ApiProperty() createdAt!: string;
}

export class RewardDto {
  @ApiProperty() id!: string;
  @ApiProperty() points!: number;
  @ApiProperty() discountBps!: number;
  @ApiProperty() validDays!: number;
}

export class EarnRuleDto {
  @ApiProperty({ enum: ['TRADING_DAY', 'EMAIL_VERIFIED', 'TWO_FACTOR', 'FUNDED_ACCOUNT'] })
  reason!: string;
  @ApiProperty() points!: number;
}

export class PointsSummaryDto {
  @ApiProperty() balance!: number;
  @ApiProperty() earned!: number;
  @ApiProperty() spent!: number;
  @ApiProperty({ type: [PointsEntryDto], description: 'Latest 50 entries' })
  history!: PointsEntryDto[];
  @ApiProperty({ type: [RewardDto] }) rewards!: RewardDto[];
  @ApiProperty({ type: [EarnRuleDto] }) earnRules!: EarnRuleDto[];
  @ApiProperty({ description: 'Values are examples, not final' }) isExample!: boolean;
}

export class RedeemDto {
  @ApiProperty({ enum: REWARDS.map((r) => r.id) })
  @IsIn(REWARDS.map((r) => r.id))
  rewardId!: string;
}

export class OfferDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() discountBps!: number;
  @ApiProperty({ enum: ['POINTS'] }) source!: string;
  @ApiProperty() expiresAt!: string;
  @ApiProperty({ type: String, nullable: true }) usedAt!: string | null;
  @ApiProperty({ enum: ['AVAILABLE', 'USED', 'EXPIRED'] }) status!:
    'AVAILABLE' | 'USED' | 'EXPIRED';
  @ApiProperty() createdAt!: string;
}

export class OfferListDto {
  @ApiProperty({ type: [OfferDto] }) items!: OfferDto[];
}
