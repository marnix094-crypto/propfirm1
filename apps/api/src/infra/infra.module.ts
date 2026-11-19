import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/env.js';
import { DNS_RESOLVER, FakeDnsResolver, SystemDnsResolver } from './dns.js';
import { EdgeRegistry } from './edge-registry.js';
import { PrismaService } from './prisma.service.js';
import { RedisService } from './redis.service.js';

@Global()
@Module({
  providers: [
    PrismaService,
    RedisService,
    EdgeRegistry,
    {
      provide: DNS_RESOLVER,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig) =>
        c.dnsResolver === 'fake' ? new FakeDnsResolver() : new SystemDnsResolver(),
    },
  ],
  exports: [PrismaService, RedisService, EdgeRegistry, DNS_RESOLVER],
})
export class InfraModule {}
