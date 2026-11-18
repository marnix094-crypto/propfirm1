-- CreateEnum
CREATE TYPE "DrawdownType" AS ENUM ('STATIC', 'TRAILING');

-- CreateEnum
CREATE TYPE "TrailingBasis" AS ENUM ('EQUITY', 'BALANCE');

-- CreateEnum
CREATE TYPE "DailyLossBasis" AS ENUM ('INITIAL_BALANCE', 'DAY_START');

-- CreateEnum
CREATE TYPE "DailyLossReference" AS ENUM ('DAY_START_BALANCE', 'DAY_START_EQUITY', 'MAX_OF_BOTH');

-- CreateEnum
CREATE TYPE "EmailTokenPurpose" AS ENUM ('VERIFY_EMAIL', 'RESET_PASSWORD');

-- AlterTable
ALTER TABLE "TradingAccount" ADD COLUMN     "dayStartBalanceMinor" BIGINT,
ADD COLUMN     "dayStartDate" TEXT,
ADD COLUMN     "dayStartEquityMinor" BIGINT,
ADD COLUMN     "failReason" TEXT,
ADD COLUMN     "lastTradingDate" TEXT,
ADD COLUMN     "ruleHighWaterMarkMinor" BIGINT,
ADD COLUMN     "ruleSetId" UUID,
ADD COLUMN     "tradingDaysCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TwoFactor" (
    "userId" UUID NOT NULL,
    "secretEnc" TEXT NOT NULL,
    "enabledAt" TIMESTAMP(3),
    "recoveryCodeHashes" TEXT[],
    "lastUsedStep" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TwoFactor_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "EmailToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "purpose" "EmailTokenPurpose" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleSet" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "maxDailyLossBps" INTEGER NOT NULL,
    "dailyLossBasis" "DailyLossBasis" NOT NULL,
    "dailyLossReference" "DailyLossReference" NOT NULL,
    "maxDrawdownBps" INTEGER NOT NULL,
    "drawdownType" "DrawdownType" NOT NULL,
    "trailingBasis" "TrailingBasis" NOT NULL,
    "trailingLocksAtInitial" BOOLEAN NOT NULL,
    "profitTargetBps" INTEGER,
    "minTradingDays" INTEGER NOT NULL DEFAULT 0,
    "maxLeverage" INTEGER NOT NULL,
    "profitSplitBps" INTEGER,
    "warnRatioBps" INTEGER NOT NULL DEFAULT 7000,
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RuleSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleViolation" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "ruleSetId" UUID NOT NULL,
    "rule" TEXT NOT NULL,
    "floorMinor" BIGINT NOT NULL,
    "observedMinor" BIGINT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RuleViolation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailToken_tokenHash_key" ON "EmailToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailToken_userId_purpose_idx" ON "EmailToken"("userId", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "RuleSet_code_version_key" ON "RuleSet"("code", "version");

-- CreateIndex
CREATE INDEX "RuleViolation_accountId_idx" ON "RuleViolation"("accountId");

-- AddForeignKey
ALTER TABLE "TwoFactor" ADD CONSTRAINT "TwoFactor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailToken" ADD CONSTRAINT "EmailToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleViolation" ADD CONSTRAINT "RuleViolation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingAccount" ADD CONSTRAINT "TradingAccount_ruleSetId_fkey" FOREIGN KEY ("ruleSetId") REFERENCES "RuleSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
