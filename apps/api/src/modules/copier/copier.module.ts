import { Module } from '@nestjs/common';
import { TradingModule } from '../trading/trading.module.js';
import { CopierController } from './copier.controller.js';
import { CopierService } from './copier.service.js';

@Module({
  imports: [TradingModule],
  controllers: [CopierController],
  providers: [CopierService],
})
export class CopierModule {}
