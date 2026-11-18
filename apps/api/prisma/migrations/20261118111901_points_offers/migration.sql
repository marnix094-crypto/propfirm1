-- CreateEnum
CREATE TYPE "PointsReason" AS ENUM ('TRADING_DAY', 'EMAIL_VERIFIED', 'TWO_FACTOR', 'FUNDED_ACCOUNT', 'REDEEM');

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "discountMinor" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PointsEntry" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "reason" "PointsReason" NOT NULL,
    "refKey" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointsEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "discountBps" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "rewardId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "purchaseId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PointsEntry_userId_id_idx" ON "PointsEntry"("userId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PointsEntry_userId_reason_refKey_key" ON "PointsEntry"("userId", "reason", "refKey");

-- CreateIndex
CREATE UNIQUE INDEX "Offer_code_key" ON "Offer"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Offer_purchaseId_key" ON "Offer"("purchaseId");

-- CreateIndex
CREATE INDEX "Offer_userId_id_idx" ON "Offer"("userId", "id");

-- AddForeignKey
ALTER TABLE "PointsEntry" ADD CONSTRAINT "PointsEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Discounts: the total is the snapshotted unit price × quantity minus the discount.
ALTER TABLE "Purchase" DROP CONSTRAINT "Purchase_amounts_check";
ALTER TABLE "Purchase"
  ADD CONSTRAINT "Purchase_amounts_check" CHECK (
    "unitPriceMinor" > 0 AND "accountSizeMinor" > 0 AND "discountMinor" >= 0
    AND "totalMinor" = "unitPriceMinor" * "quantity" - "discountMinor" AND "totalMinor" > 0
  );
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_discount_check" CHECK ("discountBps" > 0 AND "discountBps" < 10000);

-- Points ledger is append-only (redemptions are negative rows).
CREATE OR REPLACE FUNCTION points_entry_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'PointsEntry is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER points_entry_no_update BEFORE UPDATE ON "PointsEntry"
  FOR EACH ROW EXECUTE FUNCTION points_entry_immutable();
