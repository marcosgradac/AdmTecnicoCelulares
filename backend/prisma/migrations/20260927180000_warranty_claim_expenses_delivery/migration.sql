-- AlterTable
ALTER TABLE "WarrantyClaim" ADD COLUMN     "coveredWarrantyConditions" TEXT,
ADD COLUMN     "coveredWarrantyDurationDays" INTEGER,
ADD COLUMN     "coveredWarrantyExpiresAt" TIMESTAMP(3),
ADD COLUMN     "coveredWarrantyStartedAt" TIMESTAMP(3),
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "newWarrantyDurationDays" INTEGER,
ADD COLUMN     "newWarrantyExpiresAt" TIMESTAMP(3),
ADD COLUMN     "newWarrantyStartedAt" TIMESTAMP(3);

-- Preserve the best available coverage for claims created before this migration.
UPDATE "WarrantyClaim" AS claim
SET "coveredWarrantyStartedAt" = repair."warrantyStartedAt",
    "coveredWarrantyExpiresAt" = repair."warrantyExpiresAt",
    "coveredWarrantyDurationDays" = repair."warrantyDurationDays",
    "coveredWarrantyConditions" = repair."warrantyConditions"
FROM "Repair" AS repair
WHERE claim."repairId" = repair."id" AND claim."businessId" = repair."businessId";

-- CreateTable
CREATE TABLE "WarrantyClaimExpense" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "cashMovementId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarrantyClaimExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WarrantyClaimExpense_cashMovementId_key" ON "WarrantyClaimExpense"("cashMovementId");

-- CreateIndex
CREATE INDEX "WarrantyClaimExpense_claimId_createdAt_idx" ON "WarrantyClaimExpense"("claimId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WarrantyClaimExpense_businessId_idempotencyKey_key" ON "WarrantyClaimExpense"("businessId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "WarrantyClaimExpense_cashMovementId_businessId_key" ON "WarrantyClaimExpense"("cashMovementId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "WarrantyClaim_id_businessId_key" ON "WarrantyClaim"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "CashMovement_id_businessId_key" ON "CashMovement"("id", "businessId");

-- AddForeignKey
ALTER TABLE "WarrantyClaimExpense" ADD CONSTRAINT "WarrantyClaimExpense_claimId_businessId_fkey" FOREIGN KEY ("claimId", "businessId") REFERENCES "WarrantyClaim"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyClaimExpense" ADD CONSTRAINT "WarrantyClaimExpense_cashMovementId_businessId_fkey" FOREIGN KEY ("cashMovementId", "businessId") REFERENCES "CashMovement"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;
