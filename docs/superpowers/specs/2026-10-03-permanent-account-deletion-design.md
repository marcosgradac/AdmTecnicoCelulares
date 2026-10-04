# Eliminación permanente de cuenta y negocio

Base: `61f06e97a7394250cd1406f256e824fe3cb83484`. Rama: `feature/permanent-account-deletion`.
Diseño aprobado por el usuario: implementación local, sin commit/push/merge/deploy ni servicios de producción.
Solo OWNER; TECHNICIAN recibe 403. No cambiar schema, migraciones ni Client.updatedAt.

## Contrato y seguridad

`DELETE /api/account`, body `{ password, confirmation }`. Express y axios soportan body DELETE.
authenticate obligatorio; volver a leer User dentro de la transacción, verificar tokenVersion, actividad,
businessId, rol y platformRole. SUPER_ADMIN: 403 con mensaje solicitado. TECHNICIAN: 403.
Frase literal `ELIMINAR MI CUENTA`, sin trim ni normalización. bcrypt.compare con passwordHash actual.
400 para frase/body/contraseña inválidos. Más de un OWNER activo (isActive y deletedAt null): 409.
Rate limit: cinco solicitudes por usuario cada 15 minutos y veinte por IP cada 15 minutos.
200 solo después del commit de la transacción. Errores FK/concurrencia: 409 controlado, sin stack.

## Mapa completo del schema PostgreSQL

Todas las relaciones obligatorias sin onDelete explícito usan Restrict; opcionales usan SetNull.

| Modelo | Padres/FKs | onDelete explícito / particularidades |
|---|---|---|
| Business | ninguno | raíz; slug unique |
| User | Business | Restrict implícito; email unique global |
| PasswordResetToken | User | Cascade; tokenHash unique |
| Client | Business | Restrict implícito; updatedAt intacto |
| Device | Business, Client | Restrict implícito |
| Repair | Business, Client, Device?, CashMovement? initialCostMovementId | caja Restrict; Device SetNull implícito; trackingToken e initialCostMovementId unique; businessId/number unique |
| RepairStatusHistory | Repair, User changedByUserId | Repair Cascade; User Restrict implícito |
| RepairPhoto | Repair | Cascade |
| RepairPart | Repair, StockItem | Restrict implícito |
| Payment | Business, Repair, Client, CashMovement? | caja Restrict; cashMovementId unique |
| StockItem | Business | Restrict implícito; businessId/sku unique |
| InventoryMovement | Business, StockItem, Repair?, User createdByUserId | User y Stock Restrict implícito; Repair SetNull implícito |
| WarrantyClaim | Business, Repair | Repair Restrict; id/businessId unique |
| WarrantyClaimExpense | WarrantyClaim, CashMovement | ambas Restrict con FK compuesta incluyendo businessId; cashMovementId unique; businessId/idempotencyKey unique |
| CashMovement | Business, ResaleDevice?, CommerceSale?, CommerceSale? reversión | Resale y reversión Restrict; venta original SetNull implícito; repairId es scalar sin FK; uniques de venta/reversión y resaleDeviceId/resaleVersion/resaleKind |
| CommerceProduct | Business | Restrict implícito; category es texto, sin FK |
| CommerceCategory | Business | Restrict implícito; businessId/name unique |
| CommerceSale | Business | Restrict implícito; businessId/idempotencyKey unique |
| CommerceSaleLine | CommerceSale, CommerceProduct | venta Cascade; producto Restrict implícito |
| Subscription | Business, Plan | Business Restrict; businessId unique |
| PaymentSubmission | Business, Subscription, Plan, User? reviewedByUserId | Business/Subscription Restrict; reviewer SetNull |
| SubscriptionAuditLog | Business, User actorUserId | ambas Restrict |
| PlatformInternalNote | Business | Cascade; authorUserId scalar, sin FK |
| ResaleDevice | Business | Restrict implícito |
| Plan | ninguno | global: conservar |
| BillingSettings | ninguno | global: conservar |

