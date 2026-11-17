import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { MarketDataController } from './market-data.controller.js';
import { createAdapter, MARKET_DATA_ADAPTER, MarketDataService } from './market-data.service.js';

@Global()
@Module({
  controllers: [MarketDataController],
  providers: [
    {
      provide: MARKET_DATA_ADAPTER,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig) => createAdapter(c),
    },
    MarketDataService,
  ],
  exports: [MarketDataService],
})
export class MarketDataModule {}
