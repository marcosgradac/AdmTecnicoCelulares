# Seguridad 4: auditoría y preparación productiva

Fecha: 10 de octubre de 2026 (America/Buenos_Aires).

**Estado: preparación; NO-GO para activar producción.** El laboratorio ya fue
validado según el estado confirmado por el titular. Sus pruebas no se repitieron.
No se modificaron Backend 1, Cloudflare, DNS, variables productivas ni PR #7.
CLIENT_IP_MODE debe permanecer en baseline; los limitadores no cambian.

## Evidencia verificada

- Main remoto y backend desplegado: `2a20f9993918c1a0e99127a1aa2886e2a48d8667`.
- Backend 1: `tecnodesk-api`, servicio `srv-darkfll9fdbs739vq620`, workspace
  confirmado `tea-darkbh59fdbs739vc4mg`; deploy live
  `dep-db4ovrv40ujc73bqol90`. Autodeploy: commit en main. Subdominio Render:
  habilitado. `healthCheckPath` vacío: monitoreo TCP, sin ruta HTTP configurada.
- PR #7 abierto y sin fusionar, head `7e621c9c742480485afc547121a30444669c13c4`.
  Backend CI y Frontend CI del run `38013122494` terminaron con success.
- Vercel: equipo `creactivo`, proyecto `adm-tecnico-celulares-jj5l`,
  `prj_w2P30zOjHEGvb2zCmjTHhtBKVvv0`. Preview protegido por Vercel Authentication;
  no se desactivó esa protección. Acceso de auditoría mediante el conector
  autenticado, sin persistir ni publicar enlaces de bypass.
- Se leyó únicamente el valor público `VITE_API_URL` de Preview:
  `https://api.tecnodeskpro.com`. No se actualizó nuevamente la variable ni se
  recuperaron otras variables sensibles.
- Preview anterior `dpl_AXWDMs7LRLgLY6VuSDVeujDLixjH`, asset
  `/assets/index-2fxpQKqz.js`: contiene `https://tecnodesk-api.onrender.com`,
  no contiene el origen personalizado. Cambiar una variable no modifica bundles
  ya publicados.
- Se creó exclusivamente Preview desde el mismo head de PR #7:
  `dpl_5iF4mEqyRT3gCVc2kDrneR2KR3G4`, estado READY, target null (Preview),
  `https://adm-tecnico-celulares-jj5l-1j8wisk6y-creactivo.vercel.app`.
  Asset `/assets/index-BAiBuHCD.js`: contiene el origen personalizado y no la URL
  directa de Render. El alias de rama ahora corresponde al nuevo Preview.
- La API de creación rechazó inicialmente `target: preview` con HTTP 400, sin
  crear un deployment. Se corrigió según la documentación oficial: target omitido
  significa Preview. Se usó Git source con SHA fijado; no redeploy heredando las
  variables del deployment antiguo, ni target production, ni promoción.

### Pruebas HTTP reales de bajo volumen

Sin sesión, sin tokens reales de seguimiento, sin registro/login/reset enviado,
sin cambios de clientes ni datos. Solo GET y OPTIONS.

| Solicitud | Resultado |
| --- | --- |
| OPTIONS `/api/auth/login`, Origin `https://www.tecnodeskpro.com` | 204, ACAO exacto |
| Mismo preflight, Origin `https://tecnodeskpro.com` | 204, ACAO exacto |
| Mismo preflight, Origin `https://adm-tecnico-celulares-jj5l.vercel.app` | 204, ACAO exacto |
| Mismo preflight, alias de rama de PR #7 | 500, sin ACAO |
| Mismo preflight, URL inmutable del Preview anterior | 500, sin ACAO |
| Mismo preflight, URL inmutable del Preview nuevo | 500, sin ACAO |
| GET `/health` por API personalizada | 200, JSON |
| GET `/api/clients` y `/api/repairs` sin sesión | 401, sin consultar datos privados |
| GET `/api/tracking-preview/invalid-security-audit` | 200, HTML genérico |
| GET `/s/security-audit/invalid-security-audit` en www con UA WhatsApp / facebookexternalhit | 200, OG genérico; conserva slug/token |

Los preflights exitosos permiten `Authorization,Content-Type,X-Turnstile-Token`
y métodos GET,POST,PUT,PATCH,DELETE,OPTIONS. Vary incluye Origin y
Access-Control-Request-Headers. Esto acredita transporte/preflight; no acredita
un login, captcha real ni operación de escritura. El token malformado queda
descartado antes del lookup de seguimiento según el código auditado; no representa
un taller real. OG usa la imagen genérica `https://www.tecnodeskpro.com/tecnodesk-192.png`.

