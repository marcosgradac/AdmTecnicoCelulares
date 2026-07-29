-- CreateTable
CREATE TABLE "RepairPart" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "repairId" TEXT NOT NULL,
    "stockItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "itemNameSnapshot" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RepairPart_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "Repair" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RepairPart_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "RepairPart_repairId_idx" ON "RepairPart"("repairId");

-- CreateIndex
CREATE INDEX "RepairPart_stockItemId_idx" ON "RepairPart"("stockItemId");
