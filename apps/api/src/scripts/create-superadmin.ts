import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { loadConfig } from '../config/env.js';
import { PrismaService } from '../infra/prisma.service.js';
import { EmailTokensService } from '../modules/auth/email-tokens.service.js';

/**
 * Creates (or re-invites) a Daily Funded superadmin (D91). Prints a one-time link to set the
 * password; 2FA is then required in the admin panel.
 *
 *   pnpm --filter @brand/api build && pnpm --filter @brand/api superadmin:create you@dailyfunded.com
 */
const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Usage: superadmin:create <email>');
  process.exit(1);
}
const config = loadConfig(process.env);
const prisma = new PrismaService(config);
await prisma.$connect();
try {
  const firm = await prisma.firm.upsert({
    where: { slug: config.defaultFirmSlug },
    create: { slug: config.defaultFirmSlug, name: 'Daily Funded' },
    update: {},
  });
  const existing = await prisma.user.findUnique({
    where: { firmId_email: { firmId: firm.id, email } },
  });
  if (existing && !existing.roles.includes('ADMIN') && !existing.firmRole) {
    console.error('This email belongs to a client account; use another email for staff.');
    process.exit(1);
  }
  const user =
    existing ??
    (await prisma.user.create({
      data: {
        firmId: firm.id,
        email,
        roles: ['ADMIN'],
        passwordHash: await hash(randomBytes(32).toString('base64url')),
        country: 'NL',
        locale: 'en',
        termsAcceptedAt: new Date(),
        termsVersion: 'staff',
      },
    }));
  const token = await new EmailTokensService(prisma).issue(user.id, 'RESET_PASSWORD');
  console.log(`Superadmin ${email} ${existing ? 'exists' : 'created'}.`);
  console.log(
    `Set the password within 1 hour: ${config.appBaseUrl}/en/reset-password?token=${token}&for=admin`,
  );
} finally {
  await prisma.$disconnect();
}
