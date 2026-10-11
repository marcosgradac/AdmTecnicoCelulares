# Repair cancellation finance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Conservar dinero e historial reales al presupuestar, cancelar y conciliar reparaciones.

**Architecture:** Libro CashMovement append-only con compensaciones vinculadas, distinguiendo dinero real de corrección contable. Todas las operaciones de una reparación se serializan y el resumen común alimenta UI y reportes.

**Tech Stack:** TypeScript, Express, Prisma/PostgreSQL y SQLite, React/MUI, Node assert, PostgreSQL desechable.

**Spec:** `docs/superpowers/specs/2026-10-11-repair-cancellation-finance.md`

## Global Constraints

- No producción, Supabase, datos reales, secretos, infraestructura, merge ni despliegue.
- Correcciones sin dinero nunca se suman a ingresos; movimientos originales intactos.
- Importes externos enteros entre 0 y 2147483647; sólo el servidor genera el ajuste EXPENSE negativo identificado; businessId y permisos en cada operación.
- Pruebas exclusivamente ficticias, en un cluster nuevo local con dotenv deshabilitado.

## Review Focus

- Históricos con descripciones similares: atribución por ID y confirmación explícita, nunca adivinación.
- Reintento con requestId diferente o payload modificado: no recuperar/devolver más que el saldo real.
- Cancelación concurrente con pago: mismo bloqueo y lectura vigente.
- Ajuste en período posterior: ninguna modificación del importe/fecha original.
- Repuesto conservado: cero ingreso ficticio y cero cambio automático de stock.

### Task 1: Regresiones y modelo aditivo
**Files:** `backend/tests/repair-cancellation-finance.ts`, `backend/tests/helpers/repair-finance-postgres.mjs`, `backend/prisma/schema.prisma`, `backend/prisma/sqlite/schema.prisma`, migración nueva.
**Interfaces:** CashMovement incluye `accountingOnly`, `repairFinanceKind`, `relatedMovementId`, `operationKey`, `operationPayload`, `performedByUserId`, `reason`; Repair incluye `financeVersion`, `cancellationRequestId`, `cancellationRequestPayload`, `cancellationRefundPaid`.
- [x] Escribir test presupuesto 30000 → cero egresos y correrlo contra base actual (FAIL).
- [x] Añadir casos A–F, confirmaciones, históricos, permisos y períodos al cluster loopback propio.
- [x] Crear migración aditiva y generar clientes; probar sólo en local.

### Task 2: Operaciones y cancelación transaccional
**Files:** `backend/src/modules/repairs/repair-ledger.ts`, `repair-ledger.routes.ts`, `repair-finance.ts`, `repair-write.routes.ts`, `repair-edit.ts`, `repair-cancellation.routes.ts`, `repair-finance.routes.ts`, `repair-activity.routes.ts`, `repair-query.ts`, `repair-response.ts`.
**Interfaces:** `repairFinancialSummary(movements, repair)`; gastos, compensación y vista previa/confirmación por ID; cancelación devuelve Repair con resumen.
- [x] Verificar tests rojos de recuperación vs corrección, idempotencia y concurrencia.
- [x] Implementar compra confirmada, conciliación explícita y vista previa, bloqueos comunes y liquidación real.
- [x] Sustituir mutación/borrado de egresos y bloquear edición destructiva de cobros.
- [x] Ejecutar casos A–F y pruebas de atomicidad/tenant/permisos; integrar en el único commit del PR.

### Task 3: Caja, dashboard y reportes
**Files:** `cash-groups.service.ts`, `cash.routes.ts`, `reports.service.ts`, `dashboard.service.ts`, `dashboard-cash.ts`; tests de caja/reportes/períodos.
**Interfaces:** Movimientos compensatorios cuentan con signo en expense, nunca como ingreso; grupos incluyen status y resumen.
- [x] Escribir regresiones contra desajustes de períodos, devoluciones y recuperaciones no Payment.
- [x] Implementar indicadores compatibles, mantener facturación distinta de caja, canceladas visibles.
- [x] Ejecutar regresiones de caja/dashboard/reportes y permisos sensibles; integrar en el commit del PR.

### Task 4: Frontend y controles de operación real
**Files:** servicios/types; NewRepairDrawer, EditRepairDrawer, RepairCancellationDialog, RepairDetailPage, componentes financieros y Cash groups; tests frontend.
**Interfaces:** UUID estable por acción, vista previa backend, cuatro opciones, confirmación de dinero/corrección y resumen real.
- [x] Test rojo: presupuesto sin compra no pide método ni envía gasto; selección sola no confirma recuperación.
- [x] Implementar UI de gasto explícito, conciliación, revisión/devolución pendiente, etiquetas y detalle.
- [x] Ejecutar tests funcionales frontend, build/typecheck y regresiones previas; commit.

### Task 5: Auditoría y entrega
**Files:** CI, documentación de conciliación y despliegue pendiente.
- [x] Ejecutar suites financieras, seguridades relevantes y compilaciones; registrar resultados.
- [x] Revisar toda la rama con un auditor independiente; corregir problemas importantes mediante test rojo/verde.
- [ ] Crear un único PR borrador, esperar ambos CI y entregar SHA, pruebas y riesgos. No merge/deploy.

## Execution rulings

El propietario autorizó explícitamente continuar después de validar la especificación contra sus reglas; se ejecuta en esta sesión y se reserva revisión independiente final. Se utiliza rama independiente en el checkout existente, conservando `docs/security/` no rastreado; no se crea otro worktree sin consentimiento.
