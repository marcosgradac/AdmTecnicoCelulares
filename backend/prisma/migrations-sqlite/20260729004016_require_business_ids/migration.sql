/*
  Warnings:

  - Made the column `businessId` on table `CashMovement` required. This step will fail if there are existing NULL values in that column.
  - Made the column `businessId` on table `Client` required. This step will fail if there are existing NULL values in that column.
  - Made the column `businessId` on table `Payment` required. This step will fail if there are existing NULL values in that column.
  - Made the column `businessId` on table `Repair` required. This step will fail if there are existing NULL values in that column.
  - Made the column `businessId` on table `StockItem` required. This step will fail if there are existing NULL values in that column.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CashMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" TEXT,
    "repairId" TEXT,
    "clientName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CashMovement_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CashMovement" ("amount", "businessId", "clientName", "createdAt", "description", "id", "method", "repairId", "type") SELECT "amount", "businessId", "clientName", "createdAt", "description", "id", "method", "repairId", "type" FROM "CashMovement";
DROP TABLE "CashMovement";
ALTER TABLE "new_CashMovement" RENAME TO "CashMovement";
CREATE INDEX "CashMovement_businessId_idx" ON "CashMovement"("businessId");
CREATE TABLE "new_Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Client_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Client" ("businessId", "createdAt", "id", "name", "phone") SELECT "businessId", "createdAt", "id", "name", "phone" FROM "Client";
DROP TABLE "Client";
ALTER TABLE "new_Client" RENAME TO "Client";
CREATE INDEX "Client_businessId_idx" ON "Client"("businessId");
CREATE TABLE "new_Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "repairId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "Repair" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Payment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Payment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Payment" ("amount", "businessId", "clientId", "createdAt", "id", "method", "note", "repairId") SELECT "amount", "businessId", "clientId", "createdAt", "id", "method", "note", "repairId" FROM "Payment";
DROP TABLE "Payment";
ALTER TABLE "new_Payment" RENAME TO "Payment";
CREATE INDEX "Payment_businessId_idx" ON "Payment"("businessId");
CREATE TABLE "new_Repair" (
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
    "trackingToken" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Repair_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Repair_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Repair" ("businessId", "clientId", "color", "createdAt", "deviceBrand", "deviceModel", "diagnosis", "id", "imei", "issue", "notes", "number", "paid", "status", "total", "trackingToken", "updatedAt") SELECT "businessId", "clientId", "color", "createdAt", "deviceBrand", "deviceModel", "diagnosis", "id", "imei", "issue", "notes", "number", "paid", "status", "total", "trackingToken", "updatedAt" FROM "Repair";
DROP TABLE "Repair";
ALTER TABLE "new_Repair" RENAME TO "Repair";
CREATE UNIQUE INDEX "Repair_number_key" ON "Repair"("number");
CREATE UNIQUE INDEX "Repair_trackingToken_key" ON "Repair"("trackingToken");
CREATE INDEX "Repair_businessId_idx" ON "Repair"("businessId");
CREATE TABLE "new_StockItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "compatibleBrand" TEXT,
    "compatibleModel" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "minimumStock" INTEGER NOT NULL DEFAULT 0,
    "cost" INTEGER NOT NULL DEFAULT 0,
    "salePrice" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StockItem_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_StockItem" ("active", "businessId", "category", "compatibleBrand", "compatibleModel", "cost", "createdAt", "id", "minimumStock", "name", "quantity", "salePrice", "updatedAt") SELECT "active", "businessId", "category", "compatibleBrand", "compatibleModel", "cost", "createdAt", "id", "minimumStock", "name", "quantity", "salePrice", "updatedAt" FROM "StockItem";
DROP TABLE "StockItem";
ALTER TABLE "new_StockItem" RENAME TO "StockItem";
CREATE INDEX "StockItem_businessId_idx" ON "StockItem"("businessId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
