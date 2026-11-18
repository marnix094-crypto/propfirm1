import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService, type Tx } from '../../infra/prisma.service.js';
import { canonicalJson } from '../../common/json.js';
import type { ActorType } from '../../generated/prisma/client.js';

export interface CompeteAuditEntry {
  actorType: ActorType;
  actorId?: string | null;
  operatorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  /** Ids and amounts only — never PII. */
  data: Record<string, unknown>;
}

const GENESIS = '0'.repeat(64);

export function competeAuditHash(prevHash: string, ts: Date, e: CompeteAuditEntry): string {
  return createHash('sha256')
    .update(
      canonicalJson({
        prevHash,
        ts: ts.toISOString(),
        actorType: e.actorType,
        actorId: e.actorId ?? null,
        operatorId: e.operatorId,
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId,
        data: e.data,
      }),
    )
    .digest('hex');
}

/** Own append-only hash chain for the compete product (D102); separate from the prop-firm AuditLog. */
@Injectable()
export class CompeteAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async append(tx: Tx, e: CompeteAuditEntry): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('compete_audit_log'))`;
    const last = await tx.competeAuditLog.findFirst({
      orderBy: { id: 'desc' },
      select: { hash: true },
    });
    const prevHash = last?.hash ?? GENESIS;
    const ts = new Date();
    const data = JSON.parse(canonicalJson(e.data)) as Record<string, unknown>;
    await tx.competeAuditLog.create({
      data: {
        ts,
        actorType: e.actorType,
        actorId: e.actorId ?? null,
        operatorId: e.operatorId,
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId,
        data: data as object,
        prevHash,
        hash: competeAuditHash(prevHash, ts, { ...e, data }),
      },
    });
  }

  async verify(): Promise<{ ok: boolean; checked: number }> {
    let prev = GENESIS;
    let checked = 0;
    let cursor: bigint | undefined;
    for (;;) {
      const rows = await this.prisma.competeAuditLog.findMany({
        where: cursor ? { id: { gt: cursor } } : undefined,
        orderBy: { id: 'asc' },
        take: 1000,
      });
      if (rows.length === 0) return { ok: true, checked };
      for (const r of rows) {
        const expected = competeAuditHash(prev, r.ts, {
          actorType: r.actorType,
          actorId: r.actorId,
          operatorId: r.operatorId,
          action: r.action,
          entityType: r.entityType,
          entityId: r.entityId,
          data: r.data as Record<string, unknown>,
        });
        if (r.prevHash !== prev || r.hash !== expected) return { ok: false, checked };
        prev = r.hash;
        checked++;
        cursor = r.id;
      }
    }
  }
}
