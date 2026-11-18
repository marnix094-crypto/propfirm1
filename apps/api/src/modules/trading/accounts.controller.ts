import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Errors } from '../../common/errors.js';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator.js';
import { AccountsService } from './accounts.service.js';
import { TradingService } from './trading.service.js';
import {
  AccountDto,
  AccountRulesDto,
  ClosePositionDto,
  EquityPointDto,
  EquityQuery,
  FillDto,
  LedgerEntryDto,
  OrderDto,
  OrdersQuery,
  PlaceOrderDto,
  PositionDto,
  UpdatePositionDto,
  FundingProgressDto,
  PerformanceDto,
  PerformanceQuery,
} from './dto.js';

const UUID = new ParseUUIDPipe({ version: '7' });

function requireIdempotencyKey(key: string | undefined): string {
  if (!key || !/^[A-Za-z0-9_-]{8,80}$/.test(key))
    throw Errors.unprocessable('IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required');
  return key;
}

@ApiTags('accounts')
@Controller('accounts')
export class AccountsController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly trading: TradingService,
  ) {}

  @Get()
  @ApiOkResponse({ type: [AccountDto] })
  list(@CurrentUser() u: AuthUser) {
    return this.accounts.list(u.id);
  }

  @Get(':id')
  @ApiOkResponse({ type: AccountDto })
  get(@CurrentUser() u: AuthUser, @Param('id', UUID) id: string) {
    return this.accounts.snapshot(u.id, id);
  }

  @Get(':id/rules')
  @ApiOkResponse({ type: AccountRulesDto })
  rules(@CurrentUser() u: AuthUser, @Param('id', UUID) id: string) {
    return this.accounts.rules(u.id, id);
  }

  @Get(':id/performance')
  @ApiOkResponse({ type: PerformanceDto })
  performance(
    @CurrentUser() u: AuthUser,
    @Param('id', UUID) id: string,
    @Query() q: PerformanceQuery,
  ) {
    return this.accounts.performance(u.id, id, q.month);
  }

  @Get(':id/funding')
  @ApiOkResponse({ type: FundingProgressDto })
  funding(@CurrentUser() u: AuthUser, @Param('id', UUID) id: string) {
    return this.accounts.funding(u.id, id);
  }

  @Get(':id/positions')
  @ApiOkResponse({ type: [PositionDto] })
  positions(@CurrentUser() u: AuthUser, @Param('id', UUID) id: string) {
    return this.accounts.positions(u.id, id);
  }

  @Get(':id/orders')
  @ApiOkResponse({ type: [OrderDto] })
  orders(@CurrentUser() u: AuthUser, @Param('id', UUID) id: string, @Query() q: OrdersQuery) {
    return this.accounts.orders(u.id, id, q.status);
  }

  @Get(':id/fills')
  @ApiOkResponse({ type: [FillDto] })
  fills(@CurrentUser() u: AuthUser, @Param('id', UUID) id: string) {
    return this.accounts.fills(u.id, id);
  }

  @Get(':id/ledger')
  @ApiOkResponse({ type: [LedgerEntryDto] })
  ledger(@CurrentUser() u: AuthUser, @Param('id', UUID) id: string) {
    return this.accounts.ledger(u.id, id);
  }

  @Get(':id/equity')
  @ApiOkResponse({ type: [EquityPointDto] })
  equity(@CurrentUser() u: AuthUser, @Param('id', UUID) id: string, @Query() q: EquityQuery) {
    return this.accounts.equity(u.id, id, q.range);
  }

  @Post(':id/orders')
  @Throttle({ default: { limit: 20, ttl: 1000 } })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiCreatedResponse({ type: OrderDto })
  placeOrder(
    @CurrentUser() u: AuthUser,
    @Param('id', UUID) id: string,
    @Body() dto: PlaceOrderDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.trading.placeOrder(u.id, id, dto, requireIdempotencyKey(key));
  }

  @Delete(':id/orders/:orderId')
  @ApiOkResponse({ type: OrderDto })
  cancel(
    @CurrentUser() u: AuthUser,
    @Param('id', UUID) id: string,
    @Param('orderId', UUID) orderId: string,
  ) {
    return this.trading.cancelOrder(u.id, id, orderId);
  }

  @Patch(':id/positions/:positionId')
  @HttpCode(204)
  async updatePosition(
    @CurrentUser() u: AuthUser,
    @Param('id', UUID) id: string,
    @Param('positionId', UUID) positionId: string,
    @Body() dto: UpdatePositionDto,
  ) {
    await this.trading.updatePosition(u.id, id, positionId, dto);
  }

  @Post(':id/positions/:positionId/close')
  @ApiOkResponse({ type: OrderDto })
  @HttpCode(200)
  closePosition(
    @CurrentUser() u: AuthUser,
    @Param('id', UUID) id: string,
    @Param('positionId', UUID) positionId: string,
    @Body() dto: ClosePositionDto,
  ) {
    return this.trading.closePosition(u.id, id, positionId, dto.qty);
  }

  @Post(':id/positions/close-all')
  @HttpCode(200)
  async closeAll(@CurrentUser() u: AuthUser, @Param('id', UUID) id: string) {
    return { closed: await this.trading.closeAll(u.id, id) };
  }

  @Post(':id/reset')
  @HttpCode(204)
  async reset(@CurrentUser() u: AuthUser, @Param('id', UUID) id: string) {
    await this.trading.resetDemo(u.id, id);
  }
}
