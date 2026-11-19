import 'reflect-metadata';
import { loadConfig } from '../config/env.js';
import { PrismaService } from '../infra/prisma.service.js';
import { FieldCrypto } from '../modules/security/field-crypto.js';

/**
 * Prints the environment for a firm's own instance (D94): its database, DEFAULT_FIRM_SLUG and
 * public URL. Contains the database secret, so it is only available here — never over HTTP.
 *
 *   pnpm --filter @brand/api build && pnpm --filter @brand/api firm:instance-env <slug>
 */
const slug = process.argv[2]?.trim().toLowerCase();
if (!slug || !/^[a-z0-9-]{1,40}$/.test(slug)) {
  console.error('Usage: firm:instance-env <slug>');
  process.exit(1);
}
const config = loadConfig(process.env);
const prisma = new PrismaService(config);
await prisma.$connect();
try {
  const firm = await prisma.firm.findUnique({ where: { slug } });
  if (!firm) throw new Error(`Unknown firm ${slug}`);
  if (!firm.dedicatedDatabase || !firm.databaseUrlEnc)
    throw new Error(`Firm ${slug} has no own database (yet) — check its set-up steps`);
  const crypto = new FieldCrypto(config.fieldEncryptionKey);
  const sub = config.platformBaseDomain ? `${firm.slug}.${config.platformBaseDomain}` : null;
  console.log(
    [
      `# Own instance of ${firm.name} (${firm.slug}). Copy the other secrets from the platform`,
      `# (JWT_ACCESS_SECRET, FIELD_ENCRYPTION_KEY, SMTP_URL, …) — never share this output.`,
      'INSTANCE_MODE=dedicated',
      `DEFAULT_FIRM_SLUG=${firm.slug}`,
      `DATABASE_URL=${crypto.decrypt(firm.databaseUrlEnc)}`,
      `APP_BASE_URL=${sub ? `https://${sub}` : config.appBaseUrl}`,
      'DATABASE_PROVISIONER=none',
    ].join('\n'),
  );
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
