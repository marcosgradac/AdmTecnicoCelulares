-- AlterTable
ALTER TABLE "CashMovement" ADD COLUMN     "relatedCommerceSaleId" TEXT;

-- AlterTable
ALTER TABLE "CommerceSale" ADD COLUMN     "cancelledAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "CashMovement_relatedCommerceSaleId_key" ON "CashMovement"("relatedCommerceSaleId");

-- CreateIndex
CREATE INDEX "CommerceSale_businessId_cancelledAt_idx" ON "CommerceSale"("businessId", "cancelledAt");

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_relatedCommerceSaleId_fkey" FOREIGN KEY ("relatedCommerceSaleId") REFERENCES "CommerceSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

