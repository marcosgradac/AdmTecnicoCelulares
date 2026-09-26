ALTER TABLE "Repair" ADD COLUMN "cancelledAt" DATETIME;
ALTER TABLE "Repair" ADD COLUMN "cancellationPaidAmount" INTEGER;
ALTER TABLE "Repair" ADD COLUMN "cancellationReviewFee" INTEGER;
ALTER TABLE "Repair" ADD COLUMN "cancellationRefundAmount" INTEGER;
ALTER TABLE "Repair" ADD COLUMN "cancellationRefundMethod" TEXT;
ALTER TABLE "Repair" ADD COLUMN "cancellationRefundMovementId" TEXT;
