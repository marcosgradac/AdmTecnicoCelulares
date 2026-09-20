CREATE TYPE "CashMovementOrigin" AS ENUM ('GENERAL', 'REPAIR', 'EQUIPMENT', 'COMMERCE');

ALTER TABLE "CashMovement"
  ADD COLUMN "origin" "CashMovementOrigin" NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN "commerceSaleId" TEXT;

CREATE TABLE "CommerceProduct" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "purchaseCost" INTEGER NOT NULL,
  "salePrice" INTEGER NOT NULL,
  "currentStock" INTEGER NOT NULL DEFAULT 0,
  "minimumStock" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommerceProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommerceSale" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "total" INTEGER NOT NULL,
  "costOfGoodsSold" INTEGER NOT NULL,
  "profit" INTEGER NOT NULL,
  "paymentMethod" "PaymentMethod" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommerceSale_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommerceSaleLine" (
  "id" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitCost" INTEGER NOT NULL,
  "unitPrice" INTEGER NOT NULL,
  "lineTotal" INTEGER NOT NULL,
  "lineCost" INTEGER NOT NULL,
  "lineProfit" INTEGER NOT NULL,
  CONSTRAINT "CommerceSaleLine_pkey" PRIMARY KEY ("id")
);

UPDATE "CashMovement" SET "origin" = 'REPAIR' WHERE "repairId" IS NOT NULL;

CREATE UNIQUE INDEX "CashMovement_commerceSaleId_key" ON "CashMovement"("commerceSaleId");
CREATE INDEX "CommerceProduct_businessId_active_idx" ON "CommerceProduct"("businessId", "active");
CREATE INDEX "CommerceProduct_businessId_category_idx" ON "CommerceProduct"("businessId", "category");
CREATE INDEX "CommerceProduct_businessId_currentStock_idx" ON "CommerceProduct"("businessId", "currentStock");
CREATE INDEX "CommerceSale_businessId_createdAt_idx" ON "CommerceSale"("businessId", "createdAt");
CREATE INDEX "CommerceSaleLine_saleId_idx" ON "CommerceSaleLine"("saleId");
CREATE INDEX "CommerceSaleLine_productId_saleId_idx" ON "CommerceSaleLine"("productId", "saleId");

ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_commerceSaleId_fkey" FOREIGN KEY ("commerceSaleId") REFERENCES "CommerceSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommerceProduct" ADD CONSTRAINT "CommerceProduct_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommerceSale" ADD CONSTRAINT "CommerceSale_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommerceSaleLine" ADD CONSTRAINT "CommerceSaleLine_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "CommerceSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommerceSaleLine" ADD CONSTRAINT "CommerceSaleLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CommerceProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
