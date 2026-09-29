ALTER TABLE "Repair" ADD COLUMN "laborCharge" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "initialCostMovementId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "isAdvance" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "Repair_initialCostMovementId_key" ON "Repair"("initialCostMovementId");
ALTER TABLE "Repair" ADD CONSTRAINT "Repair_initialCostMovementId_fkey"
FOREIGN KEY ("initialCostMovementId") REFERENCES "CashMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
