ALTER TYPE "RepairStatus" ADD VALUE IF NOT EXISTS 'WAITING_PART';
ALTER TYPE "RepairStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "RepairStatus" ADD VALUE IF NOT EXISTS 'WARRANTY';

ALTER TABLE "Business" ADD COLUMN "logoUrl" TEXT;
ALTER TABLE "Client" ADD COLUMN "whatsapp" TEXT;
ALTER TABLE "Client" ADD COLUMN "email" TEXT;
ALTER TABLE "Client" ADD COLUMN "notes" TEXT;
ALTER TABLE "Client" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "Device" (
  "id" TEXT NOT NULL, "businessId" TEXT NOT NULL, "clientId" TEXT NOT NULL,
  "brand" TEXT NOT NULL, "model" TEXT NOT NULL, "imei" TEXT, "color" TEXT,
  "storage" TEXT, "unlockCodeEncrypted" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Device_businessId_idx" ON "Device"("businessId");
CREATE INDEX "Device_clientId_idx" ON "Device"("clientId");
ALTER TABLE "Device" ADD CONSTRAINT "Device_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Device" ADD CONSTRAINT "Device_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Repair" ADD COLUMN "deviceId" TEXT;
ALTER TABLE "Repair" ADD COLUMN "physicalCondition" TEXT;
ALTER TABLE "Repair" ADD COLUMN "accessories" TEXT;
ALTER TABLE "Repair" ADD COLUMN "estimatedDeliveryDate" TIMESTAMP(3);
ALTER TABLE "Repair" ADD COLUMN "estimatedDuration" TEXT;
ALTER TABLE "Repair" ADD COLUMN "partsCost" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Repair" ADD COLUMN "laborCost" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Repair" ADD COLUMN "trackingEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Repair" ADD COLUMN "deliveredAt" TIMESTAMP(3);
ALTER TABLE "Repair" ALTER COLUMN "trackingToken" DROP NOT NULL;
UPDATE "Repair" SET "trackingEnabled" = true WHERE "trackingToken" IS NOT NULL;
ALTER TABLE "Repair" ADD CONSTRAINT "Repair_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "RepairStatusHistory" (
  "id" TEXT NOT NULL, "repairId" TEXT NOT NULL, "previousStatus" "RepairStatus",
  "newStatus" "RepairStatus" NOT NULL, "publicMessage" TEXT, "internalNote" TEXT,
  "changedByUserId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RepairStatusHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RepairStatusHistory_repairId_createdAt_idx" ON "RepairStatusHistory"("repairId", "createdAt");
ALTER TABLE "RepairStatusHistory" ADD CONSTRAINT "RepairStatusHistory_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "Repair"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RepairStatusHistory" ADD CONSTRAINT "RepairStatusHistory_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "RepairPhoto" (
  "id" TEXT NOT NULL, "repairId" TEXT NOT NULL, "url" TEXT NOT NULL, "type" TEXT NOT NULL,
  "isPublic" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RepairPhoto_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RepairPhoto_repairId_idx" ON "RepairPhoto"("repairId");
ALTER TABLE "RepairPhoto" ADD CONSTRAINT "RepairPhoto_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "Repair"("id") ON DELETE CASCADE ON UPDATE CASCADE;
