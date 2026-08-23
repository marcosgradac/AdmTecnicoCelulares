ALTER TABLE "Repair" ADD COLUMN "trackingCreatedAt" TIMESTAMP(3);
UPDATE "Repair" SET "trackingCreatedAt" = "createdAt" WHERE "trackingEnabled" = true;
CREATE INDEX "Repair_businessId_trackingCreatedAt_idx" ON "Repair"("businessId", "trackingCreatedAt");