No hay otras entidades en schema.prisma. TECHNICIAN no se implementa: historial de estado,
movimientos de inventario y auditoría de suscripción requieren conservar su User por FKs Restrict.

## Orden real del purge

Una única prisma.$transaction serializable. Bloquear la fila Business mediante SELECT FOR UPDATE
antes de releer usuario/contar propietarios. Una segunda eliminación espera y devuelve 404/409/401.
El bloqueo es PostgreSQL, el proveedor activo de producción; SQLite se verifica como contrato de FKs local.
El schema SQLite legado no contiene todos los modelos de PostgreSQL. El endpoint utiliza el cliente
PostgreSQL existente; esta versión no agrega un servidor de account deletion para SQLite ni cambia ese schema.
Antes de borrar, rechazar referencias desde otros tenants a filas de A, incluyendo reviewers SetNull,
para preservar B exactamente. Nunca borrar referencias externas ni modificar FKs.

1. WarrantyClaimExpense por businessId.
2. WarrantyClaim por businessId.
3. Payment por businessId.
4. InventoryMovement por businessId.
5. RepairPart mediante repair.businessId.
6. RepairStatusHistory mediante repair.businessId.
7. RepairPhoto mediante repair.businessId.
8. Repair por businessId (incluye trackingToken).
9. StockItem por businessId (ya no quedan partes ni movimientos).
10. CashMovement por businessId (ya no quedan referencias desde Repair/Payment/Expense).
11. CommerceSaleLine mediante sale.businessId.
12. CommerceSale por businessId (ya no quedan referencias desde caja).
13. CommerceProduct por businessId.
14. CommerceCategory por businessId.
15. ResaleDevice por businessId (ya no quedan referencias desde caja).
16. Device por businessId.
17. Client por businessId.
18. PaymentSubmission por businessId.
19. SubscriptionAuditLog por businessId.
20. PlatformInternalNote por businessId.
21. Subscription por businessId.
22. PasswordResetToken mediante user.businessId.
23. User por businessId.
24. Business por id.

No dependencia exclusiva de Cascade. Cada paso explícito y tenant scoped. Cualquier fallo revierte todo.
Filas concurrentes: aislamiento serializable y restricciones FK impiden un commit parcial; conflictos 409.
Si existen referencias externas incompatibles, se rechaza todo en vez de tocar B.

## UI y sesiones

Configuración > Seguridad: componente Zona de peligro solo OWNER no SUPER_ADMIN.
Descripción exacta solicitada, Dialog MUI con contraseña y frase; sin window.confirm.
Botón final requiere frase exacta y contraseña no vacía. Ref síncrona impide doble submit;
spinner, campos/botones deshabilitados, Escape y backdrop bloqueados durante request.
Al éxito limpiar token/AuthContext, trial y tutorial del usuario; navegar login con mensaje
`Tu cuenta fue eliminada permanentemente.` sin logout HTTP. Propagar cierre a otras tabs mediante storage.
Un aviso temporal en sessionStorage conserva el mensaje frente al redirect de ProtectedRoute y se consume
en login. Generación de sesión y token actual invalidan respuestas auth tardías después del borrado.
authenticate ya busca User: JWT de cualquier usuario eliminado pasa a 401.
Ambas rutas públicas de UI consumen /api/tracking/:token: sin Repair devuelve 404.

## Pruebas

PostgreSQL aislado local puerto 55439, nunca URL de producción. Fixtures completas A/B con cada modelo;
snapshot íntegro de B/globales antes/después. Frase/contraseña/roles/múltiples propietarios, purge físico,
tokens JWT de owner y technician, email registrado nuevamente, tracking 404, rate limit y simultaneidad.
Trigger local que falla en un delete intermedio para demostrar rollback real. Referencias cruzadas se bloquean.
Ejecutar todos los comandos de regresión pedidos, registrar resultados y limitaciones concretas.
