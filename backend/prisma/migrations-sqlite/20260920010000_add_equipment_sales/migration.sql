CREATE TABLE "ResaleDevice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "purchasePrice" INTEGER NOT NULL,
    "repairExpenses" INTEGER NOT NULL DEFAULT 0,
    "estimatedSalePrice" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PURCHASED',
    "version" INTEGER NOT NULL DEFAULT 0,
    "actualSalePrice" INTEGER,
    "salePaymentMethod" TEXT,
    "saleCostBasis" INTEGER,
    "soldAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ResaleDevice_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ResaleDevice_businessId_createdAt_id_idx" ON "ResaleDevice"("businessId", "createdAt", "id");
CREATE INDEX "ResaleDevice_businessId_status_createdAt_id_idx" ON "ResaleDevice"("businessId", "status", "createdAt", "id");
CREATE INDEX "ResaleDevice_businessId_soldAt_idx" ON "ResaleDevice"("businessId", "soldAt");

-- Nullable reference permits an additive ALTER even when CashMovement has existing rows.
ALTER TABLE "CashMovement" ADD COLUMN "resaleDeviceId" TEXT REFERENCES "ResaleDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashMovement" ADD COLUMN "resaleKind" TEXT;
ALTER TABLE "CashMovement" ADD COLUMN "resaleVersion" INTEGER;
CREATE UNIQUE INDEX "CashMovement_resaleDeviceId_resaleVersion_resaleKind_key" ON "CashMovement"("resaleDeviceId", "resaleVersion", "resaleKind");
