import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { TIMEFRAMES, type Timeframe } from './types.js';

export class CandlesQuery {
  @ApiProperty({ enum: TIMEFRAMES, default: '1m' })
  @IsIn(TIMEFRAMES)
  tf: Timeframe = '1m';

  @ApiProperty({ type: Number, minimum: 1, maximum: 1000, default: 300, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit = 300;
}

export class InstrumentDto {
  @ApiProperty() symbol!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty() baseAsset!: string;
  @ApiProperty() quoteAsset!: string;
  @ApiProperty() priceDecimals!: number;
  @ApiProperty() qtyDecimals!: number;
  @ApiProperty({ description: 'Decimal string' }) tickSize!: string;
  @ApiProperty({ description: 'Decimal string' }) minQty!: string;
  @ApiProperty({ description: 'Decimal string' }) qtyStep!: string;
  @ApiProperty() maxLeverage!: number;
  @ApiProperty() commissionBps!: number;
}

export class QuoteDto {
  @ApiProperty() symbol!: string;
  @ApiProperty({ description: 'Decimal string' }) bid!: string;
  @ApiProperty({ description: 'Decimal string' }) ask!: string;
  @ApiProperty({ type: String, description: 'Decimal string', nullable: true }) markPrice!:
    string | null;
  @ApiProperty({ type: String, description: 'Funding rate, decimal string', nullable: true })
  fundingRate!: string | null;
  @ApiProperty() ts!: number;
}

export class CandleDto {
  @ApiProperty() t!: number;
  @ApiProperty() o!: string;
  @ApiProperty() h!: string;
  @ApiProperty() l!: string;
  @ApiProperty() c!: string;
  @ApiProperty() v!: string;
  @ApiProperty() closed!: boolean;
}

export class FeedStatusDto {
  @ApiProperty() source!: string;
  @ApiProperty({ enum: ['connecting', 'connected', 'down'] }) status!: string;
}

export class TickerDto {
  @ApiProperty() symbol!: string;
  @ApiProperty({ type: String, description: 'Last mid price, decimal string', nullable: true })
  last!: string | null;
  @ApiProperty({
    type: String,
    description: 'Price 24h ago (open of the 24h window), decimal string',
    nullable: true,
  })
  open24h!: string | null;
  @ApiProperty({ type: Number, description: '24h change in basis points', nullable: true })
  changeBps!: number | null;
  @ApiProperty({ type: String, nullable: true }) high24h!: string | null;
  @ApiProperty({ type: String, nullable: true }) low24h!: string | null;
}
