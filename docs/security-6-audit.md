# Seguridad 6 — autorización de roles y permisos

Base: `b6b595d7ef77a153d1b260c828bc471b8922f0d5`. Auditoría estática de routers, servicios, schemas, middleware de autenticación y guards del frontend; pruebas HTTP con PostgreSQL local desechable y datos ficticios. No hubo consultas ni cambios productivos.

## Vulnerabilidad reproducida y corrección

Un TECHNICIAN con `reports.view`, sin `reports.viewSensitive`, obtenía `/api/reports/overview` 200 con `finance.partsCost`, costos laborales, cobros, rentabilidad, márgenes y clientes ordenados por importes. La prueba HTTP falló con `reports.view leaked finance` antes de modificar código.

El límite HTTP ahora conserva período, estadísticas operativas de reparaciones, cantidades de clientes y empleados; elimina `finance`, importes del resumen y rankings financieros, y proyecta `{name, repairs}` para clientes por cantidad. OWNER y técnicos con ambos permisos conservan la respuesta financiera completa. No se cambian cálculos ni almacenamiento. `reports.viewSensitive` por sí solo no concede acceso al reporte.

## Matriz efectiva de API

Todos los permisos privados provienen del usuario en DB, no de los claims `role`, `platformRole` o `permissions` del JWT. OWNER posee todos los permisos. TECHNICIAN usa la lista almacenada; `[]` es ningún permiso y un valor no-array conserva los defaults históricos. SUPER_ADMIN no es un bypass de roles/permisos de taller: en rutas ordinarias usa su negocio y su rol; su alcance global existe sólo bajo `/api/platform-admin`.

