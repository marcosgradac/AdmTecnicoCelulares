# Retirada completa de cancelaciones de reparaciones

Fecha: 2026-10-12. Rama: codex/remove-repair-cancellation. Base origin/main: d575aea67ea63251a59125ab7aba80a1c4eabfaa, con PR #18 fusionado. PR #17 permanece sin fusionar; no se incorporaron sus commits ni su ledger financiero. Se preservaron los worktrees anteriores y sus modificaciones.

## Implementación

POST cancel, cancel-preview y cancellation-payment no están registrados: devuelven 404. Crear/cambiar a CANCELLED devuelve 400 sin efectos. DELETE se trasladó con el mismo handler a repair-delete.routes.ts; conserva transacción, locks, permisos, aislamiento y protección de datos compartidos del PR #18. Se retiraron únicamente sus consultas a las columnas de cancelación eliminadas.

La interfaz conserva diez estados vigentes, pagos normales y Eliminar reparación en el menú de tres puntos, con advertencia irreversible y botón rojo. Se retiraron diálogo/servicio de revisión, resúmenes financieros, filtros y tipos exclusivos de cancelación. Cancelar para cerrar formularios permanece.

Dashboard/reportes calculan saldos normales total-pagado; demos generan sólo reparaciones normales. No se modificaron módulos de clientes, Caja o Comercio ni la separación presupuesto/gasto real. Las consultas compartidas sólo retiran ramas de cancelación.

## Auditoría PostgreSQL productiva, sólo lectura

0 reparaciones CANCELLED; 0 historiales CANCELLED; 0 pagos cancellationReview=true; 0 movimientos CANCELLED_REPAIR_RETURN; 0 campos opcionales de cancelación poblados. Las 3 filas de cancellationReviewPaid sólo contienen el default obligatorio 0. RepairStatus se usa en Repair.status y las dos columnas de RepairStatusHistory; InventoryMovementType sólo en InventoryMovement.type. El índice CommerceSale.cancelledAt pertenece a Comercio y se conserva.

37 migraciones aplicadas, hasta remove_unused_repair_photos del PR #18. No se aplicaron migraciones ni borrados de prueba en producción en esta tarea.

## Migraciones nuevas, pendientes de aplicar

- PostgreSQL: backend/prisma/migrations/20261012180000_remove_repair_cancellation/migration.sql. BEGIN, locks exclusivos, guardas antes de DDL, retirada de siete campos Repair y uno Payment; reconstrucción de RepairStatus sin CANCELLED e InventoryMovementType sin CANCELLED_REPAIR_RETURN; RESTRICT y COMMIT. Si existen datos históricos o dependencias inesperadas, rechaza sin descartarlos.
- SQLite: backend/prisma/migrations-sqlite/20261012180000_remove_repair_cancellation/migration.sql. BEGIN IMMEDIATE, guardas CHECK y retirada de las mismas columnas. SQLite usa estados de texto y no tiene RepairStatusHistory ni InventoryMovement; no se inventaron tablas.
- Esquemas Prisma PostgreSQL/SQLite actualizados. Ninguna migración aplicada previamente fue editada.
- Cadena completa PostgreSQL aplicada a un cluster local ficticio. Cero diferencias nuevas con Prisma. Existe drift previo en Client.updatedAt: migración 20260729120000 declara DEFAULT CURRENT_TIMESTAMP y main Prisma @updatedAt sin default. El test normaliza exclusivamente esa diferencia en un esquema temporal y exige cero diferencias adicionales. No se modificaron clientes ni se agregó una corrección ajena.

## Pruebas ejecutadas

Sólo mocks, memoria y clusters nuevos en 127.0.0.1; los harnesses ignoran URLs productivas.

- Backend build y frontend build TypeScript/Vite: PASS. Vite conserva aviso de chunks mayores de 500 kB.
- Backend npm test: PASS (rutas, origen/IP, tracking).
- repair-hard-delete: PASS. Caja 100.000 + ingreso 50.000 - egreso 20.000 = 130.000; tras DELETE vuelve a 100.000. Caja general/agrupada, dashboard, gráficos y reportes coinciden exactamente con baseline. Sin movimientos residuales.
- DELETE en diez estados: PASS; pagos múltiples, devoluciones/correcciones ficticias, garantías, historial, cash antiguo sin repairId, referencias compartidas, rollback y carreras con pagos/gastos. Comercio y stock antiguo idénticos, sin restituciones.
- Retirada de cancelación: PASS; tres POST ausentes, CANCELLED rechazado sin efectos, API sin campos retirados y lectura/borrado normales. Contratos y regresiones añadidos al CI.
- Migración PG: 14 casos PASS (12 bloqueos con rollback exacto, éxito preservando filas/finanzas/Comercio/defaults/índices/FKs, dependencia enum inesperada). SQLite: 10 casos PASS sobre cadena histórica real.
- Suites PostgreSQL extended/regressions: PASS; creación, adelantos, edición, gastos, estados/concurrencia, Caja/paginación, dashboard, reportes/calendario, visibilidad financiera, garantías, Comercio/equipos, suscripciones y autenticación.
- Permisos: 285 controles HTTP PASS. Aislamiento: 347 controles HTTP PASS.
- Demos business y landing: PASS. Caja groups/period/30d: PASS. SQLite creación financiera/garantías/Comercio/dashboard: PASS.
- Frontend repair-hard-delete, repair-flow, repair-edit, repair-initial-cost, cash-groups: PASS. También encoding, platform-admin-metrics, expired-owner-renewal-ui, PWA (46 casos), api-domain-prep PASS.
- Revisión independiente de código y migraciones: sin problemas críticos/importantes. git diff --check: PASS.

