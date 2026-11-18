-- Client-dashboard modules a firm admin switched off (D92).
ALTER TABLE "Firm" ADD COLUMN "disabledModules" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
