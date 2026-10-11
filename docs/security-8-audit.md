# Seguridad 8: XSS, navegador, CSP y dependencias

Fecha: 2026-10-11. Base: `6be2962b082e4eec594d8b866bcc9f78a890521c`.
Rama: `codex/security-8-xss-csp-dependencies`. Entrega: un PR borrador, sin merge ni despliegue productivo.

## Hallazgos confirmados y cambios

No se reprodujo ejecución XSS en las superficies examinadas. No se incorpora sanitizador ni se mutilan textos legítimos. Se confirmó en navegador que el token de recuperación permanecía en la URL después de montar la pantalla: prueba roja `searchParams.has('token') === true`. Se reduce esa exposición mediante captura, reemplazo de la URL sin token y Referrer-Policy no-referrer. Esto no evita que la navegación inicial quede en los registros del alojamiento.

`useRecoveryToken` mantiene el token en memoria y, para conservar recarga, en sessionStorage con límite de 30 minutos. El backend mantiene su vencimiento y consumo único autoritativos; guardar nuevamente una capacidad no extiende su validez en servidor. Se descartan entradas vencidas, malformadas o con vencimiento fuera del límite; se elimina tras éxito. Un enlace nuevo reemplaza la capacidad anterior. Se conserva el resto del query y se usa navegación replace para no agregar una entrada con el secreto. Sin almacenamiento disponible el enlace funciona en memoria; para recargar se debe reabrir el correo. sessionStorage continúa accesible al JavaScript del origen y puede ser copiado inicialmente por una ventana con opener: no equivale a HttpOnly ni a aislamiento por dispositivo.

Se corrige además el estado visual de éxito al recibir otra capacidad mediante navegación SPA. Las pruebas usan sólo tokens y contraseñas sintéticos y transporte HTTP simulado.

No cambian JWT, cookies, Origin Auth, limitadores, permisos, consultas productivas, base de datos, migraciones, infraestructura ni secretos. Los únicos cambios backend son pruebas y su runner.

El fallback en memoria tiene el mismo vencimiento y sobrevive al remount provocado por restauración de identidad de AuthProvider. Se prueban tanto getter/lectura bloqueados como setItem rechazado por cuota. Una recarga completa sin storage pierde esa memoria deliberadamente. Se conserva el descarte de JSON malformado disponible; no se interpreta como falta de storage.

## Inventario XSS

Se buscaron sinks en todo `frontend/src` y `backend/src`: innerHTML, dangerouslySetInnerHTML, insertAdjacentHTML, document.write, eval y new Function; no hay usos de esos sinks en código del producto. Se revisaron enlaces, imágenes, navegación y templates HTML aparte. La ausencia de sinks no demuestra ausencia de toda vulnerabilidad futura o en dependencias.

