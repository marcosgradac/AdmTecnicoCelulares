-- The reduced SQLite schema did not previously store the historical cost fields.
ALTER TABLE "Repair" ADD COLUMN "partsCost" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Repair" ADD COLUMN "laborCost" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Repair" ADD COLUMN "laborCharge" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Repair" ADD COLUMN "initialCostMovementId" TEXT
REFERENCES "CashMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD COLUMN "isAdvance" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "Repair_initialCostMovementId_key" ON "Repair"("initialCostMovementId");
