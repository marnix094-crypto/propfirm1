import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service.js';
import { Errors } from '../../common/errors.js';
import type { EmailTokenPurpose } from '../../generated/prisma/client.js';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const TTL_MS: Record<EmailTokenPurpose, number> = {
  VERIFY_EMAIL: 24 * 3_600_000,
  RESET_PASSWORD: 3_600_000,
};

/** Single-use, hashed, expiring email tokens. Issuing a new token invalidates older ones. */
@Injectable()
export class EmailTokensService {
  constructor(private readonly prisma: PrismaService) {}

  async issue(userId: string, purpose: EmailTokenPurpose): Promise<string> {
    const raw = randomBytes(32).toString('base64url');
    await this.prisma.$transaction([
      this.prisma.emailToken.updateMany({
        where: { userId, purpose, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.emailToken.create({
        data: {
          userId,
          purpose,
          tokenHash: sha256(raw),
          expiresAt: new Date(Date.now() + TTL_MS[purpose]),
        },
      }),
    ]);
    return raw;
  }

  /** Marks the token used and returns its user id; throws TOKEN_INVALID otherwise. */
  async consume(raw: string, purpose: EmailTokenPurpose): Promise<string> {
    const now = new Date();
    const res = await this.prisma.emailToken.updateManyAndReturn({
      where: { tokenHash: sha256(raw), purpose, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (res.length !== 1)
      throw Errors.unprocessable('TOKEN_INVALID', 'This link is invalid or has expired');
    return res[0]!.userId;
  }
}
