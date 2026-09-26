ALTER TABLE "Repair" ADD COLUMN "cancelledAt" TIMESTAMP(3),
    ADD COLUMN "cancellationPaidAmount" INTEGER,
    ADD COLUMN "cancellationReviewFee" INTEGER,
    ADD COLUMN "cancellationRefundAmount" INTEGER,
    ADD COLUMN "cancellationRefundMethod" "PaymentMethod",
    ADD COLUMN "cancellationRefundMovementId" TEXT;
