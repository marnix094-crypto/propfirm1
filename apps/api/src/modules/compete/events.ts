import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

export type CompeteEvent =
  | { type: 'round.update'; operatorId: string; roundId: string; status: string }
  | { type: 'entry.update'; entryId: string; roundId: string; reason: string };

/** In-process event bus of the compete product (bridged to the /compete WS namespace). */
@Injectable()
export class CompeteEvents {
  readonly events$ = new Subject<CompeteEvent>();
  emit(e: CompeteEvent) {
    this.events$.next(e);
  }
}
