import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule } from './config/config.module.js';
import { InfraModule } from './infra/infra.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { MailModule } from './modules/mail/mail.module.js';
import { SecurityModule } from './modules/security/security.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CommerceModule } from './modules/commerce/commerce.module.js';
import { JournalModule } from './modules/journal/journal.module.js';
import { RewardsModule } from './modules/rewards/rewards.module.js';
import { CommunityModule } from './modules/community/community.module.js';
import { CopierModule } from './modules/copier/copier.module.js';
import { CertificatesModule } from './modules/certificates/certificates.js';
import { HealthController } from './modules/health/health.controller.js';
import { MarketDataModule } from './modules/market-data/market-data.module.js';
import { RealtimeModule } from './modules/realtime/realtime.module.js';
import { RulesModule } from './modules/rules/rules.module.js';
import { TradingModule } from './modules/trading/trading.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({
  imports: [
    ConfigModule,
    InfraModule,
    AuditModule,
    SecurityModule,
    MailModule,
    // In-memory rate limiting per instance; Redis-backed storage follows with horizontal scaling.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 120 }],
      // Integration tests create many users from one IP; rate limits are covered separately.
      skipIf: () => process.env.NODE_ENV === 'test' && process.env.TEST_THROTTLE !== 'true',
    }),
    MarketDataModule,
    RulesModule,
    AuthModule,
    TradingModule,
    CommerceModule,
    JournalModule,
    RewardsModule,
    CommunityModule,
    CopierModule,
    CertificatesModule,
    RealtimeModule,
    UsersModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
