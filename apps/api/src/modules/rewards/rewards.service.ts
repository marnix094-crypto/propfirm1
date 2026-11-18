import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService, type Tx } from '../../infra/prisma.service.js';
import { canonicalJson } from '../../common/json.js';
import { Errors } from '../../common/errors.js';
import type { Offer } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { POINTS_AWARDS, REWARDS } from './catalog.js';
import type { OfferDto, PointsSummaryDto } from './dto.js';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () =>
  'DF-' +
  Array.from(randomBytes(8))
    .map((b) => B32[b % B32.length])
    .join('');

export function offerStatus(o: Offer, now = new Date()): OfferDto['status'] {
  if (o.usedAt) return 'USED';
  return o.expiresAt.getTime() < now.getTime() ? 'EXPIRED' : 'AVAILABLE';
}

const toOfferDto = (o: Offer): OfferDto => ({
  id: o.id,
  code: o.code,
  discountBps: o.discountBps,
  source: o.source,
  expiresAt: o.expiresAt.toISOString(),
  usedAt: o.usedAt?.toISOString() ?? null,
  status: offerStatus(o),
  createdAt: o.createdAt.toISOString(),
});

/** Daily Points (earn from real activity, redeem for discount codes) and personal offers. */
@Injectable()
export class RewardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Book every award the user qualifies for and has not received yet (idempotent). */
  async sync(userId: string): Promise<void> {
    const [user, tfa, funded, days] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { emailVerifiedAt: true },
      }),
      this.prisma.twoFactor.findUnique({ where: { userId }, select: { enabledAt: true } }),
      this.prisma.tradingAccount.findMany({
        where: { userId, kind: 'FUNDED', purchaseId: { not: null } },
        select: { id: true },
      }),
      this.prisma.$queryRaw<{ day: string }[]>`
        SELECT DISTINCT to_char(f."executedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Amsterdam', 'YYYY-MM-DD') AS day
        FROM "Fill" f JOIN "TradingAccount" a ON a.id = f."accountId"
        WHERE a."userId" = ${userId}::uuid`,
    ]);
    const rows: {
      userId: string;
      reason: 'TRADING_DAY' | 'EMAIL_VERIFIED' | 'TWO_FACTOR' | 'FUNDED_ACCOUNT';
      refKey: string;
      amount: number;
    }[] = [];
    if (user.emailVerifiedAt)
      rows.push({
        userId,
        reason: 'EMAIL_VERIFIED',
        refKey: 'email',
        amount: POINTS_AWARDS.EMAIL_VERIFIED,
      });
    if (tfa?.enabledAt)
      rows.push({ userId, reason: 'TWO_FACTOR', refKey: '2fa', amount: POINTS_AWARDS.TWO_FACTOR });
    for (const a of funded)
      rows.push({
        userId,
        reason: 'FUNDED_ACCOUNT',
        refKey: a.id,
        amount: POINTS_AWARDS.FUNDED_ACCOUNT,
      });
    for (const d of days)
      rows.push({
        userId,
        reason: 'TRADING_DAY',
        refKey: d.day,
        amount: POINTS_AWARDS.TRADING_DAY,
      });
    if (rows.length) await this.prisma.pointsEntry.createMany({ data: rows, skipDuplicates: true });
  }

  private async balance(tx: Tx | PrismaService, userId: string) {
    const agg = await tx.pointsEntry.aggregate({ where: { userId }, _sum: { amount: true } });
    return agg._sum.amount ?? 0;
  }

  async summary(userId: string): Promise<PointsSummaryDto> {
    await this.sync(userId);
    const [earned, spent, history] = await Promise.all([
      this.prisma.pointsEntry.aggregate({
        where: { userId, amount: { gt: 0 } },
        _sum: { amount: true },
      }),
      this.prisma.pointsEntry.aggregate({
        where: { userId, amount: { lt: 0 } },
        _sum: { amount: true },
      }),
      this.prisma.pointsEntry.findMany({ where: { userId }, orderBy: { id: 'desc' }, take: 50 }),
    ]);
    const e = earned._sum.amount ?? 0;
    const s = -(spent._sum.amount ?? 0);
    return {
      balance: e - s,
      earned: e,
      spent: s,
      history: history.map((h) => ({
        id: h.id,
        reason: h.reason,
        refKey: h.refKey,
        amount: h.amount,
        createdAt: h.createdAt.toISOString(),
      })),
      rewards: REWARDS,
      earnRules: Object.entries(POINTS_AWARDS).map(([reason, points]) => ({ reason, points })),
      isExample: true,
    };
  }

  /** Spend points on a reward → a personal discount code. Idempotent per Idempotency-Key. */
  async redeem(userId: string, rewardId: string, key: string): Promise<OfferDto> {
    const reward = REWARDS.find((r) => r.id === rewardId);
    if (!reward) throw Errors.notFound('Reward');
    await this.sync(userId);
    const requestHash = sha256(canonicalJson({ rewardId }));
    return this.prisma.$transaction(async (tx) => {
      // One redemption at a time per user: the balance check and the spend are atomic.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`points:${userId}`}))`;
      const idem = await tx.idempotencyKey.findUnique({ where: { userId_key: { userId, key } } });
      if (idem) {
        if (idem.requestHash !== requestHash || idem.route !== 'POST /points/redeem')
          throw Errors.conflict(
            'IDEMPOTENCY_KEY_REUSED',
            'Idempotency-Key was used for a different request',
          );
        const o = await tx.offer.findUniqueOrThrow({
          where: { id: (idem.responseBody as { id: string }).id },
        });
        return toOfferDto(o);
      }
      if ((await this.balance(tx, userId)) < reward.points)
        throw Errors.unprocessable('POINTS_INSUFFICIENT', 'Not enough Daily Points');
      const offer = await tx.offer.create({
        data: {
          userId,
          code: newCode(),
          discountBps: reward.discountBps,
          source: 'POINTS',
          rewardId: reward.id,
          expiresAt: new Date(Date.now() + reward.validDays * 86_400_000),
        },
      });
      await tx.pointsEntry.create({
        data: { userId, reason: 'REDEEM', refKey: offer.id, amount: -reward.points },
      });
      await this.audit.append(tx, {
        actorType: 'USER',
        actorId: userId,
        action: 'points.redeemed',
        entityType: 'Offer',
        entityId: offer.id,
        data: { rewardId: reward.id, points: reward.points, discountBps: reward.discountBps },
      });
      await tx.idempotencyKey.create({
        data: {
          key,
          userId,
          route: 'POST /points/redeem',
          requestHash,
          responseStatus: 201,
          responseBody: { id: offer.id },
          expiresAt: new Date(Date.now() + 24 * 3_600_000),
        },
      });
      return toOfferDto(offer);
    });
  }

  async offers(userId: string): Promise<OfferDto[]> {
    const rows = await this.prisma.offer.findMany({ where: { userId }, orderBy: { id: 'desc' } });
    return rows.map(toOfferDto);
  }

  /** Checkout: reserve a code for a purchase inside the checkout transaction. */
  async reserveOffer(tx: Tx, userId: string, code: string, purchaseId: string): Promise<Offer> {
    const offer = await tx.offer.findFirst({ where: { code: code.trim().toUpperCase(), userId } });
    if (!offer) throw Errors.unprocessable('OFFER_INVALID', 'Unknown offer code');
    const status = offerStatus(offer);
    if (status === 'USED') throw Errors.unprocessable('OFFER_USED', 'Offer code already used');
    if (status === 'EXPIRED') throw Errors.unprocessable('OFFER_EXPIRED', 'Offer code expired');
    const updated = await tx.offer.updateMany({
      where: { id: offer.id, usedAt: null },
      data: { usedAt: new Date(), purchaseId },
    });
    if (updated.count !== 1) throw Errors.unprocessable('OFFER_USED', 'Offer code already used');
    return offer;
  }

  /** A failed or cancelled payment gives the code back. */
  async releaseOffer(tx: Tx, purchaseId: string): Promise<void> {
    await tx.offer.updateMany({ where: { purchaseId }, data: { usedAt: null, purchaseId: null } });
  }
}
