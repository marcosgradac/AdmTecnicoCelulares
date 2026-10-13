# Equipo: detalles y eliminación definitiva

Base origin/main 5841e3bf04c0f91c593781f8a1fe035b81a4ca1f. Rama codex/equipment-resale-details-delete; worktree separado para conservar cambios anteriores.

Diseño: cinco columnas en escritorio y tarjetas compactas en móvil. Menú siempre disponible con Ver detalles y acciones según estado/permiso, incluso SOLD. Modal Material UI grande con scroll interno; muestra sólo atributos almacenados, separa estimaciones/valores reales y utiliza títulos actuales y colores financieros accesibles. Diálogo destructivo separado con confirmación deliberada y bloqueo sincrónico de doble envío.

API: GET /api/equipment-sales/:id -> {device, movements}, permission equipmentSales.view y DTO explícito sin datos ajenos. DELETE /:id -> {success:true}, permiso equipmentSales.delete y body estricto {expectedVersion, confirmed:true}. Equipo bloqueado FOR UPDATE antes de comprobar tenant/version; filas de Caja bloqueadas y revisadas contra origen/tenant/reparaciones/ventas/pagos/garantías. Borrado de Caja exclusiva y luego equipo en transacción, sin compensaciones/cascadas ni tocar stock. Editar/vender comparten bloqueo y CAS. Resúmenes existentes recalculan por consultas a registros restantes.

Sin migraciones previstas: ResaleDevice.version y relación CashMovement.resaleDeviceId ya existen. No producción, Supabase, merge ni deploy. Protección Preview únicamente de la rama en vercel.json. Un único PR draft.

Verificación: tests locales ficticios en todos los estados; comprado/vendido, gastos/ajustes positivos y negativos, Caja/métricas/reportes, permisos y tenant, compartidos/inconsistencias, eliminación doble y carrera edición/venta, rollback. Frontend permisos/responsive/detalles/confirmación y errores; captura desktop/mobile en harness React con API simulada. Typecheck/build ambos, regresiones del módulo/Caja/permisos y revisión independiente antes de commit/push.
