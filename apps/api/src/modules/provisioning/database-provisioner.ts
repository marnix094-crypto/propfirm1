import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';

/** What a dedicated instance needs to start serving its firm (D94). */
export interface DedicatedSeed {
  firm: {
    id: string;
    slug: string;
    name: string;
    primaryColor: string | null;
    logoDataUrl: string | null;
    supportEmail: string | null;
    disabledModules: string[];
  };
  owner: { id: string; email: string; locale: string; country: string };
  /** sha256 of the one-time invite token (the raw token is only mailed to the owner). */
  inviteTokenHash: string;
  inviteExpiresAt: Date;
}

/**
 * Creates a dedicated, migrated database for one firm and seeds the firm + its owner (D94).
 * Every method must be idempotent: the provisioning pipeline retries failed steps.
 */
export interface DatabaseProvisioner {
  readonly available: boolean;
  create(firm: { id: string; slug: string }): Promise<{ name: string; databaseUrl: string }>;
  seed(databaseUrl: string, data: DedicatedSeed): Promise<void>;
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
  seed(): Promise<never> {
    return Promise.reject(new Error('PROVISIONER_UNAVAILABLE'));
  }
}

/** Tests/dev: pretends to create the database. */
export class FakeDatabaseProvisioner implements DatabaseProvisioner {
  readonly available = true;
  readonly created: string[] = [];
  readonly seeded = new Map<string, DedicatedSeed>();
  async create(firm: { slug: string }) {
    const name = firmDatabaseName(firm.slug);
    if (!this.created.includes(name)) this.created.push(name);
    return { name, databaseUrl: `postgresql://fake@localhost:5432/${name}` };
  }
  async seed(databaseUrl: string, data: DedicatedSeed) {
    this.seeded.set(databaseUrl, data);
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

  /** Firm (same id/slug/brand) + owner + invite token, upserted so a retry is harmless. */
  async seed(databaseUrl: string, d: DedicatedSeed): Promise<void> {
    const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
    try {
      await db.$transaction(async (tx) => {
        await tx.firm.upsert({
          where: { id: d.firm.id },
          create: { ...d.firm },
          update: {},
        });
        await tx.user.upsert({
          where: { id: d.owner.id },
          create: {
            id: d.owner.id,
            firmId: d.firm.id,
            email: d.owner.email,
            firmRole: 'OWNER',
            // Unusable until the owner sets a password through the invite link.
            passwordHash: `!unset-${randomUUID()}`,
            locale: d.owner.locale,
            country: d.owner.country,
            termsAcceptedAt: new Date(),
            termsVersion: 'staff',
          },
          update: {},
        });
        await tx.emailToken.upsert({
          where: { tokenHash: d.inviteTokenHash },
          create: {
            userId: d.owner.id,
            purpose: 'RESET_PASSWORD',
            tokenHash: d.inviteTokenHash,
            expiresAt: d.inviteExpiresAt,
          },
          update: {},
        });
      });
    } finally {
      await db.$disconnect();
    }
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
