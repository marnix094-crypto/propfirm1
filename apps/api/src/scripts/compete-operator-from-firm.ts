import 'reflect-metadata';
import { createHash, randomBytes } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { loadConfig } from '../config/env.js';
import { PrismaService } from '../infra/prisma.service.js';
import { CompeteAuditService } from '../modules/compete/compete-audit.service.js';

/**
 * Creates a Compete operator for an existing prop-firm client with one command (D110): same
 * slug, name, brand colour and logo. Only the branding is copied — players, rounds, money and
 * audit stay fully separate (D97). The firm's own domain is NOT copied: Compete runs on its own
 * (sub)domain, set and DNS-verified in the operator panel (Integration).
 *
 *   pnpm --filter @brand/api build && pnpm --filter @brand/api compete:operator:from-firm <firm-slug> <owner-email>
 */
const firmSlug = process.argv[2]?.trim().toLowerCase();
const email = process.argv[3]?.trim().toLowerCase();
if (!firmSlug || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Usage: compete:operator:from-firm <firm-slug> <owner-email>');
  process.exit(1);
}
const config = loadConfig(process.env);
const prisma = new PrismaService(config);
const audit = new CompeteAuditService(prisma);
await prisma.$connect();
try {
  const firm = await prisma.firm.findUnique({ where: { slug: firmSlug } });
  if (!firm) {
    console.error(`Firm "${firmSlug}" not found.`);
    process.exit(1);
  }
  if (await prisma.competeOperator.findUnique({ where: { slug: firm.slug } })) {
    console.error(`A Compete operator "${firm.slug}" already exists.`);
    process.exit(1);
  }
  if (await prisma.competeStaff.findUnique({ where: { email } })) {
    console.error('This e-mail already has a Compete admin account; use another e-mail.');
    process.exit(1);
  }
  const token = randomBytes(32).toString('base64url');
  const logo = firm.logoDataUrl && firm.logoDataUrl.length <= 200_000 ? firm.logoDataUrl : null;
  const op = await prisma.$transaction(async (tx) => {
    const op = await tx.competeOperator.create({
      data: {
        slug: firm.slug,
        name: firm.name,
        primaryColor: (firm.primaryColor ?? '#AFE604').toUpperCase(),
        logoDataUrl: logo,
        sourceFirmSlug: firm.slug,
      },
    });
    const owner = await tx.competeStaff.create({
      data: {
        operatorId: op.id,
        email,
        role: 'OWNER',
        passwordHash: await hash(randomBytes(32).toString('base64url')),
        setupTokenHash: createHash('sha256').update(token).digest('hex'),
        setupTokenExpires: new Date(Date.now() + 86_400_000),
      },
    });
    await audit.append(tx, {
      actorType: 'SYSTEM',
      actorId: null,
      operatorId: op.id,
      action: 'compete.operator.created_from_firm',
      entityType: 'CompeteOperator',
      entityId: op.id,
      data: { slug: op.slug, ownerId: owner.id, sourceFirmSlug: firm.slug },
    });
    return op;
  });
  console.log(`Compete operator "${op.slug}" created from firm "${firm.slug}" (branding only).`);
  console.log(
    `Owner sets the password within 24 hours: ${config.appBaseUrl}/en/compete/admin/setup?token=${token}`,
  );
} finally {
  await prisma.$disconnect();
}
