import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { RedisService } from '../../infra/redis.service.js';
import { MarketDataService } from '../market-data/market-data.service.js';
import { TradingService } from './trading.service.js';

const CHECK_MS = 15_000;

/**
 * Settles funding every interval (8h on Binance) using the last rate published before the
 * funding time. A Redis key makes each (instrument, fundingTime) settle once across instances.
 */
@Injectable()
export class FundingScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FundingScheduler.name);
  private timer?: NodeJS.Timeout;
  private readonly pending = new Map<
    string,
    { fundingTime: number; rate: bigint; markPrice: bigint }
  >();

  constructor(
    private readonly md: MarketDataService,
    private readonly trading: TradingService,
    private readonly redis: RedisService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.check(), CHECK_MS);
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async check(now = Date.now()) {
    for (const inst of this.md.instruments()) {
      const mark = this.md.mark(inst.symbol);
      const prev = this.pending.get(inst.id);
      if (prev && now >= prev.fundingTime) {
        this.pending.delete(inst.id);
        const lock = await this.redis.client
          .set(`funding:${inst.symbol}:${prev.fundingTime}`, '1', 'EX', 86_400, 'NX')
          .catch(() => 'OK');
        if (lock === 'OK') {
          const n = await this.trading.settleFunding(
            inst.id,
            prev.fundingTime,
            mark?.markPrice ?? prev.markPrice,
            prev.rate,
          );
          if (n > 0)
            this.logger.log(
              `Funding ${inst.symbol} @ ${new Date(prev.fundingTime).toISOString()}: ${n} positions`,
            );
        }
      }
      if (mark && mark.nextFundingTime > now) {
        this.pending.set(inst.id, {
          fundingTime: mark.nextFundingTime,
          rate: mark.fundingRate,
          markPrice: mark.markPrice,
        });
      }
    }
  }
}
