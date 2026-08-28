CREATE INDEX "Repair_businessId_createdAt_idx" ON "Repair"("businessId", "createdAt");
CREATE INDEX "Repair_businessId_status_createdAt_idx" ON "Repair"("businessId", "status", "createdAt");
CREATE INDEX "Client_businessId_createdAt_idx" ON "Client"("businessId", "createdAt");
CREATE INDEX "CashMovement_businessId_createdAt_idx" ON "CashMovement"("businessId", "createdAt");
