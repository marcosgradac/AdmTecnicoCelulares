# SUPER_ADMIN y datos demo de TecnoDesk

Estado de esta preparación: sin ejecución en producción, sin cambios en credenciales,
autenticación, permisos, migraciones ni suscripciones.

## Rol de plataforma

`User.platformRole` es independiente de `User.role` (OWNER/TECHNICIAN).
`bootstrap:admin` normaliza `SUPER_ADMIN_EMAIL`, exige que la cuenta exista y modifica
solo `platformRole` y `tokenVersion` (+1 cuando promueve). Prisma actualiza también
`updatedAt`. Si ya es SUPER_ADMIN, no hace cambios. No registra cuentas ni cambia
contraseñas, negocios o suscripciones.

`SUPER_ADMIN_EMAIL` se usa únicamente en el bootstrap: no promueve usuarios al
registrarse o iniciar sesión. El middleware consulta el usuario en la base y valida
`tokenVersion` e `isActive` en cada solicitud. Las sesiones anteriores quedan
invalidadas tras una promoción. `/api/platform-admin` exige SUPER_ADMIN; el frontend
protege `/platform-admin` con ese mismo rol y lo usa como destino después del login.
Ser SUPER_ADMIN no reemplaza los permisos de taller basados en `User.role`.

En la revisión inicial, `marcosgradac2023@gmail.com` no existía. Después de que el
usuario la registró, se verificó su existencia en PostgreSQL local y se ejecutó
el bootstrap existente: quedó SUPER_ADMIN con `tokenVersion=1` (antes 0).
No se modificaron contraseña, datos personales, negocio ni suscripción.
El otro SUPER_ADMIN, `marcosgradac1999@gmail.com`, quedó sin modificaciones.
Se cargó el perfil full en el negocio de la cuenta solicitada: 18 clientes,
25 equipos y 31 reparaciones, números 1001–1031. La segunda ejecución devolvió
`existing`, sin cambios en registros ni contador. Producción sigue pendiente.

## Qué corrige el loader

Se reutiliza `backend/src/scripts/load-business-demo.ts` y `npm run demo:load`.
El loader anterior generaba una CANCELLED sin settlement, entregadas sin pagos
completos, movimientos con origen GENERAL, algunos equipos cuyo propietario no
coincidía con el cliente de la reparación, e historiales cuyo último estado no
coincidía con CANCELLED/WARRANTY. El chequeo de idempotencia estaba fuera de la
transacción y podía duplicar el demo con dos ejecuciones simultáneas.

El nuevo loader mantiene el correlativo persistente mediante `allocateRepairNumber`,
crea ingresos únicamente por pagos registrados y egresos únicamente por devoluciones.
`Repair.paid` conserva los pagos previos a cancelar; los cobros posteriores usan
`Payment.cancellationReview=true` y `Repair.cancellationReviewPaid`.
No se cambian los endpoints financieros de la aplicación.

| Perfil | Clientes | Equipos | Reparaciones normales | Canceladas | Total reparaciones |
| --- | ---: | ---: | ---: | ---: | ---: |
| `full` (local por defecto) | 18 | 25 | 25 | 6 | 31 |
| `small` (producción por defecto) | 6 | 8 | 6 | 6 | 12 |

Full: 2 RECEIVED, 3 REVIEW, 2 BUDGET, 2 APPROVED, 2 WAITING_PART, 4 REPAIRING,
3 TESTING, 3 READY, 3 DELIVERED, 1 WARRANTY y 6 CANCELLED.
Small: 1 RECEIVED, 1 REVIEW, 1 REPAIRING, 1 READY, 1 DELIVERED, 1 WARRANTY y 6 CANCELLED.
Incluyen importes sin pagar, pagos parciales, pagos completos, los cuatro medios de
pago y el historial hasta el estado actual. Cada perfil incluye un reclamo de garantía.
Full habilita 21 links de seguimiento; small habilita 4. Canceladas/entregadas/garantía
no tienen seguimiento público habilitado. Los registros cuentan para el uso del negocio;
el loader no amplía planes ni límites de suscripción.

Cantidades verificadas por las pruebas: full genera 28 pagos, 30 movimientos de Caja
y 156 entradas de historial; small genera 12 pagos, 14 movimientos y 54 entradas.
Cada pago tiene un ingreso asociado y cada perfil tiene dos egresos por devolución.

Las seis cancelaciones, idénticas en ambos perfiles:

| Caso | Pago previo | Revisión | Devolución | Cobro posterior | Neto Caja | Pendiente revisión |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Devolución parcial | 40000 | 15000 | 25000 | 0 | 15000 | 0 |
| Revisión cubierta | 20000 | 20000 | 0 | 0 | 20000 | 0 |
| Revisión pendiente | 10000 | 20000 | 0 | 0 | 10000 | 10000 |
| Devolución total | 40000 | 0 | 40000 | 0 | 0 | 0 |
| Revisión cobrada después | 10000 | 20000 | 0 | 10000 | 20000 | 0 |
| Sin cobro ni devolución | 0 | 0 | 0 | 0 | 0 | 0 |

## Idempotencia, identificación y aislamiento

- Una sola transacción bloquea la fila Business (`SELECT ... FOR UPDATE`) antes del
  chequeo de existencia. Dos ejecuciones para el mismo negocio se serializan.
- El marcador `demo-cellufix-v2` queda en notas de clientes/reparaciones/pagos,
  descripciones de Caja/reclamo e historiales. Los clientes tienen sufijo `(DEMO)`;
  los equipos se identifican por su relación con esos clientes. Todos los datos son ficticios.
