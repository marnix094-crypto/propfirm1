-- Multi-tenancy (D83): every trader, product and competition belongs to a firm.
CREATE TYPE "FirmRole" AS ENUM ('OWNER', 'ADMIN', 'SUPPORT');
CREATE TYPE "FirmStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "RiskAlertType" AS ENUM ('BREACH', 'NEAR_BREACH', 'LARGE_LOSS');
CREATE TYPE "RiskSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

CREATE TABLE "Firm" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(40) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "status" "FirmStatus" NOT NULL DEFAULT 'ACTIVE',
    "domain" VARCHAR(253),
    "primaryColor" CHAR(7),
    "logoDataUrl" TEXT,
    "supportEmail" VARCHAR(254),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Firm_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Firm_slug_format" CHECK ("slug" ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$'),
    CONSTRAINT "Firm_color_format" CHECK ("primaryColor" IS NULL OR "primaryColor" ~ '^#[0-9A-F]{6}$')
);
CREATE UNIQUE INDEX "Firm_slug_key" ON "Firm"("slug");
CREATE UNIQUE INDEX "Firm_domain_key" ON "Firm"("domain");

-- Default firm: all existing data belongs to it (also the dev/demo tenant).
INSERT INTO "Firm" ("id", "slug", "name")
VALUES ('01900000-0000-7000-8000-000000000001', 'daily-funded', 'Daily Funded');

-- Users
ALTER TABLE "User" ADD COLUMN "firmId" UUID, ADD COLUMN "firmRole" "FirmRole";
UPDATE "User" SET "firmId" = '01900000-0000-7000-8000-000000000001';
ALTER TABLE "User" ALTER COLUMN "firmId" SET NOT NULL;
DROP INDEX "User_email_key";
CREATE UNIQUE INDEX "User_firmId_email_key" ON "User"("firmId", "email");
CREATE INDEX "User_firmId_createdAt_idx" ON "User"("firmId", "createdAt");
ALTER TABLE "User" ADD CONSTRAINT "User_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rule sets: existing rows stay platform templates (firmId NULL). Rows are immutable,
-- so only the column is added; no UPDATE.
ALTER TABLE "RuleSet" ADD COLUMN "firmId" UUID;
DROP INDEX "RuleSet_code_version_key";
CREATE UNIQUE INDEX "RuleSet_firmId_code_version_key" ON "RuleSet"("firmId", "code", "version");
CREATE UNIQUE INDEX "RuleSet_template_code_version_key" ON "RuleSet"("code", "version") WHERE "firmId" IS NULL;
ALTER TABLE "RuleSet" ADD CONSTRAINT "RuleSet_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Products
ALTER TABLE "Product" ADD COLUMN "firmId" UUID;
UPDATE "Product" SET "firmId" = '01900000-0000-7000-8000-000000000001';
ALTER TABLE "Product" ALTER COLUMN "firmId" SET NOT NULL;
DROP INDEX "Product_slug_key";
CREATE UNIQUE INDEX "Product_firmId_slug_key" ON "Product"("firmId", "slug");
ALTER TABLE "Product" ADD CONSTRAINT "Product_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Competitions
ALTER TABLE "Competition" ADD COLUMN "firmId" UUID;
UPDATE "Competition" SET "firmId" = '01900000-0000-7000-8000-000000000001';
ALTER TABLE "Competition" ALTER COLUMN "firmId" SET NOT NULL;
DROP INDEX "Competition_slug_key";
CREATE UNIQUE INDEX "Competition_firmId_slug_key" ON "Competition"("firmId", "slug");
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Audit log: new rows carry the tenant. Existing rows keep NULL (append-only, no UPDATE).
ALTER TABLE "AuditLog" ADD COLUMN "firmId" UUID;
CREATE INDEX "AuditLog_firmId_id_idx" ON "AuditLog"("firmId", "id");

-- Risk alerts
CREATE TABLE "RiskAlert" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "RiskAlertType" NOT NULL,
    "severity" "RiskSeverity" NOT NULL,
    "dedupKey" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ackAt" TIMESTAMP(3),
    "ackById" UUID,
    CONSTRAINT "RiskAlert_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RiskAlert_dedupKey_key" ON "RiskAlert"("dedupKey");
CREATE INDEX "RiskAlert_firmId_ackAt_createdAt_idx" ON "RiskAlert"("firmId", "ackAt", "createdAt");
ALTER TABLE "RiskAlert" ADD CONSTRAINT "RiskAlert_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
