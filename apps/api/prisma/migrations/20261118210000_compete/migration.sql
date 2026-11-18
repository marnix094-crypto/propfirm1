-- CreateEnum
CREATE TYPE "CompeteOperatorStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "CompetePlayerStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'SELF_EXCLUDED');

-- CreateEnum
CREATE TYPE "CompeteRoundStatus" AS ENUM ('OPEN', 'LIVE', 'SETTLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CompeteEntryStatus" AS ENUM ('PENDING_PAYMENT', 'PAYMENT_FAILED', 'ACTIVE', 'BREACHED', 'FINISHED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "CompetePaymentKind" AS ENUM ('ENTRY', 'REFUND', 'PRIZE');

-- CreateEnum
CREATE TYPE "CompetePaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'AWAITING_PAYOUT');

-- CreateTable
CREATE TABLE "CompeteOperator" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "primaryColor" TEXT NOT NULL DEFAULT '#AFE604',
    "domain" TEXT,
    "status" "CompeteOperatorStatus" NOT NULL DEFAULT 'ACTIVE',
    "timeZone" TEXT NOT NULL DEFAULT 'Europe/Amsterdam',
    "startMinuteOfDay" INTEGER NOT NULL DEFAULT 1200,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "entryFeeMinor" BIGINT NOT NULL DEFAULT 1000,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "startBalanceMinor" BIGINT NOT NULL DEFAULT 10000000,
    "leverage" INTEGER NOT NULL DEFAULT 100,
    "maxDrawdownBps" INTEGER NOT NULL DEFAULT 1000,
    "minParticipants" INTEGER NOT NULL DEFAULT 50,
    "prizePoolBps" INTEGER NOT NULL DEFAULT 8000,
    "prizeSplitBps" INTEGER[] DEFAULT ARRAY[5000, 3000, 2000]::INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompeteOperator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetePlayer" (
    "id" UUID NOT NULL,
    "operatorId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "country" CHAR(2) NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "adultConfirmedAt" TIMESTAMP(3) NOT NULL,
    "status" "CompetePlayerStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetePlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompeteSession" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompeteSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompeteRound" (
    "id" UUID NOT NULL,
    "operatorId" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "CompeteRoundStatus" NOT NULL DEFAULT 'OPEN',
    "entryFeeMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "startBalanceMinor" BIGINT NOT NULL,
    "leverage" INTEGER NOT NULL,
    "maxDrawdownBps" INTEGER NOT NULL,
    "minParticipants" INTEGER NOT NULL,
    "prizePoolBps" INTEGER NOT NULL,
    "prizeSplitBps" INTEGER[],
    "potMinor" BIGINT,
    "operatorShareMinor" BIGINT,
    "startedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompeteRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompeteEntry" (
    "id" UUID NOT NULL,
    "roundId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "status" "CompeteEntryStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "balanceMinor" BIGINT NOT NULL,
    "paidAt" TIMESTAMP(3),
    "finalEquityMinor" BIGINT,
    "rank" INTEGER,
    "prizeMinor" BIGINT,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompeteEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetePosition" (
    "id" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "instrumentId" UUID NOT NULL,
    "side" "PositionSide" NOT NULL,
    "qty" BIGINT NOT NULL,
    "avgEntryPrice" BIGINT NOT NULL,
    "leverage" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetePosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompeteOrder" (
    "id" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "clientOrderId" TEXT NOT NULL,
    "instrumentId" UUID NOT NULL,
    "side" "Side" NOT NULL,
    "qty" BIGINT NOT NULL,
    "price" BIGINT NOT NULL,
    "feeMinor" BIGINT NOT NULL,
    "realizedPnlMinor" BIGINT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'PLAYER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompeteOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetePayment" (
    "id" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "kind" "CompetePaymentKind" NOT NULL,
    "status" "CompetePaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompeteAuditLog" (
    "id" BIGSERIAL NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorType" "ActorType" NOT NULL,
    "actorId" UUID,
    "operatorId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "prevHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "CompeteAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompeteOperator_slug_key" ON "CompeteOperator"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "CompeteOperator_domain_key" ON "CompeteOperator"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "CompetePlayer_operatorId_email_key" ON "CompetePlayer"("operatorId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "CompetePlayer_operatorId_nickname_key" ON "CompetePlayer"("operatorId", "nickname");

-- CreateIndex
CREATE UNIQUE INDEX "CompeteSession_tokenHash_key" ON "CompeteSession"("tokenHash");

-- CreateIndex
CREATE INDEX "CompeteSession_playerId_idx" ON "CompeteSession"("playerId");

-- CreateIndex
CREATE INDEX "CompeteSession_familyId_idx" ON "CompeteSession"("familyId");

-- CreateIndex
CREATE INDEX "CompeteRound_status_startsAt_idx" ON "CompeteRound"("status", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "CompeteRound_operatorId_startsAt_key" ON "CompeteRound"("operatorId", "startsAt");

-- CreateIndex
CREATE INDEX "CompeteEntry_playerId_idx" ON "CompeteEntry"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "CompeteEntry_roundId_playerId_key" ON "CompeteEntry"("roundId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "CompetePosition_entryId_instrumentId_key" ON "CompetePosition"("entryId", "instrumentId");

-- CreateIndex
CREATE INDEX "CompeteOrder_entryId_createdAt_idx" ON "CompeteOrder"("entryId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CompeteOrder_entryId_clientOrderId_key" ON "CompeteOrder"("entryId", "clientOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "CompetePayment_providerRef_key" ON "CompetePayment"("providerRef");

-- CreateIndex
CREATE INDEX "CompetePayment_entryId_idx" ON "CompetePayment"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "CompeteAuditLog_hash_key" ON "CompeteAuditLog"("hash");

-- CreateIndex
CREATE INDEX "CompeteAuditLog_operatorId_id_idx" ON "CompeteAuditLog"("operatorId", "id");

-- CreateIndex
CREATE INDEX "CompeteAuditLog_entityType_entityId_idx" ON "CompeteAuditLog"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "CompetePlayer" ADD CONSTRAINT "CompetePlayer_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "CompeteOperator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompeteSession" ADD CONSTRAINT "CompeteSession_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "CompetePlayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompeteRound" ADD CONSTRAINT "CompeteRound_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "CompeteOperator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompeteEntry" ADD CONSTRAINT "CompeteEntry_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "CompeteRound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompeteEntry" ADD CONSTRAINT "CompeteEntry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "CompetePlayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetePosition" ADD CONSTRAINT "CompetePosition_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "CompeteEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetePosition" ADD CONSTRAINT "CompetePosition_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompeteOrder" ADD CONSTRAINT "CompeteOrder_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "CompeteEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompeteOrder" ADD CONSTRAINT "CompeteOrder_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetePayment" ADD CONSTRAINT "CompetePayment_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "CompeteEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Compete audit log and fills are append-only (same function as AuditLog, D102).
CREATE TRIGGER compete_audit_no_update BEFORE UPDATE OR DELETE ON "CompeteAuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
CREATE TRIGGER compete_audit_no_truncate BEFORE TRUNCATE ON "CompeteAuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_immutable();
CREATE TRIGGER compete_order_no_update BEFORE UPDATE OR DELETE ON "CompeteOrder"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

-- At most one entry per player per round, and money amounts are never negative.
ALTER TABLE "CompetePayment" ADD CONSTRAINT "CompetePayment_amount_nonneg" CHECK ("amountMinor" >= 0);
ALTER TABLE "CompeteRound" ADD CONSTRAINT "CompeteRound_window" CHECK ("endsAt" > "startsAt");
