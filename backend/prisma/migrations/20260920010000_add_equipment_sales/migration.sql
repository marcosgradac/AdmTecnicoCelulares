CREATE TYPE "ResaleDeviceStatus" AS ENUM ('PURCHASED', 'REPAIRING', 'READY_FOR_SALE', 'SOLD');
CREATE TYPE "EquipmentCashKind" AS ENUM ('PURCHASE', 'REPAIR', 'PURCHASE_ADJUSTMENT', 'REPAIR_ADJUSTMENT', 'SALE');

CREATE TABLE "ResaleDevice" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "purchasePrice" INTEGER NOT NULL,
    "repairExpenses" INTEGER NOT NULL DEFAULT 0,
    "estimatedSalePrice" INTEGER NOT NULL,
    "status" "ResaleDeviceStatus" NOT NULL DEFAULT 'PURCHASED',
    "version" INTEGER NOT NULL DEFAULT 0,
    "actualSalePrice" INTEGER,
    "salePaymentMethod" "PaymentMethod",
    "saleCostBasis" INTEGER,
    "soldAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ResaleDevice_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ResaleDevice_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ResaleDevice_businessId_createdAt_id_idx" ON "ResaleDevice"("businessId", "createdAt", "id");
CREATE INDEX "ResaleDevice_businessId_status_createdAt_id_idx" ON "ResaleDevice"("businessId", "status", "createdAt", "id");
CREATE INDEX "ResaleDevice_businessId_soldAt_idx" ON "ResaleDevice"("businessId", "soldAt");

ALTER TABLE "CashMovement" ADD COLUMN "resaleDeviceId" TEXT,
    ADD COLUMN "resaleKind" "EquipmentCashKind",
    ADD COLUMN "resaleVersion" INTEGER;
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_resaleDeviceId_fkey" FOREIGN KEY ("resaleDeviceId") REFERENCES "ResaleDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "CashMovement_resaleDeviceId_resaleVersion_resaleKind_key" ON "CashMovement"("resaleDeviceId", "resaleVersion", "resaleKind");
