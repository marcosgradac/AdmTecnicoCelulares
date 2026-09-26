ALTER TABLE "Business" ADD COLUMN "lastRepairNumber" INTEGER NOT NULL DEFAULT 1000;

UPDATE "Business"
SET "lastRepairNumber" = MAX(1000, COALESCE(
  (SELECT MAX("number") FROM "Repair" WHERE "Repair"."businessId" = "Business"."id"), 1000
));
