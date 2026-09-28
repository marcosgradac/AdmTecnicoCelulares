# Dataset local para la landing

El perfil `DEMO_PROFILE=landing` de `backend/src/scripts/load-business-demo.ts`
crea la cuenta OWNER `landing-demo@local.test`, negocio **TecnoFix Demo**.
Los perfiles `small` y `full` conservan su comportamiento.

## Seguridad y repetición

Sólo admite PostgreSQL en `localhost`, `127.0.0.1` o `::1`. Rechaza
`NODE_ENV=production`, incluso con `DEMO_ALLOW_PRODUCTION`. No usar túneles
ni proxies hacia bases remotas. No llama a servicios de despliegue ni correo.
Los contactos son ficticios, con teléfonos no marcables y dominios reservados.

Toda la carga ocurre en una transacción, con un advisory lock que serializa
ejecuciones simultáneas incluso antes de crear la cuenta. El marker independiente
`demo-tecnodesk-landing-v1` identifica este dataset. Una segunda ejecución no
modifica datos, contraseña ni correlativos. Un negocio preexistente con datos
sin ese marker se rechaza. No elimina ni reemplaza otros demos.

Las fechas se calculan al crear el dataset y no se refrescan al repetirlo. Para
una demostración en otra fecha, usar otra base local vacía; no borrar datos para
forzar una recarga. Los servicios de negocio actuales abren sus propias
transacciones: el fixture usa escrituras históricas dentro de su única transacción
y verifica sus contratos contables con conciliaciones independientes y las APIs.

## Carga en PowerShell

Desde `backend`, con dependencias y una base PostgreSQL local preparada con las
migraciones existentes (no se agregan migraciones):

```powershell
$env:DOTENV_CONFIG_PATH = 'NUL'
$env:DATABASE_URL = 'postgresql://cellufix:cellufix-local-only@localhost:55441/tecnodesk_landing_demo?schema=public'
$env:NODE_ENV = 'test'
$env:DEMO_PROFILE = 'landing'
$landingSecret = Read-Host 'Contraseña local (12 caracteres mínimo, 72 bytes máximo)' -AsSecureString
$env:LANDING_DEMO_PASSWORD = [System.Net.NetworkCredential]::new('', $landingSecret).Password
try { npm run demo:load } finally { Remove-Item Env:LANDING_DEMO_PASSWORD }
```

La contraseña sólo se recibe por entorno; no hay contraseña por defecto y no se
imprime ni guarda en archivos. Se necesita únicamente al crear la cuenta.
La salida JSON incluye cantidades y la ruta pública de seguimiento recomendada.
Los técnicos son fixtures de visualización con secretos aleatorios desconocidos.

Para reiniciar el PostgreSQL embebido usado en la verificación, si está detenido,
ejecutar desde `backend` y mantener esa terminal abierta:

```powershell
$env:DOTENV_CONFIG_PATH = 'NUL'
$env:POSTGRES_DEV_DATA_DIR = Join-Path (Split-Path (Get-Location)) 'artifacts/landing-demo-postgres'
$env:POSTGRES_DEV_PORT = '55441'
$env:POSTGRES_DEV_DATABASE = 'tecnodesk_landing_demo'
npm run db:postgres:start
```

No iniciar una segunda instancia sobre el mismo directorio. Los datos locales
quedan bajo `artifacts/`, excluido de Git. Configurar el backend con esa misma
`DATABASE_URL`, `MAIL_MODE=fake` y un `JWT_SECRET` local por entorno. Configurar
el frontend con `VITE_API_URL` apuntando a la API local; no modificar `.env`.

## Contenido

| Entidad | Cantidad |
| --- | ---: |
| Clientes | 32 |
| Dispositivos | 40 |
| Reparaciones | 50, en los 11 estados |
| Pagos | 54 |
| Movimientos de caja | 100 |
| Garantías | 10 |
| Reclamos / gastos de garantía | 4 / 3 |
| Repuestos en stock | 18 |
| Categorías / productos de comercio | 5 / 28 |
| Ventas de comercio | 15 (14 vigentes, 1 cancelada) |
| Equipos de reventa | 12, tres por estado |
| Técnicos | 3, con permisos diferentes |

Incluye pagos parciales y completos, reintegros de cancelación, costos y ventas
de reventa, stock con consumos ordenados, garantías vigentes y vencidas, reclamos
en los cuatro estados y actividad en Hoy, 7 días, 30 días y Este mes.

## Verificación

Usar otra base local cuyo nombre termine en `_test`, preparada con el esquema
actual. La suite rechaza una cuenta landing preexistente y limpia sólo sus fixtures.

```powershell
$env:DOTENV_CONFIG_PATH = 'NUL'
$env:DATABASE_URL = 'postgresql://cellufix:cellufix-local-only@localhost:55441/tecnodesk_landing_test?schema=public'
$env:NODE_ENV = 'test'
npm run test:landing-demo
npm run test:business-demo
npm run typecheck
npm run build
```

La suite landing comprueba aislamiento de todas las tablas, concurrencia,
idempotencia, rollback provocado a mitad de carga, relaciones, privacidad,
historiales, stock, snapshots, conciliación de caja y las APIs reales de Dashboard
en los cuatro períodos, seguimiento y módulos. La regresión business-demo cubre
los perfiles anteriores.

Las ventas canceladas se conservan como historial pero no computan en los KPIs
comerciales: cantidad de ventas, ingresos y ganancia bruta. Dashboard y Comercio
consideran sólo ventas vigentes. Caja conserva el ingreso original y el egreso de
reversión. La suite compara los tres KPIs contra Prisma usando el rango devuelto
por Dashboard. No se modifica la UI ni se generan las 27 capturas finales.