| Superficie | Contexto y revisión | Evidencia / límite |
| --- | --- | --- |
| Clientes y detalle | ClientsPage, ClientDetailPage: nombre/teléfono/mail/observaciones en JSX/MUI e inputs | Escape React. Cliente con HTML/SVG real en fixture de navegador y persistencia en PostgreSQL local; no ejecución |
| Reparaciones y estados | RepairsPage, RepairDetailPage, drawers, diagnóstico/notas/falla/marca/modelo/color/IMEI e historial | JSX escapado. Payload visible literal en detalle; API local conserva texto sin sanitización destructiva; history sintético |
| Garantías/reclamos | features/warranties: descripción/concepto/estado y drawers | Texto JSX e inputs, sin HTML raw; regresiones funcionales locales de garantías |
| Productos/comercio/POS/equipos | CommercePageV2, PointOfSalePage, features/equipmentSales | Nombres/categorías/notas como JSX, atributos React; navegación interna, sin sink HTML. Regresiones comercio/stock/equipos |
| Negocio/equipo/perfil | features/settings, TeamPage, ProfilePage, AppShell | Texto JSX; logos img/Avatar. No object/embed ni SVG inline derivado de usuarios |
| Super Admin/billing | features/platformAdmin y billing: nombres/notas/motivos/errores | JSX, inputs y tablas. Sin interpolación HTML; regresiones redacción/métricas/acciones/renovación |
| Caja/reportes/dashboard | CashPage, components/dashboard, reportes | JSX y gráficos; importes formateados, hrefs internos definidos por la app o IDs del servidor. Regresiones fórmulas, fechas, acceso y finanzas |
| Seguimiento público | TrackingPage, rutas modernas y legacy | Textos JSX e img. Payload HTML/SVG en negocio y reparación, sin nodos ejecutables en navegador; contratos públicos preservados |
| OG/social | modules/tracking/tracking-preview.ts | Escape de &, <, > y comillas en título/atributos. URLs fijas con token/slug codificados; logo HTTP(S) sin credenciales o fallback. Tests maliciosos javascript/data/atributos; no detalles privados seleccionados |
| Emails HTML | services/email/templates y recuperación | Nombre escapado en código de cambio de contraseña; código/expiración internos. Enlace de reset usa origen administrativo configurado y token codificado, no URL suministrada por cliente. Transporte fake; no correos reales |
| Errores/notificaciones | Alerts/Snackbars/render de message | Texto JSX, no HTML interpretado, incluso para errores API |
| Links/URLs | Inventario global href/src/window.open/new URL | WhatsApp usa origen fijo wa.me, teléfono reducido a dígitos y mensaje encodeURIComponent. Soporte/social constantes con noopener/noreferrer. Router navega paths internos |
| Uploads/imágenes | Backend business-logo y frontend img/Avatar | PNG/JPEG/WEBP, magic bytes, 2 MiB; SVG no admitido. javascript en img no es un XSS demostrado; no se declara como tal. URLs históricas externas pueden causar petición/imagen rota, riesgo de privacidad y disponibilidad |

Payloads incluyen HTML img con onerror, SVG con onload, comillas de atributo, javascript:, data SVG y URL con credenciales. Las pruebas de renderizado no dependen de CSP aplicada para impedir la ejecución: corren con Report-Only. La CSP aplicada se prueba aparte. Cobertura dinámica deliberadamente concentrada en clientes, reparación, seguimiento y templates; el resto del inventario es revisión estática más regresiones, no se afirma una prueba browser individual de cada campo.

## Cabeceras y política CSP

Backend mantiene Helmet sin cambios. HTTP local sobre la app real demuestra CSP aplicada (script self, object none, sin unsafe-eval), nosniff, no-referrer, X-Frame-Options SAMEORIGIN y HSTS en OG. Origin Auth es anterior a Helmet; su rechazo temprano puede no incluir las cabeceras posteriores. Su protección y excepción GET /health se mantienen.

Frontend no tenía headers explícitos en vercel.json. Se prepara:

- Content-Security-Policy-Report-Only global, sin scripts inline ni unsafe-eval.
- X-Content-Type-Options nosniff; Referrer-Policy no-referrer.
- Permissions-Policy camera=(), microphone=(), geolocation=(), payment=(): ninguna función actual las necesita.
- X-Frame-Options DENY. frame-ancestors none en Report-Only es observación, no protección aplicada; DENY ofrece protección actual al integrarse.
- Sin cambio de HSTS, HTTPS, Cloudflare ni DNS. La cabecera Helmet local no demuestra la configuración efectiva de Vercel/Cloudflare; debe verificarse al integrar. No se agrega preload/includeSubDomains a ciegas.

Lectura pública HEAD sin redirecciones ni credenciales el 2026-10-11: www.tecnodeskpro.com/login respondió 200 con HSTS max-age=63072000 y sin CSP/Report-Only/nosniff/referrer/permissions/frame headers explícitos. api.tecnodeskpro.com/api/health respondió 200 con HSTS max-age=31536000; includeSubDomains, CSP Helmet, nosniff, no-referrer y SAMEORIGIN, sin Permissions-Policy. Se leyeron exclusivamente estas cabeceras, sin cookies ni datos de negocio. No se cambió ninguna configuración efectiva.

Política preparada:

