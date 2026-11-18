import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, type Tx } from '../../infra/prisma.service.js';
import type { RiskAlertType, RiskSeverity } from '../../generated/prisma/client.js';

/** A single realised loss of at least this share of the starting balance raises LARGE_LOSS. */
export const LARGE_LOSS_BPS = 200n;

export interface RiskSignal {
  accountId: string;
  userId: string;
  type: RiskAlertType;
  severity: RiskSeverity;
  /** Idempotency: the same key never creates a second alert. */
  dedupKey: string;
  /** Ids and amounts only (no PII). bigint values are stored as strings. */
  details: Record<string, unknown>;
}

const jsonSafe = (v: Record<string, unknown>) =>
  JSON.parse(
    JSON.stringify(v, (_k, x: unknown) => (typeof x === 'bigint' ? x.toString() : x)),
  ) as object;

/**
 * Risk alerts for a firm's admins (D88). Raising is idempotent per `dedupKey` and never
 * blocks trading: failures are logged, not thrown.
 */
@Injectable()
export class RiskAlertsService {
  private readonly logger = new Logger(RiskAlertsService.name);
  /** Keys already raised by this process (avoids a DB round trip on every tick). */
  private readonly seen = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Inside a business transaction (e.g. account failure). Deduplicated by the unique
   * `dedupKey` in the database, so a rolled-back transaction can raise it again later.
   */
  raiseTx(tx: Tx, s: RiskSignal): Promise<void> {
    return this.insert(tx, s);
  }

  private async insert(tx: Tx, s: RiskSignal): Promise<void> {
    const user = await tx.user.findUnique({ where: { id: s.userId }, select: { firmId: true } });
    if (!user) return;
    await tx.riskAlert.createMany({
      data: [
        {
          firmId: user.firmId,
          accountId: s.accountId,
          userId: s.userId,
          type: s.type,
          severity: s.severity,
          dedupKey: s.dedupKey,
          details: jsonSafe(s.details),
        },
      ],
      skipDuplicates: true,
    });
  }

  /** Fire-and-forget from hot paths (price ticks). */
  raise(s: RiskSignal): void {
    if (this.seen.has(s.dedupKey)) return;
    this.seen.add(s.dedupKey);
    void this.prisma
      .$transaction((tx) => this.insert(tx, s))
      .catch((e: Error) => {
        this.seen.delete(s.dedupKey);
        this.logger.warn(`risk alert ${s.dedupKey} failed: ${e.message}`);
      });
  }
}
