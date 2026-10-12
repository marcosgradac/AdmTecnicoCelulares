-- SQLite uses text statuses and has no RepairStatusHistory/InventoryMovement.
-- BEGIN IMMEDIATE excludes concurrent writers during validation and removal.
BEGIN IMMEDIATE;
CREATE TEMP TABLE "_repair_cancellation_removal_guard" (
  "cancelled_repairs" INTEGER CONSTRAINT "blocked_cancelled_repairs" CHECK ("cancelled_repairs" = 0),
  "repair_cancellation_fields" INTEGER CONSTRAINT "blocked_repair_cancellation_fields" CHECK ("repair_cancellation_fields" = 0),
  "cancellation_review_payments" INTEGER CONSTRAINT "blocked_cancellation_review_payments" CHECK ("cancellation_review_payments" = 0)
);
INSERT INTO "_repair_cancellation_removal_guard" VALUES (
  (SELECT COUNT(*) FROM "Repair" WHERE "status" = 'CANCELLED'),
  (SELECT COUNT(*) FROM "Repair" WHERE
    "cancelledAt" IS NOT NULL OR "cancellationPaidAmount" IS NOT NULL OR
    "cancellationReviewFee" IS NOT NULL OR "cancellationReviewPaid" <> 0 OR
    "cancellationRefundAmount" IS NOT NULL OR "cancellationRefundMethod" IS NOT NULL OR
    "cancellationRefundMovementId" IS NOT NULL),
  (SELECT COUNT(*) FROM "Payment" WHERE "cancellationReview" = 1)
);
DROP TABLE "_repair_cancellation_removal_guard";

ALTER TABLE "Repair" DROP COLUMN "cancelledAt";
ALTER TABLE "Repair" DROP COLUMN "cancellationPaidAmount";
ALTER TABLE "Repair" DROP COLUMN "cancellationReviewFee";
ALTER TABLE "Repair" DROP COLUMN "cancellationReviewPaid";
ALTER TABLE "Repair" DROP COLUMN "cancellationRefundAmount";
ALTER TABLE "Repair" DROP COLUMN "cancellationRefundMethod";
ALTER TABLE "Repair" DROP COLUMN "cancellationRefundMovementId";
ALTER TABLE "Payment" DROP COLUMN "cancellationReview";
COMMIT;
