import { Global, Module } from '@nestjs/common';
import { FirmsService } from './firms.service.js';
import { PublicFirmController } from './public-firm.controller.js';

@Global()
@Module({
  controllers: [PublicFirmController],
  providers: [FirmsService],
  exports: [FirmsService],
})
export class FirmsModule {}