**Bloqueo confirmado:** la política CORS efectiva no permite las URLs Preview
probadas. El código usa una lista exacta de CORS_ORIGINS (prioritaria) o
CORS_ORIGIN, y propaga el rechazo como error. No se propone abrir `*.vercel.app`,
reflejar cualquier Origin ni eliminar CORS/Turnstile/Origin Auth.

## Consumidores y dependencias

| Consumidor | Revisión y requisito |
| --- | --- |
| Login y registro | `services/auth.ts` usa Axios central `/api/auth/*`; Turnstile en body; no credencial Origin Auth en frontend |
| Recuperación/reset de contraseña | Mismo Axios, `/auth/forgot-password` y `/auth/reset-password`; emails usan FRONTEND_URL; no se enviaron emails reales |
| Reparaciones y clientes | `services/repairs.ts` y `services/operations.ts` usan Axios central; JWT Authorization sigue siendo necesario |
| Seguimiento público | `/api/tracking/:token` usa la misma URL; X-Turnstile-Token cuando corresponde; no se consultaron tokens de clientes |
| WhatsApp/Facebook | Ambas reglas modernas `/s/:clientSlug/:token` y legacy `/seguimiento/:token` ya reescriben al dominio API personalizado; fallback SPA intacto |
| Open Graph | `tracking-preview.ts` utiliza PUBLIC_API_ORIGIN para imágenes relativas; URL absoluta almacenada conserva su origen |
| Logos de negocio | Logos data usan `/api/business-logo/:businessId`; frontend resuelve relativos contra API; Origin Auth cubre ese endpoint |
| PUBLIC_API_ORIGIN | Default del código todavía es Render directo. Valor productivo NO leído: el conector Render disponible no ofrece lectura de variables. Debe confirmarse de forma segura antes de activar |
| Health | `/health` liveness sin DB; `/api/health` readiness con DB por Cloudflare; Render debe usar GET `/health` |
| URLs onrender del repositorio | Fallback de public-api.ts, fixtures de tests y documentación/rollback. Rewrites actuales ya no usan Render directo |
| Servicios externos | No handlers de webhook encontrados en backend/src. No hay acceso verificado a configuración de monitores, callbacks o hostname allowlist de Turnstile. Ausencia en código no prueba ausencia externa |
| URLs almacenadas / clientes cacheados | No se inspeccionó la DB privada. Requieren comprobación autorizada sin exportar datos ni alterar registros; PUBLIC_API_ORIGIN no migra URLs absolutas ni bundles antiguos |

El inventario adjunto registra deployments históricos y evidencia de assets.
Se paginó hasta agotar el historial disponible: 148 deployments previos
(91 Preview y 57 Production), más el Preview nuevo autorizado. Se intentó
inspeccionar los 91 Preview históricos. Resultado: 75 Preview con Render directo
(61 por lectura del bundle y 14 por coincidencia de asset con un bundle leído),
10 entry bundles sin ninguno de los dos literales (API efectiva sin determinar)
y 6 accesos que devolvieron 302 sin poder verificar el bundle. El Preview nuevo
contiene únicamente el origen API personalizado entre los dos literales buscados.
Los 57 deployments Production se inventariaron solo por metadata; no se afirma
haber comprobado sus bundles ni retirado versiones antiguas o cachés de clientes.
El CSV lista URLs y SHAs por fila, sin credenciales ni datos de usuarios.

Una coincidencia de nombre/hash de asset con un bundle leído es una inferencia
indicada expresamente; no se afirma haber descargado ese bundle en cada dominio.
Un 302, un error del conector o la ausencia de los dos literales buscados no se
consideran prueba de migración. Tampoco se eliminaron deployments históricos.

## Auditoría de PR #7 y verificación

El middleware es el primero en Express, antes de CORS, parsing, identidad IP,
limitadores y DB. Exige exactamente una cabecera raw (case insensitive), valor
de 64 hexadecimales minúsculos y comparación timingSafeEqual de longitud fija.
Ausencia, incorrectos, duplicados, arrays y listas separadas por coma dan 403
genérico con no-store/noindex. Configuración inválida falla antes de escuchar.
Desactivado o ausente mantiene el comportamiento anterior.

Excepción: método GET y req.path exactamente `/health`. Query no cambia req.path;
HEAD, OPTIONS, `/health/` y `/api/health` requieren la credencial. El header
privado es inyectado por Cloudflare, también en OPTIONS, imágenes y rewrites;
el navegador nunca debe conocerlo. No sustituye JWT, Turnstile ni permisos.
No se encontró una corrección necesaria en el middleware; no se cambió PR #7.

Validación local del head de PR #7:

- `npm test --prefix backend`: aprobado, incluyendo Origin Auth enabled,
  disabled y default, client-IP, password-reset aislado y preview fairness/baseline.
