import { Module } from '@nestjs/common';
import { TradingModule } from '../trading/trading.module.js';
import { CommunityController } from './community.controller.js';
import { CommunityService } from './community.service.js';

@Module({
  imports: [TradingModule],
  controllers: [CommunityController],
  providers: [CommunityService],
})
export class CommunityModule {}
