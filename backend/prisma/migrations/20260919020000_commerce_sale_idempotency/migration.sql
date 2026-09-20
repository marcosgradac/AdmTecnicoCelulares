-- Existing sales keep NULL; every new sale requires a key at the API boundary.
ALTER TABLE "CommerceSale" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "CommerceSale_businessId_idempotencyKey_key"
ON "CommerceSale"("businessId", "idempotencyKey");
