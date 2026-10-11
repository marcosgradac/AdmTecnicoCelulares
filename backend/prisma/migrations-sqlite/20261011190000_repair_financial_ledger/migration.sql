-- AlterTable
ALTER TABLE "Repair" ADD COLUMN "cancellationRefundPaid" INTEGER;
ALTER TABLE "Repair" ADD COLUMN "cancellationRequestId" TEXT;
ALTER TABLE "Repair" ADD COLUMN "cancellationRequestPayload" TEXT;
ALTER TABLE "Repair" ADD COLUMN "financeVersion" INTEGER;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CashMovement" (
    "accountingOnly" BOOLEAN NOT NULL DEFAULT false,
    "repairFinanceKind" TEXT,
    "relatedMovementId" TEXT,
    "operationKey" TEXT,
    "operationPayload" TEXT,
    "performedByUserId" TEXT,
    "reason" TEXT,
    "resaleDeviceId" TEXT,
    "resaleKind" TEXT,
    "resaleVersion" INTEGER,
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'GENERAL',
    "repairId" TEXT,
    "clientName" TEXT,
    "commerceSaleId" TEXT,
    "relatedCommerceSaleId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CashMovement_repair_correction_shape" CHECK (NOT "accountingOnly" OR ("type" = 'EXPENSE' AND "amount" < 0 AND "method" IS NULL AND "repairFinanceKind" IS NOT NULL AND "repairFinanceKind" = 'EXPENSE_CORRECTION' AND "relatedMovementId" IS NOT NULL AND "repairId" IS NOT NULL AND "reason" IS NOT NULL AND length(trim("reason")) >= 5)),
    CONSTRAINT "CashMovement_classified_money_shape" CHECK ("repairFinanceKind" IS NULL OR ("repairFinanceKind" = 'EXPENSE_CORRECTION' AND "accountingOnly") OR (NOT "accountingOnly" AND "amount" > 0 AND "method" IS NOT NULL AND "repairId" IS NOT NULL AND (("repairFinanceKind" IN ('PURCHASE', 'CUSTOMER_REFUND') AND "type" = 'EXPENSE' AND "relatedMovementId" IS NULL) OR ("repairFinanceKind" IN ('ADVANCE', 'PAYMENT', 'REVIEW_PAYMENT') AND "type" = 'INCOME' AND "relatedMovementId" IS NULL) OR ("repairFinanceKind" = 'SUPPLIER_REFUND' AND "type" = 'INCOME' AND "relatedMovementId" IS NOT NULL)))),
    CONSTRAINT "CashMovement_relatedMovementId_businessId_fkey" FOREIGN KEY ("relatedMovementId", "businessId") REFERENCES "CashMovement" ("id", "businessId") ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "CashMovement_resaleDeviceId_fkey" FOREIGN KEY ("resaleDeviceId") REFERENCES "ResaleDevice" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CashMovement_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CashMovement_commerceSaleId_fkey" FOREIGN KEY ("commerceSaleId") REFERENCES "CommerceSale" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CashMovement_relatedCommerceSaleId_fkey" FOREIGN KEY ("relatedCommerceSaleId") REFERENCES "CommerceSale" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CashMovement" ("amount", "businessId", "clientName", "commerceSaleId", "createdAt", "description", "id", "method", "origin", "relatedCommerceSaleId", "repairId", "resaleDeviceId", "resaleKind", "resaleVersion", "type") SELECT "amount", "businessId", "clientName", "commerceSaleId", "createdAt", "description", "id", "method", "origin", "relatedCommerceSaleId", "repairId", "resaleDeviceId", "resaleKind", "resaleVersion", "type" FROM "CashMovement";
DROP TABLE "CashMovement";
ALTER TABLE "new_CashMovement" RENAME TO "CashMovement";
CREATE UNIQUE INDEX "CashMovement_commerceSaleId_key" ON "CashMovement"("commerceSaleId");
CREATE UNIQUE INDEX "CashMovement_relatedCommerceSaleId_key" ON "CashMovement"("relatedCommerceSaleId");
CREATE INDEX "CashMovement_businessId_repairId_relatedMovementId_idx" ON "CashMovement"("businessId", "repairId", "relatedMovementId");
CREATE INDEX "CashMovement_businessId_idx" ON "CashMovement"("businessId");
CREATE INDEX "CashMovement_businessId_origin_createdAt_id_idx" ON "CashMovement"("businessId", "origin", "createdAt", "id");
CREATE UNIQUE INDEX "CashMovement_businessId_operationKey_key" ON "CashMovement"("businessId", "operationKey");
CREATE UNIQUE INDEX "CashMovement_id_businessId_key" ON "CashMovement"("id", "businessId");
CREATE UNIQUE INDEX "CashMovement_resaleDeviceId_resaleVersion_resaleKind_key" ON "CashMovement"("resaleDeviceId", "resaleVersion", "resaleKind");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Repair_businessId_cancellationRequestId_key" ON "Repair"("businessId", "cancellationRequestId");
