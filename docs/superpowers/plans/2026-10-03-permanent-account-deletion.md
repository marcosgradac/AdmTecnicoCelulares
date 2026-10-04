# Permanent Account Deletion Implementation Plan

**Goal:** Borrado físico inmediato del tenant por OWNER validado.
**Architecture:** Endpoint y servicio aislados, purge explícito serializable PostgreSQL y UI MUI.
**Tech Stack:** Express, Prisma, bcryptjs, React, MUI, PostgreSQL.
**Spec:** ../specs/2026-10-03-permanent-account-deletion-design.md
**Execution:** Nativa en esta sesión, autorizada por el usuario junto con la especificación.

## Global Constraints

Sin commits ni push/merge/deploy; sin producción ni FKs/schema/migraciones; Client.updatedAt intacto.
TECHNICIAN y SUPER_ADMIN 403; frase exacta y contraseña obligatorias; múltiples OWNER activos 409.

## Review Focus

Referencias cruzadas con SetNull deben bloquear en vez de alterar B; comprobar fixture malformada.
Contraseña/tokenVersion/rol pueden cambiar entre authenticate y transacción; releer con lock.
Dos tabs/requests concurrentes: una sola operación exitosa y segunda respuesta controlada.
Fallo después de borrar hijos: trigger DB debe probar rollback y snapshot idéntico.
Modelo nuevo en schema: test de cobertura exhaustiva debe fallar hasta mapearlo.

## Task 1: Backend y pruebas reales

Files: backend/tests/account-deletion.ts, backend/src/modules/account/account-deletion.service.ts,
backend/src/modules/account/account.routes.ts, backend/src/server.ts, backend/package.json.
Interface: deleteOwnerAccount(auth: AuthData, password: string): Promise<void>.
- [x] Escribir tests HTTP/DB y ejecutarlos contra localhost:55439: endpoint ausente debe fallar.
- [x] Implementar validación, lock y purge según orden documentado; errores controlados y rate limits.
- [x] Ejecutar suite con todos los modelos A/B, rollback trigger, emails, JWT, tracking y concurrencia.

## Task 2: Frontend

Files: frontend/src/features/settings/AccountDeletionSection.tsx, SettingsPage.tsx, settings.api.ts,
frontend/src/auth/AuthContext.tsx, frontend/src/pages/LoginPage.tsx, frontend/tests/account-deletion.cjs.
Interface: deleteAccount(password: string, confirmation: string): Promise<{message: string}>.
- [x] Verificar contrato UI OWNER, Dialog, guard síncrono, cierre/limpieza y mensaje.
- [x] Implementar componente independiente y montaje solo OWNER no SUPER_ADMIN.
- [x] Verificar typecheck/build y tests frontend; revisión visual si navegador disponible.

## Task 3: Regresiones y entrega local

- [x] Ejecutar db:generate, typecheck/build y todas las suites pedidas en DB aislada.
- [x] Revisar diff, seguridad/FKs/cobertura y git diff --check/status.
- [x] Guardar informe y diff completo local para revisión, sin commit ni push.

## Registro de ejecución

Autorización explícita del usuario para especificación e implementación secuencial en el mismo chat.
Sin commits; la prohibición del usuario reemplaza los pasos de commit sugeridos por las skills.
TDD backend: endpoint ausente devolvió 404 en vez de 400. Suite detectó StockItem omitido;
se agregó al orden explícito, sin cambiar FKs. Prueba final: 45 comprobaciones PostgreSQL reales.
TDD frontend: faltaba botón OWNER; después se verificó UI real React/MUI en Edge headless con HTTP mock.
La primera prueba del aviso detectó pérdida de state por redirect; aviso temporal consumido en login.
Revisión independiente detectó auth tardío en segunda tab. Prueba roja con ambas respuestas de StrictMode
retenidas reprodujo la restauración del usuario; generación/token la corrigen. Revisión posterior limpia.
Suite UI final: 10 comprobaciones, incluidos doble clic, dos tabs y ambos formatos de tracking.
Regresiones: todos los comandos pedidos pasaron. db:generate requirió cerrar API local por DLL Windows;
commerce/equipment requirieron planes INITIAL/PROFESSIONAL en fixtures de la DB aislada.
La especificación SQLite es legado incompleto; no se agrega endpoint SQLite ni se modifica arquitectura.
