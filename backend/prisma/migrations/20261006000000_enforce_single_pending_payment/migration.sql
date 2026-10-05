DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "PaymentSubmission"
    WHERE "status" = 'PENDING'
    GROUP BY "businessId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce one pending PaymentSubmission per business: duplicate PENDING rows exist';
  END IF;
END
$$;

CREATE UNIQUE INDEX "PaymentSubmission_one_pending_per_business"
ON "PaymentSubmission" ("businessId")
WHERE "status" = 'PENDING';