| Rutas (prefijo /api) | Autorización efectiva |
|---|---|
| GET clients, clients/options, clients/:id | clients.view |
| POST clients / PATCH clients/:id / DELETE clients/:id | clients.create / clients.update / clients.delete |
| GET repairs, repairs/:id, repairs/:id/history | repairs.view; costos y notas de correcciones financieras proyectados según viewFinancials |
| POST repairs | repairs.create; costo, mano de obra o adelanto positivo requieren además repairs.viewFinancials |
| PATCH repairs/:id, repairs/:id/edit | repairs.update; campos privados en edit requieren repairs.viewFinancials; PATCH histórico sólo acepta campos operativos |
| DELETE repairs/:id | repairs.delete y condiciones de estado/pagos |
| PATCH repairs/:id/status, status/advance, status/rewind, approve, start | repairs.changeStatus; transiciones válidas y conflicto concurrente; approve histórico puede devolver LEGACY_STATUS |
| POST repairs/:id/cancel | repairs.changeStatus; dinero pagado o reviewFee positivo requieren repairs.viewFinancials; operación atómica |
| POST repairs/:id/delivery/correction | OWNER; no se delega mediante permisos |
| GET/POST repairs/:id/payments; PATCH advance, initial-cost; POST cancellation-payment | repairs.viewFinancials, sin requerir repairs.view adicional: permiso financiero explícito |
| POST/PATCH repairs/:id/tracking-link | repairs.shareTracking; plan/cuota y pertenencia |
| GET warranties | repairs.view; costos de reclamos visibles con viewFinancials, cash.view o cash.create |
| PATCH/DELETE warranties/:repairId; POST claims; PATCH claims/:id | repairs.view + repairs.update; gasto inicial adicional exige cash.create |
| POST warranties/claims/:id/expenses | repairs.view + repairs.update + cash.create |
| POST warranties/claims/:id/delivery | repairs.view + repairs.changeStatus |
| GET/POST cash/movements | cash.view / cash.create; permiso de caja permite importes de caja, agrupaciones y resúmenes; origen COMMERCE exige entitlement |
| GET reports/overview | reports.view + entitlement advancedReports; finance sólo OWNER o reports.viewSensitive |
| GET dashboard/overview | OWNER |
| GET settings, settings/business/logo; POST settings/logout-other-sessions | settings.access; revocación sólo del propio usuario |
| PATCH settings/business; POST/DELETE settings/business/logo | settings.business.update; campos estrictos y validación de imagen |
| GET team, team/:id | team.view; proyección sin passwordHash, reset tokens ni tokenVersion |
| POST team; PATCH team/:id; POST team/:id/reset-password; DELETE team/:id | OWNER + team.create/update/deactivate; OWNER posee esos permisos; bloqueo transaccional para último OWNER |
| GET commerce/categories, products, movements, sales, summary | commerce.view + entitlement commerce; precios/costos propios del módulo forman parte de este permiso |
| POST/PATCH/DELETE commerce/categories y products; POST expenses, sales/:id/cancel | commerce.manage + entitlement commerce |
| POST commerce/sales | commerce.sell + entitlement commerce; precio esperado, stock, idempotencia y caja atómicos |
| GET equipment-sales, summary | equipmentSales.view; costos propios de este módulo son parte del permiso |
| POST/PATCH equipment-sales | equipmentSales.manage |
| POST equipment-sales/:id/sell | equipmentSales.sell; versión esperada y dinero atómicos |
| GET billing/entitlements | usuario autenticado; sólo disponibilidad de funciones |
| GET billing/subscription, usage, transfer-details, payments; POST select-plan, payments | OWNER; modo renovación permite estas rutas sin acceso operativo |
| GET billing/plans | público: registro anterior al router privado, intencional |
| DELETE account | OWNER USER activo, contraseña actual, confirmación exacta; sólo un OWNER activo; revalidación DB dentro de transacción; SUPER_ADMIN rechazado |
| platform-admin/*: dashboard, businesses/detail/status/renew/expiry/block/unblock/notes, subscriptions/detail/actions, payments/approve/reject/confirm-accreditation, billing-settings, service-settings | requireSuperAdmin global antes de todos los handlers; notas editables/eliminables sólo por su autor; controles propios evitan bloquear negocio administrador |
| auth/me, profile GET/PATCH, auth/tutorial-seen, auth/password-change/* | identidad DB autenticada; campos de perfil explícitos; capability password-change acotada al mismo usuario y tokenVersion |
| auth/register/login/forgot-password/reset-password | públicas con protecciones existentes; registro fija OWNER USER para un negocio nuevo; recuperación sólo titular del token y usuario activo, sin cambio de privilegios |
| health, api/health, tracking/:token, tracking-preview/:token, business-logo/:businessId | públicas intencionales, proyecciones de seguimiento y token/captcha/límites existentes; no son rutas administrativas |

`settings.repairs.update` no tiene operación actual. `team.permissions.update` está en catálogo pero cambios de permisos ya son exclusivos de OWNER (que posee todos los permisos). No se interpretan como delegación a TECHNICIAN ni se crean funciones para usarlos.

## Tokens, estado y concurrencia

- Cada petición reconsulta rol, permisos, plataforma, tokenVersion, estado del usuario/negocio y suscripción. JWT firmado con privilegios falsos no altera autoridad. Claims businessId incorrectos, purpose tokens como sesión, firma inválida y ausencia de JWT se rechazan.
- Cambiar permisos o rol afecta al mismo JWT en la siguiente petición. Desactivar impide acceso; reactivar conserva el JWT si no cambió tokenVersion: comportamiento actual, no se redefine la política de sesiones de Seguridad 7.
- Reset de contraseña de empleado, recuperación y cambio de contraseña incrementan tokenVersion. Eliminación de empleado también; tokens anteriores se rechazan.
- Dos OWNER despromoviéndose simultáneamente: 200/409 y queda uno activo. El advisory lock por negocio serializa los cambios. Rechazos concurrentes de cobro y promoción no dejan dinero ni permisos parcialmente cambiados.
- Vencimiento automático conserva sólo OWNER en renovación (auth/me, billing y account); TECHNICIAN no entra. Bloqueo manual y negocio inactivo rechazan sesiones ordinarias. La capability de eliminación de cuenta queda limitada a DELETE account y revalida rol/contraseña/versión, incluso en cuentas bloqueadas.

## Coherencia del frontend (sólo lectura)

PermissionGuard/canAccess coincide con OWNER o permiso listado; aliases `payments:create` → viewFinancials y `cash:manage` → cash.view. RoleGuard protege Empleados; PlatformAdminGuard comprueba plataforma. Backend vuelve a comprobar todos esos controles.

Garantías es OWNER-only en frontend, pero backend permite operaciones delegadas de reparaciones/caja: diferencia intencional compatible con permisos existentes, no elevación de rol. team.view permite una lectura de equipo por API aunque la pantalla sea OWNER-only. Reportes se retiró de navegación y de la lista de permisos UI, pero el permiso y API permanecen: ocultar esa pantalla no protegía la fuga confirmada. Configuración de negocio puede delegarse; billing entitlements y planes no son datos financieros privados. No hubo cambios de frontend.

## Evidencia reproducible

`npm run test:role-permissions-complete` crea un PostgreSQL nuevo en loopback, ignora DATABASE_URL configurada, aplica migraciones exclusivamente allí y elimina su directorio temporal tras detenerlo. Dos negocios independientes y un admin separado; OWNER, técnicos completos/parciales/sin permisos/inactivos; controles positivos y negativos, claims manipulados, tokens anteriores, suscripciones y snapshots completos de 18 grupos de datos. Ninguna prueba consulta datos reales.

`node tests/helpers/role-permissions-postgres.mjs --regressions` ejecuta las regresiones existentes de reportes, visibilidad financiera, equipo, contraseñas, vencimiento, billing, plataforma, pagos, cancelación/estados concurrentes, garantías, comercio, equipos, Seguridad 5 y perfiles contra otro cluster temporal. El test histórico account-deletion exige su base local fija 127.0.0.1:55439/account_deletion_test y se verifica por separado.

## Riesgos / límites pendientes

Validación local final: 287 comprobaciones HTTP de la matriz, 24 suites de regresión existentes, 63 comprobaciones de eliminación de cuenta y 17 de su interfaz; tests base, typecheck y build de backend/frontend aprobados. Los nueve scripts de prueba del frontend pasaron (el de eliminación usa Playwright con Edge local y API simulada). La revisión independiente pidió controles positivos de clients.delete, repairs.delete y settings.business.update para TECHNICIAN: incorporados y aprobados. No identificó otra vulnerabilidad reproducible.

- Se conserva el riesgo de Seguridad 5: FK históricas sin igualdad businessId garantizada por DB; no se consultó integridad histórica real ni se agregan migraciones.
- La revocación de roles/permisos opera al autenticar cada petición. No se garantiza cancelación de una operación ya autorizada y en vuelo; imponer revalidación transaccional uniforme o invalidación al reactivar sería un cambio de política/sesiones para aprobación separada (Seguridad 7).
- Módulos commerce/equipment/cash tienen permisos financieros propios. Separar lectura de costos de sus actuales permisos view requeriría nuevos permisos/política, fuera de este PR.
- Permisos sin array conservan defaults históricos; normalizarlos en DB o eliminar permisos de catálogo sin uso no forma parte de esta corrección.
- Si se agregan campos financieros a las estructuras operativas repairs/employees del reporte, deben revisarse también sus proyecciones; actualmente no contienen esos campos.
