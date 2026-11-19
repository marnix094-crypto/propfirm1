import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { MarketDataModule } from '../market-data/market-data.module.js';
import { CompeteAuditService } from './compete-audit.service.js';
import { CompeteAuthGuard, CompeteTokensService } from './compete-auth.js';
import { CompeteController } from './compete.controller.js';
import { CompeteDevController } from './compete-dev.controller.js';
import { CompeteGateway } from './compete.gateway.js';
import { CompeteScheduler } from './compete.scheduler.js';
import { CompeteService } from './compete.service.js';
import { CompeteEvents } from './events.js';
import { CompeteOperatorsService } from './operators.service.js';
import { COMPETE_PAYMENTS, FakeCompetePaymentProvider } from './payments.js';
import { CompetePlayersService } from './players.service.js';
import { CompeteIntegrationService } from './integration.service.js';
import { CompeteSsoService } from './sso.service.js';
import { CompeteAdminController } from './admin/admin.controller.js';
import { CompeteAdminService } from './admin/admin.service.js';
import { CompeteAdminGuard, CompeteStaffTokens } from './admin/staff-auth.js';

/**
 * Compete — the second white-label product (daily paid trading competition, D97).
 * Self-contained: imports only market data (shared, read-only); nothing from the prop-firm
 * modules (auth, trading, firms, admin, audit) and nothing there imports this module.
 */
@Module({
  imports: [MarketDataModule],
  controllers: [CompeteController, CompeteAdminController, CompeteDevController],
  providers: [
    CompeteAuditService,
    CompeteTokensService,
    CompeteAuthGuard,
    CompeteOperatorsService,
    CompetePlayersService,
    CompeteIntegrationService,
    CompeteSsoService,
    CompeteService,
    CompeteEvents,
    CompeteScheduler,
    CompeteGateway,
    CompeteStaffTokens,
    CompeteAdminGuard,
    CompeteAdminService,
    {
      provide: COMPETE_PAYMENTS,
      inject: [APP_CONFIG],
      // Only the fake provider exists until a licensed PSP is chosen (D101); production refuses it.
      useFactory: (c: AppConfig) => new FakeCompetePaymentProvider(c.appBaseUrl),
    },
  ],
})
export class CompeteModule {}