Comprobaciones adicionales ajenas al cambio: equipment-sales frontend falla por useCallback faltante en su harness existente; CSP no completó fase de navegador por Chromium Playwright faltante; browser-hardening con Chrome agotó tiempo de navegación. No se ampliaron esos módulos. No se afirma que esas comprobaciones aprobaron. CI instala Chromium en Linux.

## Referencias conservadas y riesgos

Migraciones aplicadas conservan nombres/estados históricos para mantener checksums. tracking-links-migration.ts conserva CANCELLED ficticio sólo para comprobar una migración SQLite anterior. Nuevas guardas/pruebas incluyen nombres retirados para comprobar rechazo/ausencia. Informes/planes anteriores se preservan como historia; informe PR #18 y demo señalan esta versión posterior.

CommerceSale.cancelledAt, cancelCommerceSale, endpoints/índices/UI/pruebas de cancelar ventas se conservan: son Comercio. Cancelar formularios/suscripciones y variables de abortar efectos/procesos son independientes.

La migración de enums requiere locks y puede reescribir tablas: coordinar backend/frontend antes de aplicarla. El backend anterior no debe atender después de eliminar sus columnas. Volver a auditar inmediatamente antes de una futura aplicación; datos nuevos de cancelación deben bloquear y revisarse, sin transformarlos ni borrarlos automáticamente. PR #17 queda obsoleto y no debe fusionarse.

Sólo commit/push de rama y PR en borrador; sin merge ni deploy. No se modificó configuración mediante API Vercel. vercel.json conserva regla anterior y agrega deploymentEnabled=false sólo para codex/remove-repair-cancellation para prevenir previews, sin desactivar producción; limpiar esas reglas al preparar integración.

## Archivos modificados

- .github/workflows/ci.yml
- backend/package.json
- backend/prisma/migrations-sqlite/20261012180000_remove_repair_cancellation/migration.sql
- backend/prisma/migrations/20261012180000_remove_repair_cancellation/migration.sql
- backend/prisma/schema.prisma
- backend/prisma/sqlite/schema.prisma
- backend/src/modules/dashboard/dashboard.service.ts
- backend/src/modules/repairs/repair-activity.routes.ts
- backend/src/modules/repairs/repair-cancellation.routes.ts
- backend/src/modules/repairs/repair-delete.routes.ts
- backend/src/modules/repairs/repair-delete.ts
- backend/src/modules/repairs/repair-edit.ts
- backend/src/modules/repairs/repair-finance.routes.ts
- backend/src/modules/repairs/repair-finance.ts
- backend/src/modules/repairs/repair-read.routes.ts
- backend/src/modules/repairs/repair-response.ts
- backend/src/modules/repairs/repair-status.routes.ts
- backend/src/modules/repairs/repair-status.ts
- backend/src/modules/repairs/repair-write.routes.ts
- backend/src/modules/repairs/repairs.routes.ts
- backend/src/modules/reports/reports.service.ts
- backend/src/modules/warranties/warranties.service.ts
- backend/src/scripts/landing-demo.ts
- backend/src/scripts/load-business-demo.ts
- backend/tests/business-demo.ts
- backend/tests/dashboard-overview-contract.ts
- backend/tests/fixtures/route-registration.json
- backend/tests/helpers/repair-hard-delete-postgres.mjs
- backend/tests/helpers/role-permissions-postgres.mjs
- backend/tests/landing-demo.ts
- backend/tests/repair-advance-status.ts
- backend/tests/repair-cancellation-migration-sqlite.mjs
- backend/tests/repair-cancellation-migration.mjs
- backend/tests/repair-cancellation-removal.ts
- backend/tests/repair-cancellation-routes-contract.ts
- backend/tests/repair-cancellation.ts
- backend/tests/repair-edit.ts
- backend/tests/repair-financial-visibility.ts
- backend/tests/repair-hard-delete.ts
- backend/tests/repair-initial-cost.ts
- backend/tests/repair-legacy-status-endpoints.ts
- backend/tests/role-permissions-complete.ts
- backend/tests/tenant-isolation-complete.ts
- docs/remove-repair-cancellation-report.md
- docs/repair-hard-delete-main-report.md
- docs/security-6-audit.md
- docs/superadmin-demo.md
- docs/superpowers/plans/2026-10-12-remove-repair-cancellation.md
- frontend/src/components/repairs/EditRepairDrawer.tsx
- frontend/src/components/repairs/RepairAdvanceDialog.tsx
- frontend/src/components/repairs/RepairReviewPaymentDialog.tsx
- frontend/src/config/repairStatus.ts
- frontend/src/config/workflowRepairStatus.tsx
- frontend/src/pages/ClientDetailPage.tsx
- frontend/src/pages/RepairDetailPage.tsx
- frontend/src/pages/RepairsPage.tsx
- frontend/src/pages/dashboard/DashboardPage.tsx
- frontend/src/services/repairs.ts
- frontend/src/types/index.ts
- frontend/src/types/repair.types.ts
- frontend/tests/repair-edit.cjs
- frontend/tests/repair-flow.cjs
- frontend/tests/repair-hard-delete.cjs
- frontend/tests/repair-initial-cost.cjs
- frontend/vercel.json
