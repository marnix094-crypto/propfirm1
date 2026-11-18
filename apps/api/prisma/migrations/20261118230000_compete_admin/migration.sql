-- CreateEnum
CREATE TYPE "CompeteStaffRole" AS ENUM ('OWNER', 'SUPERADMIN');

-- AlterTable
ALTER TABLE "CompetePlayer" ADD COLUMN     "statusReason" TEXT;

-- CreateTable
CREATE TABLE "CompeteStaff" (
    "id" UUID NOT NULL,
    "operatorId" UUID,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "CompeteStaffRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "totpSecretEnc" TEXT,
    "totpEnabledAt" TIMESTAMP(3),
    "totpLastStep" BIGINT,
    "setupTokenHash" TEXT,
    "setupTokenExpires" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompeteStaff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompeteStaffSession" (
    "id" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompeteStaffSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompeteStaff_email_key" ON "CompeteStaff"("email");

-- CreateIndex
CREATE UNIQUE INDEX "CompeteStaff_setupTokenHash_key" ON "CompeteStaff"("setupTokenHash");

-- CreateIndex
CREATE INDEX "CompeteStaff_operatorId_idx" ON "CompeteStaff"("operatorId");

-- CreateIndex
CREATE UNIQUE INDEX "CompeteStaffSession_tokenHash_key" ON "CompeteStaffSession"("tokenHash");

-- CreateIndex
CREATE INDEX "CompeteStaffSession_staffId_idx" ON "CompeteStaffSession"("staffId");

-- AddForeignKey
ALTER TABLE "CompeteStaff" ADD CONSTRAINT "CompeteStaff_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "CompeteOperator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompeteStaffSession" ADD CONSTRAINT "CompeteStaffSession_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "CompeteStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- One owner per operator; superadmins have no operator (D104).
CREATE UNIQUE INDEX "CompeteStaff_one_owner" ON "CompeteStaff"("operatorId") WHERE "role" = 'OWNER';
ALTER TABLE "CompeteStaff" ADD CONSTRAINT "CompeteStaff_role_operator"
  CHECK (("role" = 'OWNER' AND "operatorId" IS NOT NULL) OR ("role" = 'SUPERADMIN' AND "operatorId" IS NULL));
