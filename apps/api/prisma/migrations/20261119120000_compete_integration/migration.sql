-- CreateEnum
CREATE TYPE "CompeteDomainStatus" AS ENUM ('NONE', 'PENDING_DNS', 'ACTIVE');

-- AlterTable
ALTER TABLE "CompeteOperator" ADD COLUMN     "domainCheckedAt" TIMESTAMP(3),
ADD COLUMN     "domainStatus" "CompeteDomainStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "domainToken" VARCHAR(64),
ADD COLUMN     "logoDataUrl" TEXT,
ADD COLUMN     "sourceFirmSlug" TEXT,
ADD COLUMN     "ssoEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ssoSecretEnc" TEXT,
ADD COLUMN     "widgetOrigins" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "CompetePlayer" ADD COLUMN     "externalId" VARCHAR(128),
ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "CompetePlayer_operatorId_externalId_key" ON "CompetePlayer"("operatorId", "externalId");

-- Domains set before D108 were never verified: they must now pass DNS verification.
UPDATE "CompeteOperator"
SET "domainStatus" = 'PENDING_DNS', "domainToken" = md5(random()::text || id::text)
WHERE "domain" IS NOT NULL;
