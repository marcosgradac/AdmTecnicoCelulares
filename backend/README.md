# CelluFix Backend

API de CelluFix con Node.js, Express, TypeScript, Prisma y PostgreSQL.

## Configuración

Copiar `.env.example` a `.env` y definir valores locales. No versionar `.env`.

```env
DATABASE_URL="postgresql://usuario:clave@localhost:5432/cellufix?schema=public"
SQLITE_DATABASE_URL="file:../dev.db"
JWT_SECRET="una-clave-larga-y-aleatoria"
AUTH_RATE_LIMIT_WINDOW_MS=900000
AUTH_RATE_LIMIT_MAX=10
```

Los importes permanecen como enteros y los IDs como `String/cuid`, igual que en
SQLite. PostgreSQL usa enums nativos y `TIMESTAMP(3)`.

## Comandos de base

```bash
npm run db:generate
npm run db:migrate:dev
npm run db:migrate:deploy
npm run db:studio
```

Para desarrollo local en Windows se puede iniciar el PostgreSQL portable
incluido como dependencia de desarrollo:

```bash
npm run db:postgres:start
```

Usa por defecto `localhost:55432`, almacena el clúster en `.postgres-data/` y
crea la base `cellufix` con codificación UTF-8. Estos valores se pueden cambiar
con `POSTGRES_DEV_PORT`, `POSTGRES_DEV_DATA_DIR`, `POSTGRES_DEV_USER`,
`POSTGRES_DEV_PASSWORD` y `POSTGRES_DEV_DATABASE`.

## Migración desde SQLite

La fuente histórica se conserva en `prisma/dev.db`; sus migraciones están
archivadas en `prisma/migrations-sqlite/`. El baseline compatible con
PostgreSQL está en `prisma/migrations/`.

Procedimiento:

1. Detener la API para obtener una copia consistente de SQLite.
2. Copiar `prisma/dev.db` a `backups/dev-before-postgres-AAAAMMDD-HHMMSS.db`.
3. Configurar `DATABASE_URL` para PostgreSQL y `SQLITE_DATABASE_URL` para la
   fuente SQLite.
4. Validar relaciones y totales sin escribir:

   ```bash
   npm run migrate:postgres:dry-run
   ```

5. Crear las tablas e importar:

   ```bash
   npm run db:migrate:deploy
   npm run migrate:postgres
   ```

El importador:

- valida referencias huérfanas antes de escribir;
- importa en orden Business, User, Client, Repair, StockItem, Payment,
  CashMovement y RepairPart;
- preserva IDs, hashes, tokens, fechas, estados e importes;
- ejecuta todos los `upsert` en una transacción;
- es idempotente por ID;
- compara conteos y totales por negocio al finalizar.

Si la validación falla, no se inicia la importación. Si falla una escritura, la
transacción PostgreSQL se revierte.

## Rollback

SQLite no se elimina ni se modifica durante la importación. Para volver
temporalmente:

1. detener la API;
2. restaurar el proveedor SQLite usando `prisma/sqlite/schema.prisma`;
3. apuntar `DATABASE_URL` a una copia verificada de `prisma/dev.db`;
4. regenerar el cliente Prisma;
5. conservar PostgreSQL intacto hasta completar la investigación.

No ejecutar `prisma migrate reset` sobre datos que deban conservarse.

## Ejecución y build

```bash
npm run dev
npm run build
npm start
```

API: `http://localhost:3000`.

## Autenticación y perfil

- `POST /api/auth/register`: crea Business y User en una transacción.
- `POST /api/auth/login`: acceso exclusivamente con email y contraseña.
- `GET /api/auth/me`: restaura la sesión.
- `GET /api/profile`: devuelve el perfil autenticado.
- `PATCH /api/profile`: actualiza nombre, apellido y teléfono.

Login y registro tienen rate limiting configurable. Los usuarios históricos
pueden iniciar sesión y reciben `profileComplete: false` hasta completar nombre
y apellido. Las respuestas públicas nunca incluyen `passwordHash`.

## Equipo y roles

- `OWNER` (Propietario): administración completa del negocio y del Equipo.
- `TECHNICIAN` (Técnico): reparaciones, clientes, consulta de stock, repuestos
  utilizados y perfil propio.

| Función | OWNER | TECHNICIAN |
|---|---:|---:|
| Reparaciones y clientes | Sí | Sí |
| Consultar stock | Sí | Sí |
| Crear/desactivar stock y editar costes | Sí | No |
| Pagos y caja | Sí | No |
| Reportes financieros | Sí | No |
| Administrar Equipo | Sí | No |

Endpoints privados de Equipo, todos exclusivos para `OWNER`:

- `GET /api/team`
- `POST /api/team`
- `GET /api/team/:id`
- `PATCH /api/team/:id`
- `POST /api/team/:id/reset-password`

Los usuarios no se borran físicamente: se desactivan mediante `isActive`. El
backend impide desactivar al usuario autenticado y garantiza dentro de una
transacción que cada negocio conserve al menos un propietario activo.

Desde la interfaz, un propietario puede abrir **Equipo → Agregar usuario**,
crear un técnico con contraseña temporal y luego editarlo, desactivarlo,
reactivarlo o restablecer su contraseña.

Las pruebas requieren una base PostgreSQL aislada y la API apuntando a ella:

```bash
node tests/team-permissions.mjs
node tests/postgres-api.mjs
node tests/auth-profile.mjs
```
