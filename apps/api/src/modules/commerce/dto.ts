import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Equals, IsIn, IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';
import { MAX_QUANTITY } from './products.catalog.js';

const PRODUCT_TYPES = ['INSTANT', 'ONE_STEP', 'TWO_STEP'] as const;

export class ProductRulesDto {
  @ApiProperty() maxDailyLossBps!: number;
  @ApiProperty() maxDrawdownBps!: number;
  @ApiProperty({ enum: ['STATIC', 'TRAILING'] }) drawdownType!: 'STATIC' | 'TRAILING';
  @ApiProperty() profitSplitBps!: number;
  @ApiProperty() maxLeverage!: number;
  @ApiProperty() minTradingDays!: number;
  @ApiProperty({ type: Number, nullable: true }) payoutIntervalDays!: number | null;
  @ApiProperty({ type: Number, nullable: true }) minTradingDaysPerPayout!: number | null;
  @ApiProperty({ type: Number, nullable: true }) scalingStepBps!: number | null;
  @ApiProperty({ description: 'Rule set has example values (not the final offer)' })
  isExample!: boolean;
}

export class ProductDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ enum: PRODUCT_TYPES }) type!: (typeof PRODUCT_TYPES)[number];
  @ApiProperty({ description: 'Simulated capital, USD minor units' }) accountSizeMinor!: string;
  @ApiProperty({ enum: ['USD'] }) accountCurrency!: 'USD';
  @ApiProperty({ description: 'One-time fee, minor units of priceCurrency' }) priceMinor!: string;
  @ApiProperty({ enum: ['EUR'] }) priceCurrency!: 'EUR';
  @ApiProperty() isRecommended!: boolean;
  @ApiProperty() isExample!: boolean;
  @ApiProperty({ type: ProductRulesDto }) rules!: ProductRulesDto;
}

export class ProductListDto {
  @ApiProperty({ type: [ProductDto] }) items!: ProductDto[];
}

export class ProductQueryDto {
  @ApiPropertyOptional({ enum: PRODUCT_TYPES })
  @IsOptional()
  @IsIn(PRODUCT_TYPES)
  type?: (typeof PRODUCT_TYPES)[number];
}

export class PriceQuoteRequestDto {
  @ApiProperty({ enum: PRODUCT_TYPES })
  @IsIn(PRODUCT_TYPES)
  type!: (typeof PRODUCT_TYPES)[number];

  @ApiProperty({ description: 'USD minor units, integer string', example: '3000000' })
  @Matches(/^\d{1,12}$/)
  accountSizeMinor!: string;

  @ApiProperty({ enum: [400, 600, 800] })
  @IsIn([400, 600, 800])
  maxDrawdownBps!: number;
}

export class PriceQuoteDto {
  @ApiProperty() quoteId!: string;
  @ApiProperty() priceMinor!: string;
  @ApiProperty({ enum: ['EUR'] }) priceCurrency!: 'EUR';
  @ApiProperty() accountSizeMinor!: string;
  @ApiProperty({ type: ProductRulesDto }) rules!: ProductRulesDto;
  @ApiProperty() expiresAt!: string;
}

export class CheckoutRequestDto {
  @ApiPropertyOptional({ description: 'Catalogue product (exactly one of productId / quoteId)' })
  @IsOptional()
  @IsUUID('7')
  productId?: string;

  @ApiPropertyOptional({ description: 'Custom-account quote' })
  @IsOptional()
  @IsUUID('7')
  quoteId?: string;

  @ApiProperty({ minimum: 1, maximum: MAX_QUANTITY })
  @IsInt()
  @Min(1)
  @Max(MAX_QUANTITY)
  quantity!: number;

  @ApiProperty({ description: 'Terms, risk disclosure and refund policy accepted' })
  @Equals(true)
  acceptTerms!: true;

  @ApiPropertyOptional({ enum: ['en', 'nl', 'es'] })
  @IsOptional()
  @IsIn(['en', 'nl', 'es'])
  locale?: 'en' | 'nl' | 'es';
}

export class PurchaseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['PENDING', 'PAID', 'FULFILLED', 'FAILED', 'CANCELLED'] })
  status!: 'PENDING' | 'PAID' | 'FULFILLED' | 'FAILED' | 'CANCELLED';
  @ApiProperty({ enum: PRODUCT_TYPES }) type!: (typeof PRODUCT_TYPES)[number];
  @ApiProperty() quantity!: number;
  @ApiProperty() accountSizeMinor!: string;
  @ApiProperty() unitPriceMinor!: string;
  @ApiProperty() totalMinor!: string;
  @ApiProperty({ enum: ['EUR'] }) currency!: 'EUR';
  @ApiProperty() provider!: string;
  @ApiProperty({ description: 'Test provider: no real money moves' }) isTestPayment!: boolean;
  @ApiProperty({ type: String, nullable: true }) paymentUrl!: string | null;
  @ApiProperty({ type: String, nullable: true }) failureCode!: string | null;
  @ApiProperty({ type: [String] }) accountIds!: string[];
  @ApiProperty({ type: ProductRulesDto }) rules!: ProductRulesDto;
  @ApiProperty() createdAt!: string;
}

export class PurchaseListDto {
  @ApiProperty({ type: [PurchaseDto] }) items!: PurchaseDto[];
}

export class TestPaymentDto {
  @ApiProperty({ enum: ['succeeded', 'failed', 'cancelled'] })
  @IsIn(['succeeded', 'failed', 'cancelled'])
  outcome!: 'succeeded' | 'failed' | 'cancelled';
}

export class PayoutFeedItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() countryCode!: string;
  @ApiProperty() amountMinor!: string;
  @ApiProperty({ enum: ['USD'] }) currency!: 'USD';
  @ApiProperty() paidAt!: string;
}

export class PayoutFeedDto {
  @ApiProperty({ type: [PayoutFeedItemDto] }) items!: PayoutFeedItemDto[];
}
