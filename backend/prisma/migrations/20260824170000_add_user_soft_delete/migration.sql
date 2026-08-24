ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "User_businessId_deletedAt_idx" ON "User"("businessId", "deletedAt");
