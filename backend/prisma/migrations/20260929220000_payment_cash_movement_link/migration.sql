-- Vínculo explícito entre un Payment y su CashMovement de INCOME.
--
-- Antes, el adelanto de una reparación se localizaba en Caja por el texto de `description`,
-- lo que depende de que nadie lo edite. A partir de acá el vínculo es por ID: único, porque
-- un pago corresponde a un único movimiento, y con ON DELETE RESTRICT para que no se pueda
-- borrar una caja que todavía respalda un pago.
ALTER TABLE "Payment" ADD COLUMN "cashMovementId" TEXT;

CREATE UNIQUE INDEX "Payment_cashMovementId_key" ON "Payment"("cashMovementId");

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_cashMovementId_fkey"
FOREIGN KEY ("cashMovementId") REFERENCES "CashMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Índice de apoyo para el backfill y para las consultas por reparación.
CREATE INDEX "Payment_repairId_idx" ON "Payment"("repairId");

-- Backfill de los adelantos históricos. Sólo enlaza cuando hay EXACTAMENTE un ingreso de
-- reparación que case por descripción; si hay cero o más de uno, el vínculo queda nulo y el
-- runtime lo resuelve con su fallback, sin adivinar.
UPDATE "Payment" p
SET "cashMovementId" = link."movementId"
FROM (
  SELECT p2."id" AS "paymentId", MIN(m2."id") AS "movementId"
  FROM "Payment" p2
  JOIN "Repair" r ON r."id" = p2."repairId" AND r."businessId" = p2."businessId"
  JOIN "CashMovement" m2
    ON m2."repairId" = p2."repairId"
   AND m2."businessId" = p2."businessId"
   AND m2."type" = 'INCOME'
   AND m2."origin" = 'REPAIR'
  WHERE p2."isAdvance" = true
    AND p2."cashMovementId" IS NULL
    AND m2."description" = 'Adelanto reparación #' || r."number"
  GROUP BY p2."id"
  HAVING COUNT(*) = 1
) link
WHERE link."paymentId" = p."id" AND p."isAdvance" = true AND p."cashMovementId" IS NULL;