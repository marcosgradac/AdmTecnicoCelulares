# Seguridad 5: aislamiento entre talleres

Base auditada: `main` `8fb08df044bb3ef81bf5b57d6aad22fb4c7d946c`. Alcance: backend HTTP, servicios Prisma, helpers, transacciones y scripts administrativos. Sin consultas ni modificaciones productivas.

## Resultado

No se demostró un IDOR/BOLA entre talleres mediante las rutas vigentes. Por ello este PR incorpora evidencia de aislamiento y ejecución en CI; **no modifica código productivo ni inventa correcciones**.

El contexto de `authenticate` se reconstruye desde el usuario de base de datos y compara su negocio con el JWT. Roles/permisos enviados en el JWT no conceden autoridad adicional. Ningún endpoint privado auditado acepta una transferencia de propiedad del registro entre negocios.

## Cobertura

| Área | Protección verificada |
|---|---|
| Clientes | Lectura, edición, eliminación lógica, opciones, búsquedas, conteos y relaciones; creación usa el negocio autenticado. |
| Reparaciones | Detalle, listados, edición normal/legacy, cliente relacionado, estados y rutas legacy, entrega/corrección, historial, pagos, adelantos, costo inicial, cancelación/devolución y cobro de revisión. |
| Caja | Listado, agrupación por reparación, movimientos manuales y sumas por negocio. Campos de vínculo arbitrarios no se aceptan en cargas manuales. |
| Comercio | Categorías/productos, actualización de stock, ventas y líneas, idempotencia por negocio, cancelación/restitución de stock, movimientos y agregaciones. Todos los productos de una venta deben pertenecer al negocio antes de escribir. |
| Equipos | Inventario, edición/versionado, venta, egresos asociados y resúmenes. Claims de versión incluyen el negocio. |
| Garantías | Reparación y reclamo propios, costos/gastos, entrega y actualización; bloqueo de reparación dentro de la transacción y rollback. |
| Equipo/cuentas | Lectura, edición, baja y reseteo de contraseña de empleado ajeno rechazados. Perfil/configuración obtienen el sujeto del contexto. Eliminación de cuenta verifica nuevamente propietario/negocio dentro de transacción serializable. |
| Dashboard/reportes | Consultas Prisma y SQL crudo parametrizadas por negocio, conteos, saldos, series y relaciones. |
| Configuración/archivos | Logo privado se escribe exclusivamente sobre el negocio autenticado; la imagen pública es una excepción explícita que devuelve solamente bytes de imagen. Fotos de reparación no tienen endpoint independiente de carga/lectura por ID: el detalle privado está protegido y tracking no las proyecta. |
| Facturación | Suscripción, uso, pago informado y listado usan el negocio autenticado. No acepta `subscriptionId` ajeno. Planes/datos de transferencia son configuración compartida explícita. |
| Tracking público | Lookup exclusivamente por token; proyección limitada, notas/fotos privadas excluidas, parámetros de negocio/ID/slug no cambian el objeto consultado; tokens deshabilitados/vencidos no devuelven datos. |
| Super Admin | Router completo exige el rol recuperado de BD; autorización global funciona allí. Ese rol no concede lectura/cobro de registros ajenos en rutas ordinarias. Notas anidadas verifican negocio y autor. |
| Helpers/transacciones | Numeración/cuotas bloquean el negocio propio; correcciones financieras verifican reparación/caja propia; estados usan compare-and-swap con negocio. Servicios reciben el contexto derivado por la ruta. |
| Scripts/modelos históricos | Importador valida negocio de cliente/reparación/pago/repuesto; demos usan un negocio dedicado y bloqueos; scripts no se exponen por HTTP. Stock/Device/InventoryMovement históricos no tienen rutas activas independientes; no se reintroducen. |

La nueva prueba usa Taller A, Taller B y un negocio independiente de Super Admin, en PostgreSQL real desechable. Incluye controles positivos sobre registros propios y personal autorizado, ataques en ambos sentidos, IDs extranjeros versus inexistentes con respuestas iguales, relaciones mezcladas, claims falsos, búsquedas vacías, sumas literales, ataques concurrentes y un cobro legítimo concurrente. Compara filas completas de ambos talleres antes/después de todos los rechazos, incluyendo caja, pagos, stock, historia, suscripciones y equipo.

Los tests existentes complementan cobertura de operaciones propias, cancelaciones, devoluciones, garantías, permisos financieros, carreras de estado/stock/cuotas, borrado de cuenta y rollback ante fallo de transacción.

## Riesgos y límites no resueltos

- Varias relaciones históricas usan FK por ID sin exigir igualdad de `businessId` en la base. Las APIs vigentes revisadas no permiten crear esos vínculos cruzados, pero inserciones administrativas/importaciones futuras defectuosas podrían romper esa premisa y exponer datos mediante relaciones anidadas. No se inspeccionaron datos reales ni se certifica que no exista corrupción histórica. Refuerzo con FK compuestas o validación sistemática de datos requiere una etapa autorizada de migración; no se implementa silenciosamente.
- Algunas escrituras usan un ID obtenido después de una lectura autorizada. La propiedad no es mutable por las APIs actuales; cualquier función futura de transferencia entre talleres debe revalidar escrituras y relaciones dentro de la transacción.
- Los tokens públicos son credenciales de acceso limitado: quien posee un token válido puede ver su proyección pública. Las imágenes de logo son públicas por diseño. No se cambia ese contrato.
- No se demuestra seguridad de acceso directo con credenciales de base de datos privilegiadas ni de futuros endpoints. Se conserva la suite existente de ACL de roles públicos y el inventario de rutas.

## Reproducción y validación

`cd backend && npm run test:tenant-isolation-complete` crea su propio PostgreSQL en loopback, aplica las migraciones existentes a esa base, arranca HTTP local, ejecuta la matriz y elimina el clúster temporal. Ignora `DATABASE_URL` configurado y evita cargar `.env`. No requiere credenciales ni servicios externos. CI ejecuta la misma prueba en Backend CI usando la dependencia existente `embedded-postgres`.

Para una base ficticia local ya migrada que termine en `_test`: `node node_modules/tsx/dist/cli.mjs tests/tenant-isolation-complete.ts` con `DATABASE_URL` local y `DOTENV_CONFIG_PATH` inexistente. La prueba rechaza hosts remotos antes de importar Prisma/app.

Validación local: **355 comprobaciones HTTP** de la matriz nueva pasaron, incluida ejecución autónoma del runner; typecheck de esa prueba, typecheck y build del backend pasaron. Se ejecutaron **79 combinaciones de tests/modos** del backend: 78 pasaron en la primera matriz; el único fallo fue una aserción preexistente que asumía cuál de dos cancelaciones concurrentes ganaría. Se corrigió solamente esa aserción (exige exactamente 200/409 y una devolución coherente con la solicitud ganadora) y su reejecución pasó. Se repitió además `npm test`, incluyendo preservación exacta del inventario/orden de rutas y protecciones existentes.

La revisión independiente pidió reforzar los snapshots del cobro propio concurrente y rechazos posteriores: la prueba final compara toda la base de fixtures admitiendo solamente el pago legítimo, su caja vinculada y el cambio de saldo/timestamp esperado. Se documenta esta cobertura sin equipararla a una certificación de datos históricos reales.

CI: Backend CI y Frontend CI se verifican en el SHA publicado del PR; el nuevo paso PostgreSQL está dentro del job existente. Origin Auth/CORS/JWT/Turnstile/limitadores/health, contratos y orden de rutas se mantienen sin cambios productivos. No se fusiona ni despliega este PR.