- Typecheck y build backend: aprobados. Typecheck frontend: aprobado.
- Build frontend con VITE_API_URL personalizada: aprobado; aviso existente de
  chunks mayores de 500 kB, no error.
- Health-checks, public-api-origin, tracking-preview, tracking-preview-rate-limit:
  aprobados con Prisma simulado, loopback y DOTENV_CONFIG_PATH inexistente.
- `test:api-domain-prep` frontend: aprobado; modernas/legacy/SPA/rollback offline.
- CI remoto del mismo head: ambos jobs success, incluidos tests frontend de
  reparaciones, cash, métricas, renovación, encoding, PWA y API domain.
- `git diff --check`: aprobado antes de preparar documentación.

Fallos iniciales del entorno local: tsx no pudo consultar usuario Windows
(`uv_os_get_passwd ENOMEM`) y esbuild no pudo resolver vite.config.ts por permisos
del sandbox. Ambos comandos pasaron fuera del sandbox con autorización automática.
Primeras consultas de red desde el sandbox dieron fetch failed; se repitieron
con acceso autorizado y se registran arriba solo respuestas reales.

## Procedimiento de activación (NO ejecutado; requiere autorización expresa)

1. **Resolver bloqueos y registrar rollback.** Confirmar nuevamente SHA de main,
   PR #7 y CI. Guardar IDs de deploy live y anterior, valores públicos previos,
   estado de reglas, TLS, dominios y subdominio Render en un registro seguro.
   Autodeploy está activo: fusionar PR #7 dispara producción. La aprobación del
   merge debe incluir expresamente ese despliegue, o una estrategia autorizada
   para controlar autodeploy; no tratar merge y despliegue como independientes.
2. **CORS de Preview.** Leer la lista efectiva sin mostrar secretos. Conservar
   todos los orígenes existentes y agregar exactamente
   `https://adm-tecnico-celulares-jj5l-git-codex-render-or-3f55d1-creactivo.vercel.app`.
   Agregar la URL inmutable del Preview nuevo solo si se necesita usarla directamente.
   Usar CORS_ORIGINS si ya existe: tiene prioridad sobre CORS_ORIGIN. No reemplazar
   la lista completa con los tres ejemplos probados. Comprobar OPTIONS 204,
   ACAO exacto y los tres headers; una URL Preview no aprobada debe seguir rechazada.
   Esta variable está en Backend 1: el cambio es productivo y no está autorizado.
   Verificar también hostnames autorizados de Turnstile sin cambiar controles.
3. **Credencial independiente.** Generar 32 bytes criptográficamente aleatorios,
   codificar 64 hexadecimales minúsculos en un gestor seguro. No reutilizar lab,
   no imprimir, no pasar por CLI args, VITE_, Git, logs ni este chat. Guardar en
   Render como ORIGIN_AUTH_SECRET y en la regla restringida de Cloudflare. No se
   generó ni solicitó una credencial en esta auditoría.
4. **Preparar Cloudflare.** Request Header Transform Rule con expresión exacta
   `(http.host eq "api.tecnodeskpro.com")`. Set static / overwrite de
   `X-TecnoDesk-Origin-Auth`, nunca append, para todos los paths y métodos,
   incluidas OPTIONS y GET de imágenes. Verificar cuota del plan actual y orden
   de reglas; ninguna regla posterior debe reemplazarlo. Mantener TLS Full
   (strict), WAF, Authorization y X-Turnstile-Token. No exponer header en respuesta,
   no exenciones por UA y no cambios de DNS ni servicios pagos.
5. **Consumidores e imágenes.** Confirmar PUBLIC_API_ORIGIN personalizada mediante
   una lectura segura. Si falta o difiere, aprobar su cambio a
   `https://api.tecnodeskpro.com`. Confirmar monitores/callbacks/scripts y URLs
   absolutas de logos. Migrar o retirar de forma autorizada consumidores antiguos;
   conservar evidencia y referencias de rollback. No permitir Render directo
   como fallback del nuevo frontend ni repartir la credencial a clientes.
6. **Health productivo.** Aprobar `healthCheckPath=/health` en Render y comprobar
   su GET 200 real. Usar `/api/health` exclusivamente por Cloudflare para readiness;
   no configurar readiness protegida como probe directo de Render. /health no
   comprueba DB: ambos controles tienen finalidades distintas. Confirmar que el
   monitoreo de Render pasa antes y después del despliegue y del cierre de hostname.
