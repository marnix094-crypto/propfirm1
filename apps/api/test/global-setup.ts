import { execSync } from 'node:child_process';
import pg from 'pg';

/**
 * Creates a fresh `<db>_test` database and applies migrations once per test run.
 * (The audit log blocks TRUNCATE by design, so tests use a new database instead.)
 */
export default async function setup() {
  const base = process.env.DATABASE_URL ?? 'postgresql://brand:change-me@localhost:5432/brand';
  const url = new URL(base);
  const testDb = `${url.pathname.slice(1)}_test`;
  const admin = new pg.Client({ connectionString: base });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${testDb}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${testDb}"`);
  await admin.end();
  url.pathname = `/${testDb}`;
  process.env.TEST_DATABASE_URL = url.toString();
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: 'pipe',
  });
}
