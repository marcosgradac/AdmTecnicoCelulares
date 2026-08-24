ALTER TABLE "Subscription"
  ADD COLUMN "accessExpiresAt" TIMESTAMP(3),
  ADD COLUMN "graceDaysOverride" INTEGER,
  ADD COLUMN "manuallyBlockedAt" TIMESTAMP(3),
  ADD COLUMN "manualBlockReason" TEXT,
  ADD COLUMN "manualBlockNote" TEXT;

ALTER TABLE "BillingSettings"
  ADD COLUMN "expirationWarningDays" INTEGER NOT NULL DEFAULT 7,
  ADD COLUMN "defaultGraceDays" INTEGER NOT NULL DEFAULT 5;

CREATE TABLE "PlatformInternalNote" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformInternalNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PlatformInternalNote_businessId_createdAt_idx" ON "PlatformInternalNote"("businessId", "createdAt");
CREATE INDEX "PlatformInternalNote_authorUserId_idx" ON "PlatformInternalNote"("authorUserId");
ALTER TABLE "PlatformInternalNote" ADD CONSTRAINT "PlatformInternalNote_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
