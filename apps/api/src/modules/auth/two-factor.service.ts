import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service.js';
import { Errors } from '../../common/errors.js';
import { AuditService } from '../audit/audit.service.js';
import { FIELD_CRYPTO, type FieldCrypto } from '../security/field-crypto.js';
import { base32Encode, generateSecret, otpauthUri, verifyTotp } from '../security/totp.js';

const ISSUER = 'BRAND';
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const normalizeRecovery = (c: string) =>
  c
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

export function generateRecoveryCodes(n = 10): string[] {
  return Array.from({ length: n }, () => {
    const raw = base32Encode(randomBytes(5)).toLowerCase(); // 8 chars
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
  });
}

/** TOTP 2FA: secret encrypted at rest, recovery codes hashed, replay-protected verification. */
@Injectable()
export class TwoFactorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(FIELD_CRYPTO) private readonly crypto: FieldCrypto,
  ) {}

  async isEnabled(userId: string): Promise<boolean> {
    const tf = await this.prisma.twoFactor.findUnique({
      where: { userId },
      select: { enabledAt: true },
    });
    return !!tf?.enabledAt;
  }

  /** Start (or restart) setup: a new pending secret until enabled with a valid code. */
  async setup(userId: string, email: string) {
    if (await this.isEnabled(userId))
      throw Errors.conflict('TWO_FACTOR_ALREADY_ENABLED', '2FA is already enabled');
    const secret = generateSecret();
    const secretEnc = this.crypto.encrypt(secret);
    await this.prisma.twoFactor.upsert({
      where: { userId },
      create: { userId, secretEnc, recoveryCodeHashes: [] },
      update: { secretEnc, enabledAt: null, recoveryCodeHashes: [], lastUsedStep: null },
    });
    return { secret, otpauthUri: otpauthUri(ISSUER, email, secret) };
  }

  async enable(userId: string, code: string): Promise<string[]> {
    const tf = await this.prisma.twoFactor.findUnique({ where: { userId } });
    if (!tf) throw Errors.unprocessable('TWO_FACTOR_NOT_SET_UP', 'Start 2FA setup first');
    if (tf.enabledAt) throw Errors.conflict('TWO_FACTOR_ALREADY_ENABLED');
    const step = verifyTotp(this.crypto.decrypt(tf.secretEnc), code, tf.lastUsedStep);
    if (step === null)
      throw Errors.unprocessable('TWO_FACTOR_CODE_INVALID', 'The code is not valid');
    const codes = generateRecoveryCodes();
    await this.prisma.$transaction(async (tx) => {
      await tx.twoFactor.update({
        where: { userId },
        data: {
          enabledAt: new Date(),
          lastUsedStep: step,
          recoveryCodeHashes: codes.map((c) => sha256(normalizeRecovery(c))),
        },
      });
      await this.audit.append(tx, {
        actorType: 'USER',
        actorId: userId,
        action: 'user.2fa_enabled',
        entityType: 'User',
        entityId: userId,
        data: {},
      });
    });
    return codes;
  }

  /**
   * Verify a TOTP code (or a recovery code when allowed). Consumes recovery codes and
   * records the used step to prevent replays. Returns false when invalid.
   */
  async verify(userId: string, code: string | undefined, recoveryCode?: string): Promise<boolean> {
    const tf = await this.prisma.twoFactor.findUnique({ where: { userId } });
    if (!tf?.enabledAt) return false;
    if (code) {
      const step = verifyTotp(this.crypto.decrypt(tf.secretEnc), code, tf.lastUsedStep);
      if (step === null) return false;
      // Conditional update: a concurrent verify of the same step loses.
      const r = await this.prisma.twoFactor.updateMany({
        where: { userId, OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: step } }] },
        data: { lastUsedStep: step },
      });
      return r.count === 1;
    }
    if (recoveryCode) {
      const h = sha256(normalizeRecovery(recoveryCode));
      if (!tf.recoveryCodeHashes.includes(h)) return false;
      await this.prisma.$transaction(async (tx) => {
        await tx.twoFactor.update({
          where: { userId },
          data: { recoveryCodeHashes: tf.recoveryCodeHashes.filter((x) => x !== h) },
        });
        await this.audit.append(tx, {
          actorType: 'USER',
          actorId: userId,
          action: 'user.2fa_recovery_code_used',
          entityType: 'User',
          entityId: userId,
          data: { remaining: tf.recoveryCodeHashes.length - 1 },
        });
      });
      return true;
    }
    return false;
  }

  async disable(userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.twoFactor.delete({ where: { userId } });
      await this.audit.append(tx, {
        actorType: 'USER',
        actorId: userId,
        action: 'user.2fa_disabled',
        entityType: 'User',
        entityId: userId,
        data: {},
      });
    });
  }

  async regenerateRecoveryCodes(userId: string): Promise<string[]> {
    const codes = generateRecoveryCodes();
    await this.prisma.$transaction(async (tx) => {
      await tx.twoFactor.update({
        where: { userId },
        data: { recoveryCodeHashes: codes.map((c) => sha256(normalizeRecovery(c))) },
      });
      await this.audit.append(tx, {
        actorType: 'USER',
        actorId: userId,
        action: 'user.recovery_codes_regenerated',
        entityType: 'User',
        entityId: userId,
        data: {},
      });
    });
    return codes;
  }
}
