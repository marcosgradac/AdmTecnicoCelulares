-- Additive only: historical entries are neither reclassified nor rewritten.
ALTER TABLE "Repair" ADD COLUMN "financeVersion" INTEGER,
  ADD COLUMN "cancellationRequestId" TEXT,
  ADD COLUMN "cancellationRequestPayload" TEXT,
  ADD COLUMN "cancellationRefundPaid" INTEGER;
ALTER TABLE "CashMovement" ADD COLUMN "accountingOnly" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "repairFinanceKind" TEXT,
  ADD COLUMN "relatedMovementId" TEXT,
  ADD COLUMN "operationKey" TEXT,
  ADD COLUMN "operationPayload" TEXT,
  ADD COLUMN "performedByUserId" TEXT,
  ADD COLUMN "reason" TEXT;
CREATE UNIQUE INDEX "CashMovement_businessId_operationKey_key" ON "CashMovement"("businessId", "operationKey");
CREATE INDEX "CashMovement_businessId_repairId_relatedMovementId_idx" ON "CashMovement"("businessId", "repairId", "relatedMovementId");
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_relatedMovementId_businessId_fkey"
  FOREIGN KEY ("relatedMovementId", "businessId") REFERENCES "CashMovement"("id", "businessId") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_repair_correction_shape"
  CHECK (NOT "accountingOnly" OR ("type" = 'EXPENSE' AND "amount" < 0 AND "method" IS NULL
    AND "repairFinanceKind" IS NOT NULL AND "repairFinanceKind" = 'EXPENSE_CORRECTION' AND "relatedMovementId" IS NOT NULL
    AND "repairId" IS NOT NULL AND "reason" IS NOT NULL AND length(trim("reason")) >= 5));

CREATE UNIQUE INDEX "Repair_businessId_cancellationRequestId_key" ON "Repair"("businessId", "cancellationRequestId");

ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_classified_money_shape" CHECK ("repairFinanceKind" IS NULL OR ("repairFinanceKind" = 'EXPENSE_CORRECTION' AND "accountingOnly") OR (NOT "accountingOnly" AND "amount" > 0 AND "method" IS NOT NULL AND "repairId" IS NOT NULL AND (("repairFinanceKind" IN ('PURCHASE', 'CUSTOMER_REFUND') AND "type" = 'EXPENSE' AND "relatedMovementId" IS NULL) OR ("repairFinanceKind" IN ('ADVANCE', 'PAYMENT', 'REVIEW_PAYMENT') AND "type" = 'INCOME' AND "relatedMovementId" IS NULL) OR ("repairFinanceKind" = 'SUPPLIER_REFUND' AND "type" = 'INCOME' AND "relatedMovementId" IS NOT NULL))));
