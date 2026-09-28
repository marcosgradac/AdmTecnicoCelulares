-- CreateTable
CREATE TABLE "WarrantyClaim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "repairId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "resolvedAt" DATETIME,
    "coveredWarrantyStartedAt" DATETIME,
    "coveredWarrantyExpiresAt" DATETIME,
    "coveredWarrantyDurationDays" INTEGER,
    "coveredWarrantyConditions" TEXT,
    "deliveredAt" DATETIME,
    "newWarrantyDurationDays" INTEGER,
    "newWarrantyStartedAt" DATETIME,
    "newWarrantyExpiresAt" DATETIME,
    CONSTRAINT "WarrantyClaim_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WarrantyClaim_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "Repair" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WarrantyClaimExpense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "cashMovementId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WarrantyClaimExpense_claimId_businessId_fkey" FOREIGN KEY ("claimId", "businessId") REFERENCES "WarrantyClaim" ("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WarrantyClaimExpense_cashMovementId_businessId_fkey" FOREIGN KEY ("cashMovementId", "businessId") REFERENCES "CashMovement" ("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Repair" (
    "warrantyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "warrantyDurationDays" INTEGER,
    "warrantyStartedAt" DATETIME,
    "warrantyExpiresAt" DATETIME,
    "warrantyConditions" TEXT,
    "warrantyDeletedAt" DATETIME,
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "clientId" TEXT NOT NULL,
    "deviceBrand" TEXT NOT NULL,
    "deviceModel" TEXT NOT NULL,
    "imei" TEXT,
    "color" TEXT,
    "issue" TEXT NOT NULL,
    "diagnosis" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "total" INTEGER NOT NULL DEFAULT 0,
    "paid" INTEGER NOT NULL DEFAULT 0,
    "cancelledAt" DATETIME,
    "cancellationPaidAmount" INTEGER,
    "cancellationReviewFee" INTEGER,
    "cancellationReviewPaid" INTEGER NOT NULL DEFAULT 0,
    "cancellationRefundAmount" INTEGER,
    "cancellationRefundMethod" TEXT,
    "cancellationRefundMovementId" TEXT,
    "trackingToken" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Repair_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Repair_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Repair" ("businessId", "cancellationPaidAmount", "cancellationRefundAmount", "cancellationRefundMethod", "cancellationRefundMovementId", "cancellationReviewFee", "cancellationReviewPaid", "cancelledAt", "clientId", "color", "createdAt", "deviceBrand", "deviceModel", "diagnosis", "id", "imei", "issue", "notes", "number", "paid", "status", "total", "trackingToken", "updatedAt") SELECT "businessId", "cancellationPaidAmount", "cancellationRefundAmount", "cancellationRefundMethod", "cancellationRefundMovementId", "cancellationReviewFee", "cancellationReviewPaid", "cancelledAt", "clientId", "color", "createdAt", "deviceBrand", "deviceModel", "diagnosis", "id", "imei", "issue", "notes", "number", "paid", "status", "total", "trackingToken", "updatedAt" FROM "Repair";
DROP TABLE "Repair";
ALTER TABLE "new_Repair" RENAME TO "Repair";
CREATE UNIQUE INDEX "Repair_trackingToken_key" ON "Repair"("trackingToken");
CREATE INDEX "Repair_businessId_idx" ON "Repair"("businessId");
CREATE UNIQUE INDEX "Repair_businessId_number_key" ON "Repair"("businessId", "number");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "WarrantyClaim_businessId_status_idx" ON "WarrantyClaim"("businessId", "status");

-- CreateIndex
CREATE INDEX "WarrantyClaim_repairId_createdAt_idx" ON "WarrantyClaim"("repairId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WarrantyClaim_id_businessId_key" ON "WarrantyClaim"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "WarrantyClaimExpense_cashMovementId_key" ON "WarrantyClaimExpense"("cashMovementId");

-- CreateIndex
CREATE INDEX "WarrantyClaimExpense_claimId_createdAt_idx" ON "WarrantyClaimExpense"("claimId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WarrantyClaimExpense_businessId_idempotencyKey_key" ON "WarrantyClaimExpense"("businessId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "WarrantyClaimExpense_cashMovementId_businessId_key" ON "WarrantyClaimExpense"("cashMovementId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "CashMovement_id_businessId_key" ON "CashMovement"("id", "businessId");
