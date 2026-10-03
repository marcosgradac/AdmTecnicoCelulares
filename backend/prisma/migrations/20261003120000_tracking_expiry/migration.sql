-- Vencimiento del enlace público de seguimiento.
--
-- El enlace público de una reparación deja de funcionar pasado un tiempo desde la
-- entrega. La regla es fija y NO depende de la duración de la garantía: 3 días sin
-- garantía, 7 días con garantía.
--
-- La fecha se PERSISTE en vez de calcularse en cada request por dos razones:
--
--   1. Si se calculara al vuelo, editar la garantía de una reparación ya entregada
--      cambiaría retroactivamente cuándo vence su enlace.
--   2. Si se calculara al vuelo, cambiar la regla en el futuro afectaría a enlaces
--      ya entregados sin que esa decisión se tomara para esos casos.
--
-- Se agrega como columna nullable: mientras la reparación no está entregada, el
-- enlace no vence y el valor queda en NULL.
ALTER TABLE "Repair" ADD COLUMN "trackingExpiresAt" TIMESTAMP(3);

-- Índice de apoyo para las consultas que revisan el vencimiento.
CREATE INDEX "Repair_trackingExpiresAt_idx" ON "Repair"("trackingExpiresAt");

-- Backfill de las reparaciones YA entregadas antes de esta migración.
--
-- Se aplica la misma regla de producto a los enlaces que ya existen: +3 días sin
-- garantía, +7 con garantía, contados desde `deliveredAt`.
--
-- CONSECUENCIA INESPERADA PERO DESEADA: una reparación entregada hace más de 7 días
-- queda vencida apenas se aplique la migración, y su enlace pasa a responder 410. Es
-- el comportamiento correcto de la política nueva. Los tokens NO se tocan: cada
-- cliente conserva el enlace que ya tenía, ahora vencido.
--
-- No se recalcula nada en runtime para "arreglar" esos casos: hacerlo reintroduciría
-- exactamente el problema que la columna persistida evita.
UPDATE "Repair"
SET "trackingExpiresAt" = CASE
      WHEN "warrantyEnabled" = true
        THEN "deliveredAt" + INTERVAL '7 days'
      ELSE "deliveredAt" + INTERVAL '3 days'
    END
WHERE "status" = 'DELIVERED'
  AND "deliveredAt" IS NOT NULL
  AND "trackingExpiresAt" IS NULL;