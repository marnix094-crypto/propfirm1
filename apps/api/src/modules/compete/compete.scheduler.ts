import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { RedisService } from '../../infra/redis.service.js';
import { CompeteService } from './compete.service.js';

const TICK_MS = 5_000;
const DRAWDOWN_MS = 1_000;

/**
 * Drives the round lifecycle (every 5 s) and the drawdown sweep (every second). A short Redis
 * lock keeps one instance doing each tick; all transitions are idempotent anyway.
 */
@Injectable()
export class CompeteScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(CompeteScheduler.name);
  private timers: NodeJS.Timeout[] = [];
  private busy = { tick: false, sweep: false };

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly compete: CompeteService,
    private readonly redis: RedisService,
  ) {}

  onApplicationBootstrap() {
    if (!this.config.compete.loopEnabled) return;
    this.timers.push(setInterval(() => void this.run('tick', TICK_MS), TICK_MS));
    this.timers.push(setInterval(() => void this.run('sweep', DRAWDOWN_MS), DRAWDOWN_MS));
  }

  onModuleDestroy() {
    for (const t of this.timers) clearInterval(t);
  }

  private async run(kind: 'tick' | 'sweep', ttlMs: number) {
    if (this.busy[kind]) return;
    this.busy[kind] = true;
    try {
      const lock = await this.redis.client
        .set(`compete:${kind}`, '1', 'PX', ttlMs, 'NX')
        .catch(() => 'OK');
      if (lock !== 'OK') return;
      if (kind === 'tick') await this.compete.tick();
      else await this.compete.sweepDrawdown();
    } catch (err) {
      this.logger.warn(`Compete ${kind} failed: ${(err as Error).message}`);
    } finally {
      this.busy[kind] = false;
    }
  }
}
