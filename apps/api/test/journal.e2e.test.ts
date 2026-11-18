import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, registerUser, type TestApp } from './app.js';

let t: TestApp;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});

describe('journal (notebook)', () => {
  it('creates, lists newest first with a cursor, updates and deletes own entries', async () => {
    const u = await registerUser(t);
    const ids: string[] = [];
    for (const n of [1, 2, 3]) {
      const res = await t
        .http()
        .post('/api/v1/journal')
        .set(bearer(u.token))
        .send({
          date: '2026-11-18',
          title: `Note ${n}`,
          body: 'Waited for the retest.',
          tags: ['btc', ' btc ', 'patience'],
          accountId: u.accountId,
        });
      expect(res.status).toBe(201);
      expect(res.body.tags).toEqual(['btc', 'patience']);
      ids.push(res.body.id);
    }
    const p1 = await t.http().get('/api/v1/journal?limit=2').set(bearer(u.token));
    expect(p1.body.items.map((e: { title: string }) => e.title)).toEqual(['Note 3', 'Note 2']);
    const p2 = await t
      .http()
      .get(`/api/v1/journal?limit=2&cursor=${p1.body.nextCursor}`)
      .set(bearer(u.token));
    expect(p2.body.items.map((e: { title: string }) => e.title)).toEqual(['Note 1']);
    expect(p2.body.nextCursor).toBeNull();

    const upd = await t
      .http()
      .patch(`/api/v1/journal/${ids[0]}`)
      .set(bearer(u.token))
      .send({ title: 'Edited' });
    expect(upd.body).toMatchObject({ title: 'Edited', body: 'Waited for the retest.' });
    expect((await t.http().delete(`/api/v1/journal/${ids[0]}`).set(bearer(u.token))).status).toBe(
      204,
    );
  });

  it('keeps notes private and validates input', async () => {
    const a = await registerUser(t);
    const b = await registerUser(t);
    const res = await t
      .http()
      .post('/api/v1/journal')
      .set(bearer(a.token))
      .send({ date: '2026-11-18', title: 'Mine', body: '' });
    const other = await t
      .http()
      .patch(`/api/v1/journal/${res.body.id}`)
      .set(bearer(b.token))
      .send({ title: 'x' });
    expect(other.status).toBe(404);
    expect((await t.http().get('/api/v1/journal').set(bearer(b.token))).body.items).toEqual([]);
    const foreignAccount = await t
      .http()
      .post('/api/v1/journal')
      .set(bearer(b.token))
      .send({ date: '2026-11-18', title: 'x', body: '', accountId: a.accountId });
    expect(foreignAccount.status).toBe(404);
    const bad = await t
      .http()
      .post('/api/v1/journal')
      .set(bearer(a.token))
      .send({ date: '2026-13-01', title: '', body: '' });
    expect(bad.status).toBe(400);
  });
});
