-- Refuse to discard historical cancellation data. Locks cover every guarded table
-- so no concurrent writer can introduce cancellation data after validation.
BEGIN;
LOCK TABLE "Repair", "Payment", "RepairStatusHistory", "InventoryMovement" IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Repair" WHERE status::text = 'CANCELLED') THEN
    RAISE EXCEPTION 'Repair cancellation removal blocked: cancelled repairs';
  END IF;
  IF EXISTS (SELECT 1 FROM "RepairStatusHistory" WHERE "previousStatus"::text = 'CANCELLED' OR "newStatus"::text = 'CANCELLED') THEN
    RAISE EXCEPTION 'Repair cancellation removal blocked: cancelled status history';
  END IF;
  IF EXISTS (SELECT 1 FROM "Repair" WHERE
    "cancelledAt" IS NOT NULL OR "cancellationPaidAmount" IS NOT NULL OR
    "cancellationReviewFee" IS NOT NULL OR "cancellationReviewPaid" <> 0 OR
    "cancellationRefundAmount" IS NOT NULL OR "cancellationRefundMethod" IS NOT NULL OR
    "cancellationRefundMovementId" IS NOT NULL) THEN
    RAISE EXCEPTION 'Repair cancellation removal blocked: repair cancellation fields';
  END IF;
  IF EXISTS (SELECT 1 FROM "Payment" WHERE "cancellationReview" = true) THEN
    RAISE EXCEPTION 'Repair cancellation removal blocked: cancellation review payments';
  END IF;
  IF EXISTS (SELECT 1 FROM "InventoryMovement" WHERE type::text = 'CANCELLED_REPAIR_RETURN') THEN
    RAISE EXCEPTION 'Repair cancellation removal blocked: cancellation inventory movements';
  END IF;
END $$;

CREATE TYPE "RepairStatus_without_cancellation" AS ENUM ('RECEIVED', 'REVIEW', 'BUDGET', 'APPROVED', 'WAITING_PART', 'REPAIRING', 'TESTING', 'READY', 'DELIVERED', 'WARRANTY');
ALTER TABLE "Repair" ALTER COLUMN status DROP DEFAULT;
ALTER TABLE "Repair" ALTER COLUMN status TYPE "RepairStatus_without_cancellation" USING (status::text::"RepairStatus_without_cancellation");
ALTER TABLE "RepairStatusHistory" ALTER COLUMN "previousStatus" TYPE "RepairStatus_without_cancellation" USING ("previousStatus"::text::"RepairStatus_without_cancellation");
ALTER TABLE "RepairStatusHistory" ALTER COLUMN "newStatus" TYPE "RepairStatus_without_cancellation" USING ("newStatus"::text::"RepairStatus_without_cancellation");
DROP TYPE "RepairStatus" RESTRICT;
ALTER TYPE "RepairStatus_without_cancellation" RENAME TO "RepairStatus";
ALTER TABLE "Repair" ALTER COLUMN status SET DEFAULT 'RECEIVED'::"RepairStatus";

CREATE TYPE "InventoryMovementType_without_cancellation" AS ENUM ('INITIAL_STOCK', 'PURCHASE', 'MANUAL_ENTRY', 'REPAIR_USAGE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'RETURN', 'DAMAGED');
ALTER TABLE "InventoryMovement" ALTER COLUMN type TYPE "InventoryMovementType_without_cancellation" USING (type::text::"InventoryMovementType_without_cancellation");
DROP TYPE "InventoryMovementType" RESTRICT;
ALTER TYPE "InventoryMovementType_without_cancellation" RENAME TO "InventoryMovementType";

ALTER TABLE "Repair"
  DROP COLUMN "cancelledAt" RESTRICT,
  DROP COLUMN "cancellationPaidAmount" RESTRICT,
  DROP COLUMN "cancellationReviewFee" RESTRICT,
  DROP COLUMN "cancellationReviewPaid" RESTRICT,
  DROP COLUMN "cancellationRefundAmount" RESTRICT,
  DROP COLUMN "cancellationRefundMethod" RESTRICT,
  DROP COLUMN "cancellationRefundMovementId" RESTRICT;
ALTER TABLE "Payment" DROP COLUMN "cancellationReview" RESTRICT;
COMMIT;
