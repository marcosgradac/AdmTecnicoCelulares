DROP INDEX "Repair_number_key";
CREATE UNIQUE INDEX "Repair_businessId_number_key" ON "Repair"("businessId", "number");
