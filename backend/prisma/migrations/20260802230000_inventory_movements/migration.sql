CREATE TYPE "InventoryMovementType" AS ENUM (
  'INITIAL_STOCK', 'PURCHASE', 'MANUAL_ENTRY', 'REPAIR_USAGE',
  'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'RETURN', 'DAMAGED',
  'CANCELLED_REPAIR_RETURN'
);

ALTER TABLE "StockItem"
  ADD COLUMN "sku" TEXT,
  ADD COLUMN "compatibleModels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "quality" TEXT,
  ADD COLUMN "supplier" TEXT,
  ADD COLUMN "notes" TEXT;

UPDATE "StockItem"
SET "compatibleModels" = ARRAY["compatibleModel"]
WHERE "compatibleModel" IS NOT NULL AND BTRIM("compatibleModel") <> '';

CREATE UNIQUE INDEX "StockItem_businessId_sku_key" ON "StockItem"("businessId", "sku");

CREATE TABLE "InventoryMovement" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "stockItemId" TEXT NOT NULL,
  "repairId" TEXT,
  "type" "InventoryMovementType" NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitCost" INTEGER NOT NULL,
  "totalCost" INTEGER NOT NULL,
  "previousStock" INTEGER NOT NULL,
  "newStock" INTEGER NOT NULL,
  "notes" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InventoryMovement_businessId_createdAt_idx" ON "InventoryMovement"("businessId", "createdAt");
CREATE INDEX "InventoryMovement_stockItemId_createdAt_idx" ON "InventoryMovement"("stockItemId", "createdAt");
CREATE INDEX "InventoryMovement_repairId_idx" ON "InventoryMovement"("repairId");

ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "Repair"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