7. **Integrar PR #7 inicialmente desactivado.** Con aprobación de merge y despliegue,
   verificar SHA exacto del PR y CI; integrar y observar autodeploy con
   ORIGIN_AUTH_ENABLED=false o ausente. Mantener CLIENT_IP_MODE=baseline y
   limitadores. Confirmar arranque, health, CORS y rutas existentes. La presencia
   del header de Cloudflare debe ser compatible mientras el gate está desactivado.
8. **Activar Origin Auth.** Solo tras acreditar regla, credencial, consumidores,
   health y reversión, aprobar ORIGIN_AUTH_ENABLED=true y despliegue compatible.
   No quitar la cabecera durante el rollout. Confirmar deploy live y salud; error
   de configuración debe impedir el arranque, no degradar a acceso sin protección.
9. **Validar servicios antes de cerrar Render.** API personalizada: liveness 200,
   readiness 200, preflight autorizado 204, recursos sin JWT 401, metadata genérica
   200. Origen directo: endpoint protegido 403 sin/wrong/duplicada credencial;
   GET /health es la excepción prevista. Comprobar overwriting del header con
   candidato incorrecto por Cloudflare sin mostrar valores. Para logo/OG de un
   taller válido y flujos completos de auth usar una cuenta/fixture expresamente
   autorizada, sin escrituras reales por defecto. No reutilizar datos de clientes.
10. **Cerrar subdominio Render al final.** Solo después de resolver inventario de
    consumidores y confirmar domain/certificado/rollback, aprobar
    renderSubdomainPolicy=disabled de Backend 1. Render directo debe responder
    404 de plataforma y la API personalizada seguir funcionando con CORS,
    readiness, imágenes y health de Render. Conservar el CNAME requerido por
    Render; no eliminar DNS por el hecho de deshabilitar el hostname HTTP.

## Rollback ante cualquier error

- Interrumpir activación/cierre ante 5xx, pérdida de CORS, OG/imágenes, readiness,
  health de Render o arranque. Registrar solo estados HTTP y IDs de despliegue,
  sin datos ni credenciales. No continuar al siguiente paso con controles fallidos.
- Si el hostname ya se cerró y se necesita restaurar consumidores, reactivar
  primero renderSubdomainPolicy=enabled con autorización. Aún puede responder 403
  porque el gate sigue activo: reabrir hostname no desactiva Origin Auth.
- Restaurar ORIGIN_AUTH_ENABLED=false con código compatible y esperar deploy
  live/health. Si falló el arranque, recuperar el último deploy conocido y revisar
  la configuración en el gestor seguro. Nunca copiar secretos a reportes.
- Mantener el header inyectado por Cloudflare hasta verificar que el backend dejó
  de exigirlo. Luego restaurar regla/variables públicas/consumidores según los
  valores previos solo donde sea necesario y con aprobación. No devolver clientes
  a Render directo mientras ese origen siga cerrado o exija la credencial.
- Repetir los controles mínimos por ambos caminos y monitoreo; dejar constancia
  de que la protección se encuentra desactivada. No afirmar que un rollback a
  código anterior sigue protegiendo el origen. Rotación requiere otro plan: PR #7
  acepta una credencial, no un período de convivencia de dos credenciales.

## Autorización requerida para el siguiente paso

Primero, autorizar un cambio acotado de CORS en Backend 1 para el alias Preview
exacto, conservando orígenes actuales y comprobando OPTIONS; confirmar en una
lectura segura PUBLIC_API_ORIGIN y la allowlist de Turnstile. Sigue prohibida
la activación productiva. Después de resolver bloqueos, otra autorización debe
abarcar credencial/regla productiva, health HTTP, merge de PR #7 con autodeploy,
activación y validación. El cierre de onrender debe aprobarse al final según
evidencia de consumidores. Este documento no concede esas autorizaciones.

## Fuentes y enlaces

- [PR #7](https://github.com/marcosgradac/AdmTecnicoCelulares/pull/7)
- [CI auditado](https://github.com/marcosgradac/AdmTecnicoCelulares/actions/runs/38013122494)
- [Preview nuevo](https://adm-tecnico-celulares-jj5l-1j8wisk6y-creactivo.vercel.app)
- [Render health checks](https://render.com/docs/health-checks)
- [Render: cierre de subdominio](https://render.com/docs/custom-domains#disabling-your-onrendercom-subdomain)
- [Cloudflare Request Header Transform Rules](https://developers.cloudflare.com/rules/transform/request-header-modification/)
- [Vercel: creación de deployment y target Preview](https://vercel.com/docs/rest-api/deployments/create-a-new-deployment)

La documentación antigua de PR #7 describe el laboratorio antes de sus pruebas
aprobadas y Preview antes de su actualización. Este informe incorpora el estado
confirmado actual sin modificar ese PR. La documentación npm-audit preexistente
y sin seguimiento se conserva intacta y queda fuera de este cambio.
