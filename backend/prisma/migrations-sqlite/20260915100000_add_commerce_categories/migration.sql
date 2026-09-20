CREATE TABLE "CommerceCategory" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "CommerceCategory_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CommerceCategory_businessId_name_key" ON "CommerceCategory"("businessId", "name");
CREATE INDEX "CommerceCategory_businessId_idx" ON "CommerceCategory"("businessId");
