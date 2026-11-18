-- CreateTable
CREATE TABLE "Lead" (
    "id" UUID NOT NULL,
    "nameEnc" TEXT NOT NULL,
    "emailEnc" TEXT NOT NULL,
    "companyEnc" TEXT NOT NULL,
    "websiteEnc" TEXT,
    "messageEnc" TEXT,
    "volume" TEXT,
    "locale" VARCHAR(5) NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);
