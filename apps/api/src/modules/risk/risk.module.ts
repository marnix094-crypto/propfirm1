import { Global, Module } from '@nestjs/common';
import { RiskAlertsService } from './risk-alerts.service.js';

@Global()
@Module({ providers: [RiskAlertsService], exports: [RiskAlertsService] })
export class RiskModule {}
