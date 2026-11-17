import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { TradingModule } from '../trading/trading.module.js';
import { AccountGateway } from './account.gateway.js';
import { MarketGateway } from './market.gateway.js';

@Module({ imports: [AuthModule, TradingModule], providers: [MarketGateway, AccountGateway] })
export class RealtimeModule {}
