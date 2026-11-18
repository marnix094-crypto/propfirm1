-- CreateTable
CREATE TABLE "CopierLink" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "masterAccountId" UUID NOT NULL,
    "followerAccountId" UUID NOT NULL,
    "multiplierBps" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CopierLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CopyEvent" (
    "id" UUID NOT NULL,
    "linkId" UUID NOT NULL,
    "masterOrderId" UUID NOT NULL,
    "followerOrderId" UUID,
    "symbol" TEXT NOT NULL,
    "side" "Side" NOT NULL,
    "qty" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "code" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CopyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certificate" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "accountSizeMinor" BIGINT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CopierLink_followerAccountId_key" ON "CopierLink"("followerAccountId");

-- CreateIndex
CREATE INDEX "CopierLink_masterAccountId_idx" ON "CopierLink"("masterAccountId");

-- CreateIndex
CREATE INDEX "CopyEvent_linkId_id_idx" ON "CopyEvent"("linkId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CopyEvent_linkId_masterOrderId_key" ON "CopyEvent"("linkId", "masterOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_accountId_key" ON "Certificate"("accountId");

-- AddForeignKey
ALTER TABLE "CopierLink" ADD CONSTRAINT "CopierLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopierLink" ADD CONSTRAINT "CopierLink_masterAccountId_fkey" FOREIGN KEY ("masterAccountId") REFERENCES "TradingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopierLink" ADD CONSTRAINT "CopierLink_followerAccountId_fkey" FOREIGN KEY ("followerAccountId") REFERENCES "TradingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopyEvent" ADD CONSTRAINT "CopyEvent_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "CopierLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CopierLink" ADD CONSTRAINT "CopierLink_multiplier_check" CHECK ("multiplierBps" BETWEEN 1000 AND 50000);
ALTER TABLE "CopierLink" ADD CONSTRAINT "CopierLink_distinct_check" CHECK ("masterAccountId" <> "followerAccountId");
