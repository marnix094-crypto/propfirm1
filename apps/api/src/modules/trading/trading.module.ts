import { Module } from '@nestjs/common';
import { AccountStateService } from './account-state.service.js';
import { AccountsController } from './accounts.controller.js';
import { DevToolsController } from './dev-tools.controller.js';
import { AccountsService } from './accounts.service.js';
import { TradingEvents } from './events.js';
import { FundingScheduler } from './funding.scheduler.js';
import { TradingService } from './trading.service.js';

@Module({
  controllers: [AccountsController, DevToolsController],
  providers: [
    TradingEvents,
    AccountStateService,
    TradingService,
    AccountsService,
    FundingScheduler,
  ],
  exports: [TradingEvents, AccountStateService, TradingService, AccountsService],
})
export class TradingModule {}
