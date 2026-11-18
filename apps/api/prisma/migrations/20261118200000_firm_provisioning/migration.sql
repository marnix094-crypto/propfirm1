-- CreateEnum
CREATE TYPE "DomainStatus" AS ENUM ('NONE', 'PENDING_DNS', 'ACTIVE', 'FAILED');

-- CreateEnum
CREATE TYPE "ProvisioningStepKey" AS ENUM ('TENANT', 'ADMIN', 'DATABASE', 'SUBDOMAIN', 'CUSTOM_DOMAIN');

-- CreateEnum
CREATE TYPE "ProvisioningStatus" AS ENUM ('PENDING', 'RUNNING', 'WAITING', 'DONE', 'SKIPPED', 'FAILED');

-- AlterTable
ALTER TABLE "Firm" ADD COLUMN     "databaseUrlEnc" TEXT,
ADD COLUMN     "dedicatedDatabase" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "domainCheckedAt" TIMESTAMP(3),
ADD COLUMN     "domainStatus" "DomainStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "domainToken" VARCHAR(64);

-- CreateTable
CREATE TABLE "ProvisioningStep" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "step" "ProvisioningStepKey" NOT NULL,
    "status" "ProvisioningStatus" NOT NULL DEFAULT 'PENDING',
    "detail" VARCHAR(200),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProvisioningStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProvisioningStep_status_idx" ON "ProvisioningStep"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ProvisioningStep_firmId_step_key" ON "ProvisioningStep"("firmId", "step");

-- AddForeignKey
ALTER TABLE "ProvisioningStep" ADD CONSTRAINT "ProvisioningStep_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Domains set before verification existed must be verified first (no unverified routing).
UPDATE "Firm"
SET "domainStatus" = 'PENDING_DNS', "domainToken" = md5(random()::text || id::text)
WHERE "domain" IS NOT NULL;