```text
default-src 'self'; script-src 'self' https://challenges.cloudflare.com; script-src-attr 'none'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://api.tecnodeskpro.com https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

| Recurso real | Directiva / decisión |
| --- | --- |
| Vite/React JS compilado, CSS, logos y capturas | self, sin eval. Scripts del servidor de desarrollo no justifican permisos productivos |
| MUI/Emotion y style attributes dinámicos | style-src unsafe-inline necesario para estilos inyectados/posicionamiento. No se permite en script-src |
| Inter en styles/global.scss | styles Google Fonts y fuentes fonts.gstatic.com. La carga real de fuentes externas queda para Preview; las pruebas offline usan fallback |
| Turnstile loader e iframe | script/frame challenges.cloudflare.com; connect self y challenges. Documentación oficial confirma script/frame; test offline sustituye fronteras externas |
| API | connect api.tecnodeskpro.com, sin habilitar onrender.com |
| Logos actuales e históricos | img self/data/blob/https. HTTPS amplio por orígenes históricos desconocidos; no consulta productiva para inventariarlos ni bloqueo a ciegas |
| PWA | worker/manifest self; manifest y registro/activación del worker local compilado; lógica cache/update en 46 pruebas existentes |
| Meta/WhatsApp | Rewrites existentes sin cambios; HTML OG sin scripts ni render financiero, contratos bot modernos/legacy existentes |
| Preview | self cubre hostname Preview; Vercel toolbar puede generar observaciones (vercel.live), no se amplía script/connect para silenciarlas. Turnstile no tiene autorizado Vercel por decisión anterior: no se modifica ese bloqueo |

Estado: sólo propuesta en rama/PR, Report-Only al integrar. No hay endpoint report-uri/report-to nuevo; las violaciones se observan en consola, sin recoger URLs/tokens/datos de clientes en un servicio de reportes. La prueba local aplica la misma política únicamente en servidor desechable, compila App/index y harness, carga landing/login y comprueba MUI, API permitida, script/frame de Turnstile simulados, manifest y worker. Bloquea inline/eval/conexión externa negativa. No prueba resolución real de CAPTCHA, toda navegación autenticada ni carga de fuentes reales.

Alternativa a estilos inline: nonce aleatorio por respuesta y CacheProvider de Emotion con el mismo nonce, más tratamiento separado de style attributes; requiere cambiar la entrega estática o extracción de estilos y revisión propia. No usar nonce constante de build. Activar CSP aplicada requiere aprobación y observación de Preview (incluidos logos, Google Fonts, CAPTCHA en hostname autorizado y toolbar), luego verificación supervisada productiva.

Fuentes primarias: [Turnstile CSP](https://developers.cloudflare.com/turnstile/reference/content-security-policy/), [MUI CSP](https://mui.com/material-ui/guides/content-security-policy/), [Vercel response headers](https://vercel.com/docs/headers/response-headers).

## Dependencias

Reproducción: npm audit --json en cada directorio; npm ls axios react-router react-router-dom nanoid source-map-js en frontend. Auditoría inicial: backend 0; frontend cinco entradas high (react-router-dom hereda react-router, no son cinco CVE independientes). El agregado high de axios incluye advisories moderate y high. No se demostró explotación en TecnoDesk ni se equipara un advisory a XSS propio.

| Paquete | Antes → instalado | Tipo / ruta | Advisory, condición, uso y fix |
| --- | --- | --- | --- |
| axios | 1.18.1 → 1.20.0 | Directa runtime frontend | 12 advisories, detalle abajo; fix 1.20.0. Cliente Axios browser con instancia propia y aliases de método; sin Node SSR/HTTP2/proxy/dataURI. No se encontró primitiva de prototype pollution |
| react-router | 7.18.1 → 7.18.4 | Transitiva de react-router-dom runtime | [GHSA-qwww-vcr4-c8h2](https://github.com/advisories/GHSA-qwww-vcr4-c8h2), high; CSRF en acciones RSC; fix 7.18.2. App SPA BrowserRouter sin RSC/server actions; condición no presente |
| react-router-dom | 7.18.1 → 7.18.4 | Directa runtime | Hereda advisory anterior; no aviso separado. Mismo major y contratos Router probados |
| nanoid | 3.3.16 → 3.3.20 | Transitiva dev, vite→postcss | [GHSA-2v37-7h3g-55p8 / CVE-2026-67213](https://github.com/advisories/GHSA-2v37-7h3g-55p8), high audit; generator custom size=0 puede no terminar, fix 3.3.18. Sin uso directo de custom generator por el producto |
| source-map-js | 1.2.1 → 1.2.2 | Transitiva dev, sass/postcss | [GHSA-68fv-2mgg-jv7q / CVE-2026-93749](https://github.com/advisories/GHSA-68fv-2mgg-jv7q), high; offsets de indexed source maps provocan DoS, fix 1.2.2. No se aceptan source maps remotos de usuarios |

Axios: todos los casos afectados aquí se corrigen con 1.20.0; severidad de cada advisory, no el agregado del paquete:

| Advisory / CVE | Severidad | Condición y alcance en TecnoDesk |
| --- | --- | --- |
| [GHSA-vh66-26gq-q6x8](https://github.com/advisories/GHSA-vh66-26gq-q6x8), CVE-2026-101908 | moderate | Gadget fetch tras pollution independiente. No pollution ni selección explícita fetch encontrada |
| [GHSA-9fr6-4gfg-395g](https://github.com/advisories/GHSA-9fr6-4gfg-395g), CVE-2026-101902 | moderate | Default instance sin método propio hereda method; se usa axios.create y aliases |
| [GHSA-c29m-xwm3-cm6r](https://github.com/advisories/GHSA-c29m-xwm3-cm6r), CVE-2026-101903 | high | Parser dataURI Node con URL adversaria; sin Axios backend/dataURI |
| [GHSA-mghh-pgcx-3jjj](https://github.com/advisories/GHSA-mghh-pgcx-3jjj), CVE-2026-101906 | high | Normalización proxy Node con redirect host adversario; sin Node adapter/proxy |
| [GHSA-x97p-jq2g-jp4f](https://github.com/advisories/GHSA-x97p-jq2g-jp4f), CVE-2026-101909 | high | toFormData options heredadas tras pollution; multipart usa FormData nativo, sin options adversarias ni pollution demostrada |
| [GHSA-3pq3-5fj3-cg6v](https://github.com/advisories/GHSA-3pq3-5fj3-cg6v), CVE-2026-101898 | high | HTTP2 ignora lookup/proxy; no HTTP2 Node |
| [GHSA-542g-h47m-68v8](https://github.com/advisories/GHSA-542g-h47m-68v8), CVE-2026-101901 | high | Error HTTP2 sin handler; no HTTP2 Node |
| [GHSA-j8rh-479h-cp32](https://github.com/advisories/GHSA-j8rh-479h-cp32), CVE-2026-101904 | moderate | Headers heredados tras pollution/interceptor; interceptor auth propio, sin pollution demostrada |
| [GHSA-4hqw-qxg8-jxx2](https://github.com/advisories/GHSA-4hqw-qxg8-jxx2), CVE-2026-101900 | moderate | Fetch FormData getHeaders heredado tras pollution; FormData browser, sin primitiva demostrada |
| [GHSA-m8m8-qj5v-23w3](https://github.com/advisories/GHSA-m8m8-qj5v-23w3), CVE-2026-101905 | high | Node createConnection heredado tras pollution; sin Node adapter |
| [GHSA-44g4-m2mj-wpvx](https://github.com/advisories/GHSA-44g4-m2mj-wpvx), CVE-2026-101899 | moderate | NO_PROXY CIDR ignorado; no Node proxy config |
| [GHSA-r4gj-5m52-g5wh](https://github.com/advisories/GHSA-r4gj-5m52-g5wh), CVE-2026-101907 | high | Fetch ignora maxRedirects 0 y SSRF con URL adversaria; API origen configurado, sin SSR ni control atacante de URL de servidor |

Se actualizan sólo cinco versiones del lock dentro del mismo major, conservando integridades/resolved del registro npm. Axios actualiza su constraint de form-data; no se altera la versión resuelta de éste. nanoid y source-map-js se actualizan dentro de los rangos ya aceptados, evitando DoS de build futuro aunque no se haya demostrado entrada adversaria actual. Sin audit fix --force, overrides nuevos ni upgrades mayores. Riesgo residual de comportamiento patch/minor se cubre con typecheck/build y regresiones, no garantía sobre advisories futuros.

Auditoría final local: frontend 0 y backend 0 en todas las severidades. Fecha y resultado pertenecen al registro consultado en esta tarea; un nuevo advisory puede cambiar el reporte.

## Pruebas y reproducción

Windows: PLAYWRIGHT_BROWSER_CHANNEL=msedge; CI instala Chromium. DOTENV_CONFIG_PATH ficticio en tests backend; runners descartan DATABASE_URL heredada y crean clusters loopback temporales. Sin correos/CAPTCHA reales ni datos productivos.

- Backend npm test: contratos de rutas, Origin Auth en enabled/disabled/default y configuración inválida, client IP baseline/cf, reset/limiting, fairness/baseline previews.
- Health, tracking-preview y public-api-origin: HTTP con Prisma simulado, 200/204/401/403/429 y metadatos modernos/legacy según sus contratos.
- Aislamiento: 355 checks HTTP; permisos: 289; sesiones: 90. Regresiones: 24 suites y 13 adicionales sobre PostgreSQL desechable, incluidos reportes/caja/comercio/equipos/garantías/renovación/password reset/change y concurrencia.
- Nuevo backend npm run test:browser-hardening: URL/atributos OG, nombre email escapado y cabeceras reales Helmet; persistencia PostgreSQL de campos sintéticos cliente/reparación/historial y OG escapado.
  Upload SVG y SVG declarado como PNG rechazados 400 sin modificar logo; PNG sintético legítimo aceptado 200 y servido con image/png y nosniff.
- Frontend ocho suites de contratos existentes: reparación/edición/caja/admin/renovación/encoding/PWA/API domain. PWA: 46 comprobaciones. Sesiones browser: 21; eliminación UI: 17.
- Nuevo npm run test:browser-hardening: React real en clientes/reparación/seguimiento, tokens URL/recarga/consumo/nuevo enlace/SPA, expiración/dato inválido y HTTP headers.
- Nuevo npm run test:csp-compatibility: bundle local compilado, landing/login y harness real, fixtures externas, controles negativos CSP, manifest/worker. No utiliza API productiva a pesar del hostname: Playwright intercepta antes del transporte y aborta todo destino externo no simulado.
- Typecheck y build de ambos proyectos, auditorías npm y CI Backend/Frontend. Las suites nuevas se agregan al workflow para reproducción, sin debilitar assertions existentes.
  npm ci frontend reinstala el lock y reporta 0 avisos. Advertencias existentes: chunks >500 kB y scripts de instalación no aprobados por la política local para esbuild/@parcel/watcher; no se alteró esa política. Una ejecución Windows del runner PostgreSQL final quedó pendiente en cleanup después de PASS y fue interrumpida; repetición final terminó 0. Un browser cold start concurrente con build excedió 30 s de navegación; repetición sin esa concurrencia terminó 0, sin cambiar timeouts/assertions.
  Resultado final local: nueve grupos nuevos browser, incluyendo getter bloqueado, cuota agotada y restauración de identidad, todos aprobados; suite PostgreSQL final de campos/uploads y compilaciones aprobadas.

## Revisión independiente y límites pendientes

Revisión independiente estática: sin Critical/Important demostrados. Se corrigió Minor de estado de éxito ante otro enlace SPA. Se amplió CSP a entrada App/index además de harness y se explicitaron límites de CAPTCHA/fuentes/PWA, evitando afirmar validación completa de servicios reales.

Para aprobación posterior: merge/despliegue; prueba Preview completa y observación de recursos reales; CSP aplicada; entrega con nonce/extracción de estilos; eventual autenticación HttpOnly con diseño CSRF/CORS separado. Este PR no realiza esas acciones.

JWT localStorage accesible ante XSS permanece abierto. No se demostró XSS propio ni se promete impedir robo mediante Report-Only. El token del correo aún existe en navegación inicial/logs del hosting y sessionStorage; no se inspeccionan logs privados. Persisten revocación de peticiones ya autorizadas/en vuelo, logout local sin revocar copias externas, falta de sesiones por dispositivo y riesgo de claves foráneas históricas de Seguridad 5. No se corrigen mediante migraciones ni rediseños en esta tarea.

La entrega del PR y su CI se informan al usuario con SHA final. Seguridad 8 no se declara desplegada ni cerrada productivamente.
