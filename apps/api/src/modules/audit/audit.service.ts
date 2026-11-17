import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService, type Tx } from '../../infra/prisma.service.js';
import { canonicalJson } from '../../common/json.js';
import type { ActorType } from '../../generated/prisma/client.js';

export interface AuditEntry {
  actorType: ActorType;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  /** Never put PII here — ids and amounts only. */
  data: Record<string, unknown>;
  requestId?: string | null;
}

export const GENESIS_HASH = '0'.repeat(64);

export function auditHash(prevHash: string, ts: Date, e: AuditEntry): string {
  const payload = canonicalJson({
    prevHash,
    ts: ts.toISOString(),
    actorType: e.actorType,
    actorId: e.actorId ?? null,
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId,
    data: e.data,
  });
  return createHash('sha256').update(payload).digest('hex');
}

/**
 * Append-only, hash-chained audit log. Appends are serialised with a transaction-scoped
 * advisory lock so the chain has no forks. Must be called inside the business transaction.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async append(tx: Tx, entry: AuditEntry): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('audit_log'))`;
    const last = await tx.auditLog.findFirst({ orderBy: { id: 'desc' }, select: { hash: true } });
    const prevHash = last?.hash ?? GENESIS_HASH;
    const ts = new Date();
    const data = JSON.parse(canonicalJson(entry.data)) as object;
    await tx.auditLog.create({
      data: {
        ts,
        actorType: entry.actorType,
        actorId: entry.actorId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        data,
        requestId: entry.requestId ?? null,
        prevHash,
        hash: auditHash(prevHash, ts, { ...entry, data: data as Record<string, unknown> }),
      },
    });
  }

  /** Recomputes the chain. Returns the id of the first broken row, or null when intact. */
  async verify(): Promise<{ ok: boolean; checked: number; brokenAtId: string | null }> {
    let prev = GENESIS_HASH;
    let checked = 0;
    let cursor: bigint | undefined;
    for (;;) {
      const rows = await this.prisma.auditLog.findMany({
        where: cursor ? { id: { gt: cursor } } : undefined,
        orderBy: { id: 'asc' },
        take: 1000,
      });
      if (rows.length === 0) return { ok: true, checked, brokenAtId: null };
      for (const r of rows) {
        const expected = auditHash(prev, r.ts, {
          actorType: r.actorType,
          actorId: r.actorId,
          action: r.action,
          entityType: r.entityType,
          entityId: r.entityId,
          data: r.data as Record<string, unknown>,
        });
        if (r.prevHash !== prev || r.hash !== expected)
          return { ok: false, checked, brokenAtId: r.id.toString() };
        prev = r.hash;
        checked++;
        cursor = r.id;
      }
    }
  }
}
