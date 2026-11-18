import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Errors } from '../../common/errors.js';
import { Public } from '../auth/public.decorator.js';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator.js';
import { CheckoutService } from './checkout.service.js';
import {
  CheckoutRequestDto,
  PayoutFeedDto,
  PriceQuoteDto,
  PriceQuoteRequestDto,
  ProductDto,
  ProductListDto,
  ProductQueryDto,
  PurchaseDto,
  PurchaseListDto,
  TestPaymentDto,
} from './dto.js';
import { ProductsService } from './products.service.js';

const UUID = new ParseUUIDPipe({ version: '7' });

@ApiTags('catalog')
@Controller()
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Public()
  @Get('products')
  @ApiOkResponse({ type: ProductListDto })
  async list(@Query() q: ProductQueryDto): Promise<ProductListDto> {
    return { items: await this.products.list(q.type) };
  }

  @Public()
  @Get('products/:id')
  @ApiOkResponse({ type: ProductDto })
  get(@Param('id', UUID) id: string) {
    return this.products.get(id);
  }

  @Public()
  @Post('products/quote')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOkResponse({ type: PriceQuoteDto })
  quote(@Body() dto: PriceQuoteRequestDto) {
    return this.products.quote(dto);
  }

  @Public()
  @Get('products/quotes/:id')
  @ApiOkResponse({ type: PriceQuoteDto })
  getQuote(@Param('id', UUID) id: string) {
    return this.products.getQuote(id);
  }

  /** Real, anonymised payouts only (D-social-proof). Empty until payouts exist (phase 9). */
  @Public()
  @Get('public/payouts-feed')
  @ApiOkResponse({ type: PayoutFeedDto })
  payoutsFeed(): PayoutFeedDto {
    return { items: [] };
  }
}

@ApiTags('checkout')
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiCreatedResponse({ type: PurchaseDto })
  create(
    @CurrentUser() u: AuthUser,
    @Body() dto: CheckoutRequestDto,
    @Headers('idempotency-key') key?: string,
  ) {
    if (!key || !/^[A-Za-z0-9_-]{8,80}$/.test(key))
      throw Errors.unprocessable('IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required');
    return this.checkout.create(u.id, dto, key);
  }

  @Get()
  @ApiOkResponse({ type: PurchaseListDto })
  async list(@CurrentUser() u: AuthUser): Promise<PurchaseListDto> {
    return { items: await this.checkout.list(u.id) };
  }

  @Get(':id')
  @ApiOkResponse({ type: PurchaseDto })
  get(@CurrentUser() u: AuthUser, @Param('id', UUID) id: string) {
    return this.checkout.get(u.id, id);
  }

  /** Test payments only (fake provider; never available in production). */
  @Post(':id/test-payment')
  @HttpCode(200)
  @ApiOkResponse({ type: PurchaseDto })
  testPayment(
    @CurrentUser() u: AuthUser,
    @Param('id', UUID) id: string,
    @Body() dto: TestPaymentDto,
  ) {
    return this.checkout.testPayment(u.id, id, dto.outcome);
  }
}
