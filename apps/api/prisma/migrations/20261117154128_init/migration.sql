-- CreateEnum
CREATE TYPE "Role" AS ENUM ('TRADER', 'SUPPORT', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING_DELETION', 'DELETED');

-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('DEMO', 'CHALLENGE', 'FUNDED', 'LIVE_BROKER');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'PASSED', 'FAILED', 'PENDING_FUNDED', 'FUNDED_ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "Side" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('MARKET', 'LIMIT', 'STOP');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'OPEN', 'FILLED', 'CANCELLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('USER', 'SYSTEM_SL', 'SYSTEM_TP', 'SYSTEM_STOPOUT', 'SYSTEM_BREACH', 'ADMIN');

-- CreateEnum
CREATE TYPE "PositionSide" AS ENUM ('LONG', 'SHORT');

-- CreateEnum
CREATE TYPE "PositionStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM ('INITIAL_CAPITAL', 'REALIZED_PNL', 'COMMISSION', 'FUNDING', 'PAYOUT', 'ADJUSTMENT', 'RESET');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'ADMIN', 'SUPPORT', 'SYSTEM');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "passwordHash" TEXT NOT NULL,
    "roles" "Role"[] DEFAULT ARRAY['TRADER']::"Role"[],
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "country" CHAR(2) NOT NULL,
    "termsAcceptedAt" TIMESTAMP(3) NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Instrument" (
    "id" UUID NOT NULL,
    "symbol" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "assetClass" TEXT NOT NULL DEFAULT 'CRYPTO',
    "baseAsset" TEXT NOT NULL,
    "quoteAsset" TEXT NOT NULL,
    "priceDecimals" INTEGER NOT NULL,
    "qtyDecimals" INTEGER NOT NULL,
    "tickSize" BIGINT NOT NULL,
    "minQty" BIGINT NOT NULL,
    "qtyStep" BIGINT NOT NULL,
    "maxLeverage" INTEGER NOT NULL,
    "spreadMarkupBps" INTEGER NOT NULL,
    "commissionBps" INTEGER NOT NULL,
    "slippageBaseBps" INTEGER NOT NULL,
    "slippageImpactBpsPer100k" INTEGER NOT NULL,
    "slippageMaxBps" INTEGER NOT NULL,
    "fundingIntervalHours" INTEGER NOT NULL DEFAULT 8,
    "marketDataSource" TEXT NOT NULL DEFAULT 'binance-usdm',
    "externalSymbol" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Instrument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradingAccount" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "AccountKind" NOT NULL,
    "isSimulated" BOOLEAN NOT NULL DEFAULT true,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "label" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "initialBalanceMinor" BIGINT NOT NULL,
    "balanceMinor" BIGINT NOT NULL,
    "highWaterMarkMinor" BIGINT NOT NULL,
    "maxLeverage" INTEGER NOT NULL DEFAULT 50,
    "stopOutLevelBps" INTEGER NOT NULL DEFAULT 5000,
    "seq" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "TradingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "clientOrderId" TEXT NOT NULL,
    "instrumentId" UUID NOT NULL,
    "side" "Side" NOT NULL,
    "type" "OrderType" NOT NULL,
    "qty" BIGINT NOT NULL,
    "limitPrice" BIGINT,
    "stopPrice" BIGINT,
    "slPrice" BIGINT,
    "tpPrice" BIGINT,
    "leverage" INTEGER NOT NULL,
    "reduceOnly" BOOLEAN NOT NULL DEFAULT false,
    "status" "OrderStatus" NOT NULL,
    "filledQty" BIGINT NOT NULL DEFAULT 0,
    "avgFillPrice" BIGINT,
    "rejectCode" TEXT,
    "source" "OrderSource" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fill" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "instrumentId" UUID NOT NULL,
    "side" "Side" NOT NULL,
    "qty" BIGINT NOT NULL,
    "price" BIGINT NOT NULL,
    "referencePrice" BIGINT NOT NULL,
    "spreadCostMinor" BIGINT NOT NULL,
    "slippageCostMinor" BIGINT NOT NULL,
    "commissionMinor" BIGINT NOT NULL,
    "realizedPnlMinor" BIGINT NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "instrumentId" UUID NOT NULL,
    "side" "PositionSide" NOT NULL,
    "qty" BIGINT NOT NULL,
    "avgEntryPrice" BIGINT NOT NULL,
    "leverage" INTEGER NOT NULL,
    "realizedPnlMinor" BIGINT NOT NULL DEFAULT 0,
    "fundingAccruedMinor" BIGINT NOT NULL DEFAULT 0,
    "slPrice" BIGINT,
    "tpPrice" BIGINT,
    "status" "PositionStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "lastFundingAt" TIMESTAMP(3),

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" BIGSERIAL NOT NULL,
    "accountId" UUID NOT NULL,
    "type" "LedgerType" NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "balanceAfterMinor" BIGINT NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquitySnapshot" (
    "accountId" UUID NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL,
    "balanceMinor" BIGINT NOT NULL,
    "equityMinor" BIGINT NOT NULL,
    "usedMarginMinor" BIGINT NOT NULL,

    CONSTRAINT "EquitySnapshot_pkey" PRIMARY KEY ("accountId","ts")
);

-- CreateTable
CREATE TABLE "Watchlist" (
    "userId" UUID NOT NULL,
    "symbols" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Watchlist_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "key" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "route" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseBody" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("userId","key")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" BIGSERIAL NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorType" "ActorType" NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "requestId" TEXT,
    "prevHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "Instrument_symbol_key" ON "Instrument"("symbol");

-- CreateIndex
CREATE INDEX "TradingAccount_userId_idx" ON "TradingAccount"("userId");

-- CreateIndex
CREATE INDEX "Order_accountId_status_idx" ON "Order"("accountId", "status");

-- CreateIndex
CREATE INDEX "Order_instrumentId_status_idx" ON "Order"("instrumentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Order_accountId_clientOrderId_key" ON "Order"("accountId", "clientOrderId");

-- CreateIndex
CREATE INDEX "Fill_accountId_executedAt_idx" ON "Fill"("accountId", "executedAt");

-- CreateIndex
CREATE INDEX "Position_accountId_status_idx" ON "Position"("accountId", "status");

-- CreateIndex
CREATE INDEX "Position_instrumentId_status_idx" ON "Position"("instrumentId", "status");

-- CreateIndex
CREATE INDEX "LedgerEntry_accountId_id_idx" ON "LedgerEntry"("accountId", "id");

-- CreateIndex
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_hash_key" ON "AuditLog"("hash");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingAccount" ADD CONSTRAINT "TradingAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fill" ADD CONSTRAINT "Fill_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fill" ADD CONSTRAINT "Fill_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fill" ADD CONSTRAINT "Fill_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquitySnapshot" ADD CONSTRAINT "EquitySnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watchlist" ADD CONSTRAINT "Watchlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Audit log is append-only: block UPDATE, DELETE and TRUNCATE.
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only (% blocked)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON "AuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_immutable();

-- Ledger entries are append-only too.
CREATE TRIGGER ledger_no_update BEFORE UPDATE OR DELETE ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

-- Netting: at most one OPEN position per account and instrument.
CREATE UNIQUE INDEX "Position_one_open_per_instrument" ON "Position" ("accountId", "instrumentId") WHERE "status" = 'OPEN';

-- Sanity checks.
ALTER TABLE "Position" ADD CONSTRAINT "Position_qty_positive" CHECK ("status" = 'CLOSED' OR "qty" > 0);
ALTER TABLE "Order" ADD CONSTRAINT "Order_qty_positive" CHECK ("qty" > 0);
