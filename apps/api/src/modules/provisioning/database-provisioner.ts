import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

/** Creates a dedicated, migrated database for one firm (D94). Must be idempotent. */
export interface DatabaseProvisioner {
  readonly available: boolean;
  create(firm: { id: string; slug: string }): Promise<{ name: string; databaseUrl: string }>;
}

export const DATABASE_PROVISIONER = Symbol('DATABASE_PROVISIONER');

/** Database name for a firm: lowercase letters, digits and underscores only. */
export const firmDatabaseName = (slug: string) =>
  `df_firm_${slug.replace(/[^a-z0-9]/g, '_')}`.slice(0, 63);

export class NoDatabaseProvisioner implements DatabaseProvisioner {
  readonly available = false;
  create(): Promise<never> {
    return Promise.reject(new Error('PROVISIONER_UNAVAILABLE'));
  }
}

/** Tests/dev: pretends to create the database. */
export class FakeDatabaseProvisioner implements DatabaseProvisioner {
  readonly available = true;
  readonly created: string[] = [];
  async create(firm: { slug: string }) {
    const name = firmDatabaseName(firm.slug);
    if (!this.created.includes(name)) this.created.push(name);
    return { name, databaseUrl: `postgresql://fake@localhost:5432/${name}` };
  }
}

/**
 * Real Postgres: `CREATE DATABASE` via an admin connection (CREATEDB right), then the normal
 * migrations (`prisma migrate deploy`) against the new database. Safe to run again.
 */
export class PostgresDatabaseProvisioner implements DatabaseProvisioner {
  readonly available = true;
  constructor(
    private readonly adminUrl: string,
    /** The app's own DATABASE_URL: credentials and host are reused for the new database. */
    private readonly appUrl: string,
  ) {}

  async create(firm: { slug: string }) {
    const name = firmDatabaseName(firm.slug);
    const client = new pg.Client({ connectionString: this.adminUrl });
    await client.connect();
    try {
      const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
      const owner = new URL(this.appUrl).username;
      if (exists.rowCount === 0)
        // Identifiers cannot be bound as parameters; `name` is [a-z0-9_] only.
        await client.query(`CREATE DATABASE "${name}" OWNER "${owner.replace(/"/g, '')}"`);
    } finally {
      await client.end();
    }
    const url = new URL(this.appUrl);
    url.pathname = `/${name}`;
    await this.migrate(url.toString());
    return { name, databaseUrl: url.toString() };
  }

  private migrate(databaseUrl: string): Promise<void> {
    const cwd = fileURLToPath(new URL('../../../', import.meta.url));
    return new Promise((resolve, reject) => {
      const child = spawn('npx', ['prisma', 'migrate', 'deploy'], {
        cwd,
        env: { ...process.env, DATABASE_URL: databaseUrl },
        stdio: 'ignore',
      });
      child.on('error', reject);
      child.on('exit', (code) =>
        code === 0 ? resolve() : reject(new Error(`MIGRATION_FAILED_${code}`)),
      );
    });
  }
}
