# Seguridad 4C: activación posterior de la API protegida

Base: `af36d16cfb133e34b297c9a3143f0bf101a912a7`. Esta rama prepara los dos
rewrites de Vercel a `https://api.tecnodeskpro.com`; no cambia variables ni
infraestructura. No crear/integrar el PR antes de la auditoría independiente.

## Qué está confirmado y qué está pendiente

El propietario confirmó: custom domain verificado y certificado emitido en
Render, Cloudflare Proxied y Full (strict), health/readiness funcionando, WAF
contra escaneos activo, rate limiting edge guardado pero DESACTIVADO, onrender
habilitado. Estos datos son confirmaciones externas del propietario: no se
modificaron ni se comprobó la cadena de proxies real desde esta rama.

Comprobado en código/pruebas locales:

- Frontend: `VITE_API_URL` define Axios y assets. Login/registro conservan
  payloads y logos; forgot/reset password mantienen sus rutas; reparaciones
  y seguimiento conservan endpoint/token, JWT y X-Turnstile-Token. El hostname
  nuevo no requiere cambiar handlers ni lógica de negocio.
- Los dos rewrites conservan las condiciones de WhatsApp/Facebook, token,
  clientSlug y el fallback SPA. En navegador ambos enlaces siguen abriendo
  React. Los tokens modernos e históricos siguen llegando a tracking-preview.
- `PUBLIC_API_ORIGIN` define solamente imágenes RELATIVAS de Open Graph. No
  cambia el origen de enlaces públicos (www), logos externos, título, escape,
  fallback, vencimiento ni privacidad. Sin variable conserva el dominio Render.
- CORS acepta los orígenes de frontend permitidos y OPTIONS para Authorization
  y Content-Type. El preflight responde 204 sin entrar a los handlers. JWT
  ausente/inválido sigue rechazándose con 401. No se añadió confianza en
  cabeceras Cloudflare ni se modificó `trust proxy = 1`.
- Los enlaces de correo usan `FRONTEND_URL`, no VITE_API_URL ni PUBLIC_API_ORIGIN.
  Debe mantenerse apuntando al frontend actual. No cambiar correo, claves
  Turnstile, JWT, URLs de base de datos ni credenciales de ningún proveedor.

Las pruebas usan Axios/transporte simulado, VM y HTTP loopback con Prisma
simulado. No prueban usuarios/DB reales, correo enviado, challenges reales,
Vercel rewrites desplegados ni identificación de IP en Render. Eso requiere
validación de bajo volumen en staging/entornos expresamente autorizados.

## Orden exacto de activación: acciones futuras, requieren aprobación

1. **Antes del PR/merge:** auditar este diff. Confirmar acceso a reversión de
   variables y conservar el frontend/deploy anterior y onrender operativo.
   Verificar en staging o comprobaciones puntuales autorizadas TLS, CORS desde
   `https://www.tecnodeskpro.com`, OPTIONS con Authorization/Content-Type y
   X-Turnstile-Token, health, logos y previews. No hacer carga, no escribir
   reparaciones ni cuentas reales para comprobar la migración.
2. **Validar IP antes de enrutar usuarios:** comprobar desde dos IPs reales e
   IPv6 que Render identifica clientes diferentes y sanea X-Forwarded-For.
   Cloudflare puede cambiar la cadena de proxies. Si aparece una IP de proxy
   compartida o un cliente controla su IP efectiva, detener activación; no
   aumentar hops ni aceptar CF-Connecting-IP a ciegas. Registrar solo datos
   mínimos necesarios sin tokens, cookies, JWT ni información de clientes.
3. **Preparar frontend sin activarlo aún:** en Vercel, proyecto correcto,
   Settings > Environment Variables, Production, establecer
   `VITE_API_URL=https://api.tecnodeskpro.com` con aprobación. No agregar `/api`
   (aunque ambos formatos están cubiertos). No cambiar Preview/Development
   automáticamente. Los deployments actuales no cambian: la variable se
   incorpora al SIGUIENTE build. No iniciar un deploy manual. Evitar pushes o
   merges de otros cambios entre este ajuste y el merge aprobado.
4. **Actualizar Open Graph:** en Render, servicio `tecnodesk-api`, Environment,
   establecer `PUBLIC_API_ORIGIN=https://api.tecnodeskpro.com` con aprobación.
   Es configuración pública, no un secreto; no copiar exports de entorno ni
   abrir/imprimir otras variables. La API valida un origen HTTPS sin rutas,
   query, fragmento ni credenciales. Elegir **Save only** para dejarlo preparado
   sin iniciar un deploy manual; no usar Save, rebuild, and deploy ni Save,
   deploy en esta etapa. El proceso actual conservará su valor previo hasta
   el siguiente deployment aprobado. Si el panel no ofrece Save only, detenerse.
5. **Crear PR y exigir ambos CI verdes.** Solo con aprobación final, merge
   normal. El merge activa conjuntamente el próximo build de Vercel (variable
   y los dos rewrites) y el deployment automático Render (variable guardada).
   Hay una ventana no atómica: mientras Render termina, OG puede seguir
   apuntando logos a onrender, que debe permanecer activo. Confirmar que ambos
   despliegues corresponden al SHA exacto del merge y están READY/LIVE.
