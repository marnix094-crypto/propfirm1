import 'reflect-metadata';
import { createHash, randomBytes } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { loadConfig } from '../config/env.js';
import { PrismaService } from '../infra/prisma.service.js';

/**
 * Creates (or re-invites) a Daily Funded superadmin of the compete product (D104). Separate from
 * the prop-firm superadmin. Prints a one-time link (24 h) to set the password; 2FA follows.
 *
 *   pnpm --filter @brand/api build && pnpm --filter @brand/api compete:superadmin:create you@dailyfunded.com
 */
const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Usage: compete:superadmin:create <email>');
  process.exit(1);
}
const config = loadConfig(process.env);
const prisma = new PrismaService(config);
await prisma.$connect();
try {
  const existing = await prisma.competeStaff.findUnique({ where: { email } });
  if (existing && existing.role !== 'SUPERADMIN') {
    console.error('This e-mail belongs to an operator owner; use another e-mail.');
    process.exit(1);
  }
  const token = randomBytes(32).toString('base64url');
  const setup = {
    setupTokenHash: createHash('sha256').update(token).digest('hex'),
    setupTokenExpires: new Date(Date.now() + 86_400_000),
  };
  await prisma.competeStaff.upsert({
    where: { email },
    create: {
      email,
      role: 'SUPERADMIN',
      passwordHash: await hash(randomBytes(32).toString('base64url')),
      ...setup,
    },
    update: setup,
  });
  console.log(`Compete superadmin ${email} ${existing ? 'exists' : 'created'}.`);
  console.log(
    `Set the password within 24 hours: ${config.appBaseUrl}/en/compete/admin/setup?token=${token}`,
  );
} finally {
  await prisma.$disconnect();
}
