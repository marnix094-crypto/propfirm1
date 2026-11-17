import { describe, expect, it } from 'vitest';
import { auditHash, GENESIS_HASH } from './audit.service.js';

describe('auditHash', () => {
  const ts = new Date('2026-01-01T00:00:00.000Z');
  const entry = {
    actorType: 'USER' as const,
    actorId: null,
    action: 'order.placed',
    entityType: 'Order',
    entityId: 'o1',
    data: { b: 2n, a: 1 },
  };

  it('is deterministic and independent of key order', () => {
    expect(auditHash(GENESIS_HASH, ts, entry)).toBe(
      auditHash(GENESIS_HASH, ts, { ...entry, data: { a: 1, b: 2n } }),
    );
  });
  it('changes when any field or the previous hash changes', () => {
    const h = auditHash(GENESIS_HASH, ts, entry);
    expect(auditHash('1'.repeat(64), ts, entry)).not.toBe(h);
    expect(auditHash(GENESIS_HASH, ts, { ...entry, data: { a: 1, b: 3n } })).not.toBe(h);
    expect(auditHash(GENESIS_HASH, new Date(ts.getTime() + 1), entry)).not.toBe(h);
  });
});
