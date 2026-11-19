import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { CommerceModule } from '../commerce/commerce.module.js';
import {
  DATABASE_PROVISIONER,
  FakeDatabaseProvisioner,
  NoDatabaseProvisioner,
  PostgresDatabaseProvisioner,
} from './database-provisioner.js';
import { TlsAllowController } from './provisioning.controller.js';
import { ProvisioningService } from './provisioning.service.js';

@Module({
  imports: [CommerceModule],
  controllers: [TlsAllowController],
  providers: [
    ProvisioningService,
    {
      provide: DATABASE_PROVISIONER,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig) =>
        c.databaseProvisioner === 'postgres'
          ? new PostgresDatabaseProvisioner(c.databaseAdminUrl!, c.databaseUrl)
          : c.databaseProvisioner === 'fake'
            ? new FakeDatabaseProvisioner()
            : new NoDatabaseProvisioner(),
    },
  ],
  exports: [ProvisioningService, DATABASE_PROVISIONER],
})
export class ProvisioningModule {}
