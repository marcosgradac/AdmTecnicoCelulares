-- Prepared for local verification only. Never discard previously stored photo rows.
-- A nonempty table requires explicit review/export before this migration can run.
BEGIN;
LOCK TABLE "RepairPhoto" IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "RepairPhoto" LIMIT 1) THEN
    RAISE EXCEPTION 'RepairPhoto is not empty: review and preserve existing rows before removing this unused feature';
  END IF;
END $$;
DROP TABLE "RepairPhoto";
COMMIT;