- Se comprueba el marcador en clientes, reparaciones y Caja del negocio indicado.
  Repetir no agrega registros ni consume números. Cambiar de perfil tampoco amplía
  un demo ya existente.
- Si hay `demo-cellufix-v1`, devuelve `legacy-existing` sin repararlo, borrarlo ni
  agregar otro dataset. Cualquier corrección de un demo antiguo requiere revisión aparte.
- Se exige un usuario OWNER activo y un negocio activo. El `businessId` proviene
  del usuario buscado por email; todos los registros y referencias se crean dentro
  de ese negocio. No se modifica ningún usuario, negocio ajeno o registro real.
- Un fallo revierte el dataset completo y el contador. No hay borrado de datos
  reales, migraciones ni cambios de configuración.
- Producción **o cualquier URL remota** requiere `DEMO_ALLOW_PRODUCTION=true`.
  No se debe guardar esa autorización de forma permanente.

## Local, cuando la cuenta ya exista

Desde `backend`, usando el `.env` local existente, sin editarlo:

```powershell
$env:SUPER_ADMIN_EMAIL = 'marcosgradac2023@gmail.com'
try {
  npm.cmd run bootstrap:admin
  if ($LASTEXITCODE -ne 0) { throw 'Bootstrap fallido: no continuar con el demo' }
} finally { Remove-Item Env:SUPER_ADMIN_EMAIL }
$env:DEMO_USER_EMAIL = 'marcosgradac2023@gmail.com'
$env:DEMO_PROFILE = 'full'
try { npm.cmd run demo:load } finally { Remove-Item Env:DEMO_USER_EMAIL; Remove-Item Env:DEMO_PROFILE }
```

No ejecutar hasta registrar la cuenta mediante el flujo normal. No sustituirla por
otra cuenta ni inventar una contraseña.

## Producción: procedimiento pendiente de aprobación

Usar la Shell del **servicio backend correcto de Render**, que ya tiene DATABASE_URL
configurada de forma privada. No llevarla a la máquina local ni imprimirla.
La disponibilidad de Shell depende del plan; un one-off job puede usar el artefacto
y las variables del servicio. No se creó ningún job ni se accedió a producción aquí.
Documentación: [Shell](https://render.com/docs/ssh),
[one-off jobs](https://render.com/docs/one-off-jobs).

Primero debe estar aprobado y disponible en el artefacto de Render el loader
corregido de esta rama. No ejecutar el loader antiguo de `main`. No publicar ni
desplegar esta rama sin autorización. El build habitual (`npm run build`) genera
`dist/scripts/*.js`; usar esos archivos evita depender de `tsx` en producción.

En la Shell (Linux), ubicarse en backend y comprobar el artefacto:

```sh
if [ -f backend/package.json ]; then cd backend; fi
test -f dist/scripts/bootstrap-super-admin.js || exit 1
test -f dist/scripts/load-business-demo.js || exit 1
grep -q 'demo-cellufix-v2' dist/scripts/load-business-demo.js || exit 1
```

Preflight **de solo lectura**, sin imprimir conexiones ni contraseñas:

```sh
node <<'NODE'
const { PrismaClient } = require('@prisma/client');
let p;
(async () => {
  try {
    const url = new URL(process.env.DATABASE_URL || '');
    const supabase = url.hostname.endsWith('.pooler.supabase.com') || url.hostname.endsWith('.supabase.co');
    if (!supabase || url.port !== '5432') throw new Error('Destino no validado');
    p = new PrismaClient();
    const user = await p.user.findUnique({ where: { email: 'marcosgradac2023@gmail.com' },
      select: { id: true, email: true, businessId: true, role: true, platformRole: true, tokenVersion: true, isActive: true, deletedAt: true } });
    if (!user || !user.isActive || user.deletedAt || user.role !== 'OWNER') throw new Error('Cuenta no válida');
    console.log(user);
    for (const marker of ['demo-cellufix-v1', 'demo-cellufix-v2']) {
      console.log(marker, await p.client.count({ where: { businessId: user.businessId, notes: { contains: marker } } }));
    }
  } catch { console.error('Preflight fallido. No ejecutar bootstrap ni demo.'); process.exitCode = 1; }
  finally { if (p) await p.$disconnect(); }
})();
NODE
```

Comprobar visualmente cuenta y businessId. Si falla, detenerse. Una vez aprobada la
escritura, ejecutar el bootstrap existente con variable limitada al comando:

```sh
SUPER_ADMIN_EMAIL=marcosgradac2023@gmail.com node dist/scripts/bootstrap-super-admin.js
```

Repetir el preflight para verificar `platformRole=SUPER_ADMIN` y `tokenVersion`:
debe aumentar en 1 si hubo promoción, o quedar igual si ya era SUPER_ADMIN.
Iniciar sesión nuevamente después de una promoción.

Solo después de confirmar el negocio y aprobar la carga, ejecutar:

```sh
NODE_ENV=production DEMO_ALLOW_PRODUCTION=true DEMO_PROFILE=small DEMO_USER_EMAIL=marcosgradac2023@gmail.com node dist/scripts/load-business-demo.js
```

Esperado: `mode=created`, 6 clientes, 8 equipos y 12 reparaciones. El JSON muestra
businessId y cantidades, no credenciales ni tokens de seguimiento. Repetir el mismo
comando devuelve `existing` sin modificar nada. `legacy-existing` exige detenerse
y revisar el demo previo, sin intentar borrarlo o forzar otra carga.

Local y Supabase usan el schema PostgreSQL; no se transfieren datos entre ambas
bases. El schema SQLite es una variante para pruebas, no el destino de estos scripts.
