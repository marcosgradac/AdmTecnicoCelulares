-- Vínculo explícito entre un Payment y su CashMovement de INCOME.
--
-- Misma decisión que en PostgreSQL: el adelanto deja de localizarse por el texto de
-- `description` y pasa a vincularse por ID. Se agrega como columna nullable para no tocar
-- los datos históricos, y el backfill sólo enlaza los casos no ambiguos.
ALTER TABLE "Payment" ADD COLUMN "cashMovementId" TEXT
REFERENCES "CashMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Payment_cashMovementId_key" ON "Payment"("cashMovementId");
CREATE INDEX "Payment_repairId_idx" ON "Payment"("repairId");

-- Backfill conservador: vincula el adelanto sólo cuando existe exactamente un ingreso de
-- reparación con la descripción esperada. SQLite no admite UPDATE ... FROM, así que se
-- usa una subconsulta correlacionada con el mismo criterio de unicidad.
UPDATE "Payment"
SET "cashMovementId" = (
  SELECT m."id"
  FROM "CashMovement" m
  JOIN "Repair" r ON r."id" = m."repairId" AND r."businessId" = m."businessId"
  WHERE m."repairId" = "Payment"."repairId"
    AND m."businessId" = "Payment"."businessId"
    AND m."type" = 'INCOME'
    AND m."origin" = 'REPAIR'
    AND m."description" = 'Adelanto reparación #' || r."number"
  LIMIT 1
)
WHERE "isAdvance" = 1
  AND "cashMovementId" IS NULL
  AND (
    SELECT COUNT(*)
    FROM "CashMovement" m2
    JOIN "Repair" r2 ON r2."id" = m2."repairId" AND r2."businessId" = m2."businessId"
    WHERE m2."repairId" = "Payment"."repairId"
      AND m2."businessId" = "Payment"."businessId"
      AND m2."type" = 'INCOME'
      AND m2."origin" = 'REPAIR'
      AND m2."description" = 'Adelanto reparación #' || r2."number"
  ) = 1;