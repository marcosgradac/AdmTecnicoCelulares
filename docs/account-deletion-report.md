# Informe de eliminación permanente — 3 de octubre de 2026

Implementación completa y local, exclusiva para OWNER. Sin soft delete, recuperación ni solicitudes pendientes.

## Rama y base

- Rama: `feature/permanent-account-deletion`.
- SHA base y HEAD final: `61f06e97a7394250cd1406f256e824fe3cb83484`.
- Todo el cambio está sin commit. No se trabajó directamente sobre main.

## Relaciones, FKs y orden de purge

Se leyó completo `backend/prisma/schema.prisma`: 26 modelos, 24 incluidos en el purge y dos globales.
El [mapa completo](superpowers/specs/2026-10-03-permanent-account-deletion-design.md)
documenta cada FK, Restrict/Cascade/SetNull y uniques, incluyendo relaciones indirectas y scalars sin FK.

Orden ejecutado, en una única `prisma.$transaction` serializable:

1. WarrantyClaimExpense
2. WarrantyClaim
3. Payment
4. InventoryMovement
5. RepairPart
6. RepairStatusHistory
7. RepairPhoto
8. Repair
9. StockItem
10. CashMovement
11. CommerceSaleLine
12. CommerceSale
13. CommerceProduct
14. CommerceCategory
15. ResaleDevice
16. Device
17. Client
18. PaymentSubmission
19. SubscriptionAuditLog
20. PlatformInternalNote
21. Subscription
22. PasswordResetToken
23. User
24. Business

Cada deleteMany está limitado por businessId o relación hacia Repair/CommerceSale/User del tenant.
Business se selecciona exclusivamente desde el usuario autenticado, nunca desde el body.
Se bloquea la fila Business con SELECT FOR UPDATE. Referencias externas potencialmente afectadas
por SetNull/Cascade se detectan antes del purge; se responde 409 y no se modifica otro tenant.
Otras restricciones FK también provocan rollback controlado. No se depende solamente de Cascade.
Plan y BillingSettings nunca se borran ni se actualizan por este endpoint.

## Endpoint y seguridad

`DELETE /api/account` con body:

```json
{ "password": "contraseña actual", "confirmation": "ELIMINAR MI CUENTA" }
```

Express y axios soportan este body; no se necesitó un POST alternativo.

- authenticate obligatorio; se conserva la validación de sesión/acceso actual del proyecto.
- Validación estricta del body: no acepta businessId, userId ni campos extra.
- La frase se compara literalmente: sin trim, sin normalización ni equivalencia de mayúsculas.
- bcrypt.compare contra passwordHash actual, leído dentro de la transacción.
- Se releen usuario, tenant, tokenVersion, actividad, deletedAt, role y platformRole.
- Rate limit específico: 5 intentos/usuario/15 minutos y 20/IP/15 minutos, antes del bcrypt/purge.
  Usa el store en memoria del framework existente; los límites son por proceso.
- Contraseña/frase/body incorrectos: 400. Sesión inexistente/obsoleta: 401.
- Éxito: 200 después de completar y confirmar la transacción.
- Segunda operación concurrente: 401/404/409 controlado; la prueba verifica exactamente un éxito.
- Errores FK/transacción: 409 genérico, sin stack ni SQL/contraseñas en la respuesta.

## Roles

OWNER elimina inmediatamente Business, todos sus usuarios activos/inactivos y todos los datos tenant-owned.
Más de un OWNER activo (isActive y deletedAt null): 409 con el mensaje solicitado.
Un OWNER inactivo adicional no bloquea y también desaparece físicamente.

TECHNICIAN: no hay autoeliminación, ni opción frontend ni soft delete alternativo. Endpoint manual: 403,
`Solo el propietario puede eliminar permanentemente la cuenta y el negocio.`
No se modificaron RepairStatusHistory.changedByUserId, InventoryMovement.createdByUserId
ni SubscriptionAuditLog.actorUserId. Sus FKs Restrict siguen conservando la autoría histórica.

SUPER_ADMIN: sin botón y con bloqueo backend 403,
`La cuenta de administración de plataforma no puede eliminarse desde este flujo.`

## Frontend y sesiones

Configuración > Seguridad muestra Zona de peligro solo al OWNER no SUPER_ADMIN.
Título, descripción y botones coinciden con los textos pedidos. Dialog MUI, sin window.confirm.
Contraseña obligatoria; frase exacta habilita el submit. Ref síncrona evita doble submit antes del render.
Spinner, campos y botones deshabilitados, Escape y backdrop bloqueados mientras corre.
Un error controlado conserva la sesión y permite reintentar.

Éxito elimina token, AuthContext, indicador de trial y tutorial local; navega a login con
`Tu cuenta fue eliminada permanentemente.` No llama a logout HTTP.
Storage propaga la invalidación a otras tabs. Generación y token impiden que respuestas auth tardías
restauren el User eliminado. El aviso temporal se consume en login.

## Pruebas físicas, aislamiento y rollback

Base usada exclusivamente: PostgreSQL local `127.0.0.1:55439/account_deletion_test`.
La nueva suite rechaza otra base/host/puerto antes de importar servidor o Prisma.
Se dejaron fixtures locales para inspección; no hubo deletes globales de limpieza.

- 45 comprobaciones backend. Fixtures con todos los modelos del schema; guard de cobertura falla
  si aparece un modelo nuevo que aún no fue mapeado.
- Business A se elimina; snapshots completos de B y otros tenants permanecen idénticos,
  incluidos IDs, todos los campos y timestamps. Cada entidad del tenant eliminado desaparece.
