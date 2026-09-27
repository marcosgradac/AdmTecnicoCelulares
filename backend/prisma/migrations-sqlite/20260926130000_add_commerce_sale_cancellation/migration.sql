-- AlterTable
ALTER TABLE "CommerceSale" ADD COLUMN "cancelledAt" DATETIME;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CashMovement" (
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
    CONSTRAINT "CashMovement_resaleDeviceId_fkey" FOREIGN KEY ("resaleDeviceId") REFERENCES "ResaleDevice" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CashMovement_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CashMovement_commerceSaleId_fkey" FOREIGN KEY ("commerceSaleId") REFERENCES "CommerceSale" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CashMovement_relatedCommerceSaleId_fkey" FOREIGN KEY ("relatedCommerceSaleId") REFERENCES "CommerceSale" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CashMovement" ("amount", "businessId", "clientName", "commerceSaleId", "createdAt", "description", "id", "method", "origin", "repairId", "resaleDeviceId", "resaleKind", "resaleVersion", "type") SELECT "amount", "businessId", "clientName", "commerceSaleId", "createdAt", "description", "id", "method", "origin", "repairId", "resaleDeviceId", "resaleKind", "resaleVersion", "type" FROM "CashMovement";
DROP TABLE "CashMovement";
ALTER TABLE "new_CashMovement" RENAME TO "CashMovement";
CREATE UNIQUE INDEX "CashMovement_commerceSaleId_key" ON "CashMovement"("commerceSaleId");
CREATE UNIQUE INDEX "CashMovement_relatedCommerceSaleId_key" ON "CashMovement"("relatedCommerceSaleId");
CREATE INDEX "CashMovement_businessId_idx" ON "CashMovement"("businessId");
CREATE INDEX "CashMovement_businessId_origin_createdAt_id_idx" ON "CashMovement"("businessId", "origin", "createdAt", "id");
CREATE UNIQUE INDEX "CashMovement_resaleDeviceId_resaleVersion_resaleKind_key" ON "CashMovement"("resaleDeviceId", "resaleVersion", "resaleKind");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "CommerceSale_businessId_cancelledAt_idx" ON "CommerceSale"("businessId", "cancelledAt");

