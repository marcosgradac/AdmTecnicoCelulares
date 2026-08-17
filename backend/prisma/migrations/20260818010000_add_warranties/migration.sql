CREATE TYPE "WarrantyClaimStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED');

ALTER TABLE "Repair"
  ADD COLUMN "warrantyEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "warrantyDurationDays" INTEGER,
  ADD COLUMN "warrantyStartedAt" TIMESTAMP(3),
  ADD COLUMN "warrantyExpiresAt" TIMESTAMP(3);

CREATE TABLE "WarrantyClaim" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "repairId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status" "WarrantyClaimStatus" NOT NULL DEFAULT 'OPEN',
  "resolution" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "WarrantyClaim_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WarrantyClaim_businessId_status_idx" ON "WarrantyClaim"("businessId", "status");
CREATE INDEX "WarrantyClaim_repairId_createdAt_idx" ON "WarrantyClaim"("repairId", "createdAt");

ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "Repair"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
