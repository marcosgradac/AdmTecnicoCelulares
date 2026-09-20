ALTER TABLE "CashMovement" ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'GENERAL';
ALTER TABLE "CashMovement" ADD COLUMN "commerceSaleId" TEXT REFERENCES "CommerceSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CommerceProduct" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "purchaseCost" INTEGER NOT NULL,
  "salePrice" INTEGER NOT NULL,
  "currentStock" INTEGER NOT NULL DEFAULT 0,
  "minimumStock" INTEGER NOT NULL DEFAULT 0,
  "active" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "CommerceProduct_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "CommerceSale" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessId" TEXT NOT NULL,
  "total" INTEGER NOT NULL,
  "costOfGoodsSold" INTEGER NOT NULL,
  "profit" INTEGER NOT NULL,
  "paymentMethod" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommerceSale_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "CommerceSaleLine" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "saleId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitCost" INTEGER NOT NULL,
  "unitPrice" INTEGER NOT NULL,
  "lineTotal" INTEGER NOT NULL,
  "lineCost" INTEGER NOT NULL,
  "lineProfit" INTEGER NOT NULL,
  CONSTRAINT "CommerceSaleLine_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "CommerceSale" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CommerceSaleLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CommerceProduct" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

UPDATE "CashMovement" SET "origin" = 'REPAIR' WHERE "repairId" IS NOT NULL;

CREATE UNIQUE INDEX "CashMovement_commerceSaleId_key" ON "CashMovement" ("commerceSaleId");
CREATE INDEX "CommerceProduct_businessId_active_idx" ON "CommerceProduct" ("businessId", "active");
CREATE INDEX "CommerceProduct_businessId_category_idx" ON "CommerceProduct" ("businessId", "category");
CREATE INDEX "CommerceProduct_businessId_currentStock_idx" ON "CommerceProduct" ("businessId", "currentStock");
CREATE INDEX "CommerceSale_businessId_createdAt_idx" ON "CommerceSale" ("businessId", "createdAt");
CREATE INDEX "CommerceSaleLine_saleId_idx" ON "CommerceSaleLine" ("saleId");
CREATE INDEX "CommerceSaleLine_productId_saleId_idx" ON "CommerceSaleLine" ("productId", "saleId");
