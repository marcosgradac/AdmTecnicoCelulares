# Despliegue de CelluFix

CelluFix es un monorepo. Railway debe trabajar desde `backend/` y Vercel desde `frontend/`. La base de producción empieza vacía; las migraciones crean el esquema y la primera cuenta se crea desde `/registro`.

## Railway: PostgreSQL y backend

1. Crear un proyecto en Railway y conectarlo con este repositorio de GitHub.
2. Crear un servicio PostgreSQL dentro del proyecto.
3. Crear el servicio del backend desde el repositorio y establecer **Root Directory** en `backend`.
4. Referenciar la variable `DATABASE_URL` del servicio PostgreSQL en el backend. No copiarla al repositorio.
5. Configurar las variables del backend:

   ```env
   NODE_ENV=production
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   JWT_SECRET=<secreto-aleatorio-largo>
   JWT_EXPIRES_IN=8h
   FRONTEND_URL=https://URL-DE-VERCEL
   CORS_ORIGINS=https://URL-DE-VERCEL
   ```

   Railway proporciona `PORT`; no se debe fijar manualmente. También pueden configurarse los límites documentados en `backend/.env.example`.

6. Verificar la configuración tomada de `backend/railway.json`:

   - Build Command: `npm ci && npm run build`
   - Pre-deploy Command: `npm run migrate:deploy`
   - Start Command: `npm run start`
   - Healthcheck Path: `/health`

7. Generar el dominio público del backend.
8. Abrir `https://URL-DE-RAILWAY/health`. Debe responder HTTP 200 con `"status":"ok"`; el endpoint comprueba también la conexión a PostgreSQL.

Las migraciones se ejecutan con `prisma migrate deploy`. No usar `prisma migrate dev`, `prisma migrate reset` ni ejecutar la carga demo como parte del despliegue.

## Vercel: frontend

1. Importar el mismo repositorio en Vercel.
2. Establecer **Root Directory** en `frontend`.
3. Elegir **Framework Preset: Vite**.
4. Configurar:

   - Build Command: `npm run build`
   - Output Directory: `dist`

5. Agregar la variable de build:

   ```env
   VITE_API_URL=https://URL-DE-RAILWAY/api
   ```

6. Desplegar y copiar la URL definitiva de Vercel.
7. Volver a Railway, configurar `FRONTEND_URL` y `CORS_ORIGINS` con esa URL exacta (sin `/` final) y volver a desplegar el backend.

`frontend/vercel.json` redirige las rutas de la SPA a `index.html`, por lo que recargar `/login`, `/dashboard`, `/reparaciones/:id` o `/seguimiento/:token` no debe producir un 404.

## Base vacía y datos demo

- Producción puede iniciar vacía y crear la primera cuenta desde `/registro`.
- `npm run demo:load` nunca se ejecuta automáticamente.
- Para cargar datos manualmente se requiere `DEMO_USER_EMAIL` y una cuenta existente.
- En producción también se requiere la confirmación explícita `DEMO_ALLOW_PRODUCTION=true` durante esa ejecución. Quitarla al terminar.
- El script es idempotente para los datos que marca como demo.

## Correo de restablecimiento

El modo `MAIL_MODE=console` sirve solamente para desarrollo y no expone el enlace ni el token en logs de producción. Antes de ofrecer restablecimiento de contraseña en producción se debe integrar un proveedor real de correo; no hay credenciales de correo incluidas en este repositorio.

## Validación posterior al despliegue

1. Comprobar `/health` en Railway.
2. Registrar una cuenta nueva y cerrar sesión.
3. Iniciar sesión y abrir el dashboard.
4. Crear un cliente y una reparación.
5. Registrar un pago y cambiar el estado de la reparación.
6. Generar/copiar el enlace de seguimiento.
7. Abrir el enlace en una sesión privada, sin autenticación.
8. Recargar directamente `/login`, `/dashboard`, `/reparaciones/:id` y `/seguimiento/:token`.
9. Revisar la consola del navegador y los logs de Railway, sin tokens, contraseñas ni URLs de base de datos.

## Validación local

Desde `backend/`:

```bash
npm ci
npm run prisma:generate
npx prisma validate
npm run typecheck
npm run build
npm run test:password-reset
```

Con PostgreSQL local disponible también se puede ejecutar `npx prisma migrate status`.

Desde `frontend/`:

```bash
npm ci
npm run build
npm run preview -- --host 0.0.0.0
```

El preview usa `frontend/.env` local o una variable `VITE_API_URL` proporcionada durante el build; ese archivo no se versiona.