6. **Verificación posterior:** confirmar en el bundle/deployment Vercel el
   origen nuevo y en un preview de prueba `og:image` con api, salvo logo externo
   o fallback www. Comprobar ambos enlaces en navegador y crawler de prueba;
   revisar `no-store`/`noindex`, HTTPS y CORS. En staging probar login/registro,
   recuperación y reparaciones simuladas. En producción, solo lecturas
   puntuales autorizadas; no POSTs funcionales ni altas/pagos reales.
7. **Mantener controles:** conservar onrender, el WAF actual, rate limiting
   Cloudflare DESACTIVADO y límites backend existentes. No activar el límite
   edge ni un bloqueo de origen como parte de esta migración. Observar errores
   CORS/403/429, latencia y distribución de IP; luego cerrar esta etapa.

No activar solamente VITE_API_URL y olvidar los rewrites: el tráfico del navegador
y las previsualizaciones son caminos separados. Tampoco crear un rewrite global
para /api, alterar la redirección apex/www ni cambiar DNS para esta etapa.

Fuentes oficiales sobre cambios de variables:
[Vercel: cambios aplican a nuevos deployments](https://vercel.com/docs/environment-variables),
[Render: Save only y aplicación en el próximo deployment](https://render.com/docs/configure-environment-variables).

## CORS, Cloudflare y límites: riesgos pendientes

CORS debe mantener los orígenes de frontend actuales; no añadir api como si
fuera un origen de navegador ni usar wildcard. La autenticación usa Bearer JWT,
sin cookies cross-domain nuevas. Las cabeceras Authorization y X-Turnstile-Token
deben llegar sin cambios; las verificaciones Turnstile del backend permanecen.
Cloudflare no sustituye CORS, JWT ni Turnstile y un user-agent de WhatsApp es
falsificable. No agregar challenges HTML, Bot Fight Mode ni Under Attack Mode
a las rutas de API, preflight, previews, logos o health.

La identidad IP sigue siendo el principal gate pendiente: las pruebas locales
verifican la interpretación configurada, no la cadena Render/Cloudflare real.
IPv6 usa ipKeyGenerator; no se introduce un parser propio. Vercel rewrites,
crawlers y usuarios NAT pueden compartir IP y presupuestos backend. No enviar
cabeceras desde frontend para forzar una IP distinta. Si falla identificación,
revertir destinos y preparar otra PR de confianza de proxies con evidencia.

No forzar caché en API, previews, auth o readiness. Conservar no-store de los
previews y comprobar que reglas heredadas no lo anulen. `/health` sigue sin DB;
el frontend usa `/api/health` con timeout y límite independiente. La migración
no aumenta esos presupuestos ni cambia el monitoreo Render.

onrender público aún permite eludir el WAF de nuestra zona. Migrar el tráfico
legítimo no cierra ese bypass; no se implementa secreto de origen ni se
deshabilita el hostname anterior. Los callbacks de Mercado Pago y otras
integraciones externas no se cambian: inventariar sus destinos antes de una
futura fase de bloqueo, sin acceder a secretos ni generar pagos reales.

## Reversión autorizada

Si falla antes del merge, restaurar/eliminar SOLO las dos variables preparadas
según su estado anterior y conservar main actual. No dejar una variable nueva
pendiente para un próximo build ajeno a esta migración.

Si falla después de activación:

1. Con aprobación, devolver VITE_API_URL a su valor previo de onrender en
   Production de Vercel, y PUBLIC_API_ORIGIN al valor previo o eliminarla
   (default onrender) en Render con Save only. Conservar ambos dominios.
2. Crear PR de reversión de SOLO las dos destinations de frontend/vercel.json
   a `https://tecnodesk-api.onrender.com`, conservar UA/slug/token/SPA. El
   generador offline `node scripts/prepare-api-domain.mjs https://tecnodesk-api.onrender.com`
   muestra el candidato sin modificar archivos. Ajustar las expectativas de
   tests de destinos para esa PR; conservar las pruebas de ambos dominios.
3. Aprobar CI y merge de reversión; dejar que los deploys automáticos incorporen
   destinos y variables previos. Verificar SHA y estados. No hacer deploy manual.
4. Si no es posible restaurar mediante este mecanismo con la rapidez requerida,
   pedir aprobación específica para una reversión de deployment desde el panel;
   esta rama no autoriza una operación manual de producción.

No regenerar tokens, borrar dominios, cambiar nameservers, desactivar WAF ni
activar rate limiting para intentar arreglar una falla funcional. WhatsApp
puede mantener una preview previa cacheada por su propio crawler: comparar
HTML actual usando fixtures autorizados, sin crear tokens nuevos en producción.

## Comandos locales ejecutables

Backend: `npm run typecheck`, `npm run build`, `npm run test:public-api-origin`,
`npm run test:tracking-preview`, `npm run test:tracking-preview-rate-limit`,
`npm run test:health-checks`, y
`node node_modules/tsx/dist/cli.mjs tests/tracking-links-unit.ts`.

Frontend: `npm run test:api-domain-prep`, `npm run typecheck`, `npm run build`
con VITE_API_URL nuevo SOLO en el proceso local, `npm run test:pwa`,
`npm run test:repair-flow`, `npm run test:repair-edit`, `npm run test:encoding`.
La nueva cobertura se ejecuta en los jobs CI existentes; no requiere nuevas
dependencias, servicios, secretos ni modificaciones del workflow.
