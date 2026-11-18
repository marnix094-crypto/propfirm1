import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

export type AccountEventType =
  | 'order.update'
  | 'position.update'
  | 'fill'
  | 'account.update'
  | 'account.status'
  | 'rule.progress';

export interface AccountEvent {
  accountId: string;
  userId: string;
  type: AccountEventType;
  /** Monotonic per account for persisted changes; 0 for transient (tick-driven) updates. */
  seq: bigint;
  payload: unknown;
}

/** In-process event bus for account events (fan-out to WebSocket gateways). */
@Injectable()
export class TradingEvents {
  readonly events$ = new Subject<AccountEvent>();
  emit(e: AccountEvent) {
    this.events$.next(e);
  }
}
