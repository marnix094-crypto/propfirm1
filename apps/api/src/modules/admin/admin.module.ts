import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CommerceModule } from '../commerce/commerce.module.js';
import { TradingModule } from '../trading/trading.module.js';
import { AdminController } from './admin.controller.js';
import { DevStaffController } from './dev-staff.controller.js';
import { AdminGuard } from './admin.guard.js';
import { AdminService } from './admin.service.js';
import { AdminCatalogService } from './admin-catalog.service.js';
import { AdminFirmService } from './admin-firm.service.js';

@Module({
  imports: [AuthModule, CommerceModule, TradingModule],
  controllers: [AdminController, DevStaffController],
  providers: [AdminGuard, AdminService, AdminCatalogService, AdminFirmService],
})
export class AdminModule {}