- Plan/BillingSettings permanecen idénticos.
- Dos DELETE simultáneos: uno solo devuelve 200; el otro termina controladamente.
- Trigger PostgreSQL de test falla en CashMovement, después de borrar varias entidades:
  snapshot de toda la base idéntico al anterior; rollback total probado. Trigger retirado al terminar.
- Referencia PaymentSubmission.reviewedByUserId de B hacia el OWNER a borrar: 409 y B intacto.
- JWT antiguos de OWNER y TECHNICIAN eliminados: GET /api/auth/me devuelve 401.
- Registro HTTP real con el mismo email borrado: 201.
- GET /api/tracking/:token después del purge: 404, sin Repair ni trackingToken conservado.
- Revalidación de tokenVersion dentro de la transacción, contraseña cambiada y body con businessId ajeno.
- Límites de usuario entre distintas IPs y límite de IP entre usuarios diferentes: 429 sin borrar datos.

10 comprobaciones frontend sobre React/MUI reales en Edge headless, con solo HTTP simulado:
visibilidad por rol, advertencia, frase exacta, doble clic, spinner/Escape/backdrop, error/reintento,
éxito/limpieza/mensaje y dos tabs con auth tardío, ausencia de errores runtime, ambos formatos de tracking.
Las rutas SPA `/seguimiento/:token` y `/s/:slug/:token` consumen /api/tracking/:token;
con 404 muestran Seguimiento no encontrado y ningún dato tenant-owned.

## Comandos de regresión

Todos terminaron con exit code 0 en su verificación final:

| Backend | Resultado |
|---|---|
| npm run db:generate | PASS, clientes PostgreSQL y SQLite |
| npm run typecheck | PASS |
| npm run build | PASS |
| npm run test:settings-team | PASS |
| npm run test:password-change | PASS |
| npm run test:password-reset | PASS |
| npm run test:tenant-isolation | PASS |
| npm run test:subscription-lifecycle | PASS |
| npm run test:platform-admin-actions | PASS |
| npm run test:tracking-links | PASS, unit/migration/API |
| npm run test:warranties | PASS, PostgreSQL/SQLite |
| npm run test:commerce | PASS, PostgreSQL/SQLite |
| npm run test:equipment-sales | PASS, PostgreSQL/SQLite |
| npm run test:cash-groups | PASS |
| npm run test:simplified-repairs | PASS |
| npm run test:account-deletion | PASS, 45 comprobaciones |

| Frontend | Resultado |
|---|---|
| npm run typecheck | PASS |
| npm run build | PASS |
| npm run test:encoding | PASS |
| npm run test:repair-flow | PASS |
| npm run test:pwa | PASS |
| npm run test:account-deletion | PASS, 10 comprobaciones de navegador |

Incidencias resueltas de entorno: db:generate inicialmente encontró la DLL bloqueada por la API local;
pasó al cerrarla. Commerce/equipment inicialmente necesitaban Plan INITIAL/PROFESSIONAL, ausentes
en la base creada con db push; se cargaron solo esas fixtures locales y las suites pasaron.
Build frontend muestra el aviso habitual de chunks >500 kB; finaliza correctamente.
Logs completos y scripts locales: `artifacts/account-deletion/` (ignorado por Git).
`db-evidence.json` registra IDs del tenant eliminado/preservado, conteos físicos en cero, concurrencia,
registro con email reutilizado y rollback; es generado solo después de pasar toda la suite.
UI test usa PLAYWRIGHT_MODULE para el runtime incluido y PLAYWRIGHT_BROWSER_CHANNEL=msedge.
Vite de prueba está configurado con VITE_API_URL=http://127.0.0.1:5178/api e interceptado por la suite.

SQLite: se generó su cliente y pasaron todas las regresiones SQLite pedidas. Su schema legado es
incompleto respecto del PostgreSQL activo; no se agregó un endpoint account deletion SQLite.

## Archivos modificados y agregados

Modificados:

- backend/package.json
- backend/src/server.ts
- frontend/package.json
- frontend/src/auth/AuthContext.tsx
- frontend/src/features/settings/SettingsPage.tsx
- frontend/src/features/settings/settings.api.ts
- frontend/src/pages/LoginPage.tsx

Agregados:

- backend/src/modules/account/account-deletion.service.ts
- backend/src/modules/account/account.routes.ts
- backend/tests/account-deletion.ts
- frontend/src/features/settings/AccountDeletionSection.tsx
- frontend/tests/account-deletion.cjs
- docs/superpowers/specs/2026-10-03-permanent-account-deletion-design.md
- docs/superpowers/plans/2026-10-03-permanent-account-deletion.md
- docs/account-deletion-report.md

No schema ni migraciones nuevas/históricas modificadas. Sin dependencias adicionales ni cambios de lockfiles.

## Revisión y estado final

Revisión independiente de código y segunda revisión del arreglo de sesión: sin hallazgos pendientes.
git diff --check: PASS. git status --short -uall se incluye junto al diff en artifacts/account-deletion.
El diff completo incluye archivos nuevos sin necesidad de stage/commit.

Confirmado: sin commit, push, merge ni deploy; sin tocar Supabase producción, Render o Vercel.
Client.updatedAt intacto en schema/código; los timestamps de otro tenant son idénticos según los snapshots.
Solo se utilizaron base y servidores locales de prueba. No se enviaron emails reales: transporte fake
o stub de Turnstile limitado a los tests.
