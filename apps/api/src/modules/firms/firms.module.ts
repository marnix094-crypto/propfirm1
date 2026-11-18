import { Global, Module } from '@nestjs/common';
import { FirmsService } from './firms.service.js';
import { ModuleGuard } from './module.guard.js';
import { PublicFirmController } from './public-firm.controller.js';

@Global()
@Module({
  controllers: [PublicFirmController],
  providers: [FirmsService, ModuleGuard],
  exports: [FirmsService, ModuleGuard],
})
export class FirmsModule {}
