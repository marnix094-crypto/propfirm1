import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../config/env.js';

/** Two connections: one for commands/publish, one dedicated to subscriptions. */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;
  readonly subscriber: Redis;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    const opts = { lazyConnect: false, maxRetriesPerRequest: 3 };
    this.client = new Redis(config.redisUrl, opts);
    this.subscriber = new Redis(config.redisUrl, opts);
    for (const c of [this.client, this.subscriber]) {
      c.on('error', (e: Error) => this.logger.warn(`Redis error: ${e.message}`));
    }
  }

  async onModuleDestroy() {
    await Promise.allSettled([this.client.quit(), this.subscriber.quit()]);
  }
}
