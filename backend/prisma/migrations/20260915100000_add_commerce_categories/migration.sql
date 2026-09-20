CREATE TABLE "CommerceCategory" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommerceCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CommerceCategory_businessId_name_key" ON "CommerceCategory"("businessId", "name");
CREATE INDEX "CommerceCategory_businessId_idx" ON "CommerceCategory"("businessId");
ALTER TABLE "CommerceCategory" ADD CONSTRAINT "CommerceCategory_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
