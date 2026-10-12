# TecnoDesk: eliminación definitiva independiente de PR #17

Fecha: 2026-10-12. Rama: codex/repair-hard-delete-main. Base: origin/main 10bc148f5992c22b313388183bfe23ffc3f67296.

## Alcance y separación

El worktree original y todos sus cambios sin commit se conservaron. Esta rama nace directamente de main; no contiene los tres commits del PR #17 ni su migración financiera. No se modificaron consultas ni servicios de Caja, dashboard, reportes, Comercio, ni el esquema SQLite. El esquema PostgreSQL solo pierde RepairPhoto y su relación.

El DELETE bloquea la fila de reparación, valida relaciones exclusivas y taller, elimina hijos y movimientos físicamente en una transacción. Incluye pagos, anticipos, costo inicial, devoluciones, compensaciones e importes de garantías vinculados mediante repairId o enlaces explícitos existentes en main. Los agregados existentes reflejan la eliminación al volver a consultarse. No crea movimientos ni cambia existencias. Las relaciones compartidas, ajenas o corruptas abortan con 409 sin borrar nada. Clientes, usuarios, StockItem y todo Comercio se conservan.

La interfaz permite Eliminar reparación con permiso repairs.delete en todos los 11 estados, incluido CANCELLED histórico, y muestra advertencia irreversible y botón rojo Eliminar definitivamente. Nuevas cancelaciones se rechazan en create, cambios de estado y cancel/cancel-preview. El endpoint financiero previo de cobro de revisión histórica permanece tal como está en main: no crea cancelaciones.

## Migración

Únicamente 20261012120000_remove_unused_repair_photos. Bloquea RepairPhoto, comprueba nuevamente que esté vacía y solo entonces elimina esa tabla en transacción. Verificación productiva previa: vacía; esta tarea no accedió ni modificó producción. Migración aplicada y verificada solo en bases ficticias locales; también probada su negativa si hay fotografías. No agrega columnas financieras ni toca clientes.

## Verificación local

- Caso obligatorio aprobado: apertura 100000 + ingreso 50000 - egreso 20000 = 130000; DELETE devuelve Caja a 100000 sin movimientos asociados ni residuos.
- Suite específica de borrado: pagos múltiples, anticipos, refund/compensaciones históricas, garantías, 11 estados UI, enlaces antiguos, permisos individuales, dos talleres, snapshots Comercio e inventario intactos, rollback forzado, concurrencia de pago/costo inicial y doble borrado, guardas de migración.
- 24 suites PostgreSQL/SQLite aprobadas: repair-hard-delete, repair-creation-finance, repair-creation-finance-sqlite, repair-edit, repair-initial-cost, repair-advance-status, repair-financial-visibility, cash-groups, cash-period, cash-period-30d, dashboard, reports, reports-timezone, repair-status-concurrency, repair-legacy-status-endpoints, tracking-links-api, commerce, commerce-sqlite, commerce-stock-race, warranties, warranties-sqlite, simplified-repairs, pagination, billing. Dos expectativas obsoletas fallaron inicialmente y fueron corregidas y reejecutadas con éxito.
- Aislamiento: 355 comprobaciones HTTP aprobadas. Permisos: 289 comprobaciones HTTP, cero grupos fallidos.
- Frontend: repair-hard-delete, repair-flow, repair-edit y cash-groups aprobados. Builds frontend/backend, typecheck frontend, codificación (421 archivos) y contrato route-registration aprobados.
- Backup unitario y engine aprobados; recuperación completa PostgreSQL17 aprobada: 29 controles, 25 modelos, 26 tablas, filas/FK/índices/secuencias/migraciones comparados, origen ficticio intacto. Se usó PG_BIN local ya instalado al faltar herramientas en el worktree nuevo. Ningún backup productivo.
- Prueba de cuentas utiliza ahora puerto asignado por el sistema, entorno test y nombre exclusivo account_deletion_test: evita colisiones con el puerto fijo ocupado sin relajar aislamiento remoto. Resultado: 62 comprobaciones aprobadas, proceso finalizado con código 0.
- Revisión independiente completada sin defectos accionables. git diff --check limpio.

## Publicación y límites

Solo commit/push de esta rama y PR draft hacia main para revisión. Sin merge, despliegues o migraciones productivas. Vercel deploymentEnabled=false solo para esta rama; título del PR [skip preview] omite previews Render. Fuentes: https://vercel.com/docs/project-configuration/git-configuration y https://render.com/docs/service-previews.

PR independiente #18 abierto como draft: https://github.com/marcosgradac/AdmTecnicoCelulares/pull/18. Frontend CI inicial aprobado. Backend CI inicial detectó un conteo fijo de 26 modelos en backup-stream-recovery; corregido a 25 por el retiro de RepairPhoto y reejecutado completo localmente: 27 controles aprobados, TLS, archivo real de 172289284 bytes (>128 MiB), restauración exacta y memoria acotada. Pendiente: CI del commit final y revisión del PR. Antes de cualquier despliegue futuro debe revisarse nuevamente el estado de RepairPhoto; si contiene filas, la migración se detendrá. Si datos antiguos carecen de repairId y de cualquier enlace explícito, no existe asociación verificable para atribuirlos: no se borran por coincidencia de descripción. Datos corruptos/compartidos requieren revisión en lugar de eliminación parcial. Frontend build advierte chunks grandes (sin error).

## Archivos modificados

- .github/workflows/ci.yml
- backend/package.json
- backend/prisma/migrations/20261012120000_remove_unused_repair_photos/migration.sql
- backend/prisma/schema.prisma
- backend/src/modules/account/account-deletion.service.ts
- backend/src/modules/repairs/repair-cancellation.routes.ts
- backend/src/modules/repairs/repair-delete.ts
- backend/src/modules/repairs/repair-query.ts
- backend/src/modules/repairs/repair-status.ts
- backend/src/modules/repairs/repair-write.routes.ts
- backend/tests/backup-stream-recovery.mjs
- backend/tests/account-deletion.ts
- backend/tests/billing.ts
- backend/tests/cash-groups.ts
- backend/tests/cash-period-30d.ts
- backend/tests/cash-period.ts
- backend/tests/fixtures/route-registration.json
- backend/tests/helpers/backup-fixtures.mjs
- backend/tests/helpers/repair-hard-delete-postgres.mjs
- backend/tests/helpers/role-permissions-postgres.mjs
- backend/tests/pagination.ts
- backend/tests/repair-advance-status.ts
- backend/tests/repair-cancellation.ts
- backend/tests/repair-creation-finance.ts
- backend/tests/repair-financial-visibility.ts
- backend/tests/repair-hard-delete.ts
- backend/tests/reports.ts
- backend/tests/role-permissions-complete.ts
- backend/tests/simplified-repairs.ts
- backend/tests/tenant-isolation-complete.ts
- backend/tests/tracking-links-api.ts
- backend/tests/warranties.ts
- docs/superpowers/plans/2026-10-12-repair-hard-delete-main.md
- frontend/package.json
- frontend/src/components/repairs/RepairCancellationDialog.tsx
- frontend/src/components/repairs/RepairDeleteDialog.tsx
- frontend/src/components/repairs/RepairStatusDialog.tsx
- frontend/src/config/repairStatus.ts
- frontend/src/pages/RepairDetailPage.tsx
- frontend/src/pages/RepairsPage.tsx
- frontend/src/services/repairs.ts
- frontend/src/types/repair.types.ts
- frontend/tests/repair-flow.cjs
- frontend/tests/repair-hard-delete.cjs
- frontend/vercel.json
