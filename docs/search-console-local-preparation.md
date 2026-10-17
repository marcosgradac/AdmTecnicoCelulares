# TecnoDesk: preparación SEO local y Search Console

Estado: preparación basada en `origin/main` `be0aa7b069e156c40e336918b619ce2f661ecab3`, autorizada por el propietario para commit, push y PR en borrador desde `codex/seo-search-console`. No autoriza merge, despliegue ni cambios DNS. El estado y SHA finales de CI se documentan en el PR. Canonical elegido por el propietario: **https://www.tecnodeskpro.com**.

## Auditoría de producción

La consulta HTTP sin credenciales mostró:

- El dominio sin `www` responde 308 hacia `www`, conservando el path. HTTP añade primero la redirección a HTTPS.
- `/robots.txt` y `/sitemap.xml`, tras esa redirección, responden 200 `text/html` con la SPA: no son documentos SEO válidos.
- Landing, login, administración y legales comparten los metadatos iniciales. Faltan canonical, imagen/URL Open Graph y directivas noindex.
- Una ruta inexistente responde 200 con la SPA (soft 404).
- Solicitudes con agente Googlebot obtienen HTML, JS y CSS (200). Simular ese agente **no certifica** el acceso desde la infraestructura de Google ni la indexación.

## Cambios preparados

- `public/sitemap.xml`: únicamente `/`, `/terminos-y-condiciones` y `/politica-de-privacidad`, con HTTPS y `www`. No se inventan páginas, fechas lastmod, tokens o datos de clientes.
- `public/robots.txt`: rastreo permitido y URL absoluta del sitemap. No se bloquea el rastreo que permite leer noindex.
- `src/seo/pages.json`: títulos y descripciones de las tres páginas públicas.
- Plugin de build: genera HTML inicial específico para las páginas legales y la landing; `app.html` y `404.html` tienen noindex y no contienen canonical ni URLs de seguimiento. Todos reutilizan el bundle real de React.
- Metadatos en navegación interna: canonical, robots, descripción, Open Graph y Twitter se actualizan al cambiar de ruta, sin duplicados ni tokens. La imagen es el recurso existente `/tecnodesk-512.png`.
- `vercel.json`: se conservan, primero y sin cambios, las dos proxies de WhatsApp/Facebook. Se conserva la política de seguridad y las protecciones de previews existentes. Las rutas SPA válidas reciben `app.html`; las desconocidas quedan sin rewrite y Vercel sirve su `404.html` con estado 404. No se convierte toda la administración en un comodín. Un test compara las rutas con React Router para detectar divergencias futuras.
- Las rutas de acceso, recuperación, administración, aliases privados y ambos formatos de seguimiento llevan `X-Robots-Tag: noindex, nofollow` y metadatos noindex. La exclusión de buscadores no sustituye autenticación o permisos, que no se modifican.
- React Router muestra una página no encontrada en navegación interna. El código HTTP de una navegación SPA ya cargada no cambia retroactivamente; la petición directa/recarga sí debe responder 404.
- Protección PWA necesaria para introducir 404 reales: las navegaciones HTTP fallidas no sustituyen el respaldo offline `index.html`. Se reprodujo la escritura del 404 en una prueba antes de corregirla; las 47 pruebas PWA pasan y los seguimientos conservan su exclusión de caché.
- El preparador offline del origen API distingue proxies condicionadas por agente de las entradas normales de seguimiento; no cambia la API ni los destinos productivos.

Se mantiene el render de contenido mediante JavaScript. Los metadatos iniciales ya no dependen de ejecutarlo, pero esto **no es prerenderizado del contenido ni SSR**. Una eventual mejora de renderizado de la landing necesitaría una tarea independiente.

## Validación reproducible

Desde `frontend`, usando una URL API local ficticia durante el build:

```powershell
$env:VITE_API_URL='http://127.0.0.1:3001'
npm run typecheck
npm run build
npm run test:seo
npm run test:api-domain-prep
npm run test:pwa
```

`test:seo` requiere el build recién generado. Revisa HTML inicial mediante GET/HEAD, tipos MIME, cabeceras, todas las entradas SPA, 404, mapa de rutas, las reglas exactas de previews y navegación real con API sintética. Revisa temas claro/oscuro a 390/1440 px. Los resultados HTTP se guardan en `artifacts/seo/local-http.json`, fuera de Git.

La preview local implementa la selección de HTML de la política SEO. **No es el router real de Vercel y no hace proxy hacia producción.** Las previews de WhatsApp se comprueban como contrato de configuración y mediante regresiones existentes, sin enviar tokens reales. No se considera verificada una publicación por el resultado de la preview local.

## Verificación del dominio en Search Console (manual, sin ejecutar)

1. Abrir Google Search Console con la cuenta propietaria y añadir una propiedad de tipo **Dominio**: `tecnodeskpro.com`, sin protocolo ni ruta. Abarca HTTP/HTTPS y los subdominios, incluido `www`.
2. Seleccionar verificación DNS y copiar exactamente el valor TXT entregado por Google: `google-site-verification=VALOR_PROPORCIONADO_POR_GOOGLE`. Este documento no contiene un token real.
3. En Cloudflare, zona `tecnodeskpro.com` → DNS → Records → Add record: tipo **TXT**, nombre **@**, contenido exacto de Google, TTL **Auto**. No reemplazar ni borrar TXT de correo/SPF u otras verificaciones. Los TXT no utilizan proxy HTTP.
4. Guardar sólo tras autorización del propietario. Comprobar propagación con `Resolve-DnsName tecnodeskpro.com -Type TXT` y pulsar Verificar en Search Console. La propagación puede demorar; no eliminar el TXT después de verificar.
5. Sólo después de publicar y validar el sitemap real, enviar `https://www.tecnodeskpro.com/sitemap.xml` en Sitemaps e inspeccionar las tres URLs públicas. Revisar HTML renderizado, canonical elegido e informe de indexación. No solicitar indexación de rutas privadas ni seguimientos.

Referencias: [verificación de Google](https://support.google.com/webmasters/answer/9008080), [noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing), [SEO JavaScript](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics), [DNS Cloudflare](https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/), [404 estático Vercel](https://vercel.com/kb/guide/custom-404-page).

## Autorizaciones necesarias para publicar

1. Revisar y autorizar commit, push y PR de estos cambios locales; revisar el diff y los checks remotos. Antes del push, revisar disparadores automáticos de previews y despliegues: preparar un PR no debe publicar accidentalmente la versión productiva. Esta tarea no modifica la configuración remota de esos servicios.
2. Autorizar integración y despliegue del frontend. No se requieren cambios de backend ni migraciones.
3. Autorizar por separado la creación del TXT en Cloudflare (o hacerlo manualmente).
4. Tras el despliegue, comprobar con GET/HEAD: HTML público 200 con canonical `www`; sitemap 200 XML; robots 200 texto plano; entradas privadas noindex; desconocidas 404; JS/CSS 200 con MIME correcto; reglas de previews con un entorno sintético autorizado. Verificar rutas con y sin sesión y navegación interna. Comprobar que no se corta un seguimiento existente sin divulgar sus tokens.

La producción seguirá sirviendo la versión anterior hasta un despliegue autorizado. No se promete indexación ni posicionamiento por añadir sitemap y metadatos.

## Posible cambio futuro a dominio sin www

No se recomienda cambiar de host como requisito para Search Console. Si el propietario decide hacerlo, deberán coordinarse la selección del dominio primario en Vercel, la redirección permanente **www → sin www** conservando rutas y consultas, y la actualización conjunta de canonical, sitemap, robots y Open Graph. Habrá que retirar la redirección inversa actual para evitar bucles y validar TLS/DNS, sin asumir que hace falta cambiar registros DNS. Esta preparación no ejecuta ninguno de esos cambios.

## Archivos modificados o añadidos

- `frontend/index.html`
- `frontend/package.json`
- `frontend/scripts/prepare-api-domain.mjs`
- `frontend/src/App.tsx`
- `frontend/src/features/landing/pages/LandingPage.tsx`
- `frontend/src/pwa/sw.template.js`
- `frontend/tests/pwa.cjs`
- `frontend/vercel.json`
- `frontend/vite.config.ts`
- `docs/search-console-local-preparation.md`
- `frontend/public/robots.txt`
- `frontend/public/sitemap.xml`
- `frontend/scripts/seo-policy.mjs`
- `frontend/scripts/vite-plugin-seo.d.mts`
- `frontend/scripts/vite-plugin-seo.mjs`
- `frontend/src/seo/NotFoundPage.tsx`
- `frontend/src/seo/SeoMetadata.tsx`
- `frontend/src/seo/pages.json`
- `frontend/tests/seo-browser.cjs`
- `frontend/tests/seo-policy.test.mjs`

## Resultados de las comprobaciones locales

- Typecheck y build de frontend: aprobados. Permanece el aviso existente de chunks de más de 500 kB; no se agregaron dependencias.
- Suite SEO: política pública/privada, **90 respuestas GET/HEAD de rutas** (82 con 200 y 8 con 404), más recursos estáticos. Robots y sitemap responden con MIME de texto/XML, no HTML. JS, CSS e imagen OG responden 200 con su MIME correspondiente. Los metadatos iniciales se revisan sin ejecutar JavaScript.
- Navegación real sobre el bundle compilado: **4 contextos** (390/1440 px, claro/oscuro), legales con ida/vuelta mediante React Router, login, registro, recuperación, administración, ambos formatos de seguimiento y página no encontrada. Módulos Dashboard, Caja y Reventa con API sintética. Sin errores de página, peticiones sin manejar ni escrituras de negocio.
- Regresiones: equipos/detalles/eliminación, flujo/edición/eliminación de reparaciones, Caja agrupada, métricas administrativas, renovación (11), encoding, preparador offline de dominio API y PWA (**47/47**, incluida la protección del 404 offline).
- Sesiones: **21 comprobaciones UI**, sin grupos fallidos. XSS y recuperación: **9 grupos**, sin fallos. Compatibilidad CSP: aprobada con bundle compilado, MUI/Emotion, Turnstile y API simulados, service worker y bloqueo de scripts inline/eval/conexiones no autorizadas. No se llamó a esos servicios productivos.
- Las tres URLs públicas actuales se consultaron en producción con GET de sólo lectura: **200 text/html**. Esto acredita su existencia, no que esta preparación local ya esté publicada.
- `git diff --check`: sin errores. Backend sin modificaciones. El checkout original conserva su rama y sus 55 cambios anteriores; este worktree mantiene HEAD en el SHA base, sin commits nuevos.

Limitaciones: pruebas con Chrome/Chromium de escritorio y viewport emulado, no dispositivo físico ni Safari/iOS. El agente Googlebot simulado no sustituye la inspección real en Search Console. El comportamiento de las reglas de Vercel y las respuestas de previews deberá confirmarse en el hosting tras una publicación expresamente autorizada.

## Revisión final contra origin/main

Resultado: cambios locales acotados a SEO, publicación de rutas y la protección PWA necesaria para los nuevos 404. Se revisaron los nueve archivos con diff y los once archivos nuevos; no basta con `git diff`, que omite los nuevos sin seguimiento. Después de `git fetch origin main`, HEAD y origin/main coinciden en `be0aa7b069e156c40e336918b619ce2f661ecab3`: no hay divergencia nueva ni conflictos por integrar. Backend y lockfile no tienen cambios.

Verificación repetida: suite SEO aprobada (90 GET/HEAD, recursos estáticos y cuatro contextos de navegador), PWA 47/47 y preparación offline del origen API aprobadas. Se compararon exactamente con main las dos reglas de previews, las cabeceras globales de seguridad, las protecciones de despliegue y los demás campos de configuración existentes: permanecen iguales. Los destinos normales de ambos formatos de seguimiento sirven app.html; los agentes WhatsApp/Facebook conservan primero las proxies existentes. Los tests de configuración no equivalen a una prueba del proxy desplegado.

Canonical, sitemap, robots y Open Graph nuevos usan HTTPS con www. Se volvió a consultar la redirección real: HTTPS sin www devuelve 308 a www; una ruta legal conserva su path y consulta. HTTP primero redirige a HTTPS. No se modificaron redirecciones remotas.

Robots y sitemap existen en el build y las pruebas verifican GET/HEAD, contenido y MIME correctos. No hay rewrite universal que los convierta en index.html. Debe validarse nuevamente en Vercel tras un despliegue autorizado; la producción actual todavía sirve la versión anterior. Las rutas desconocidas reciben 404 en preview; todas las rutas declaradas de React Router están cubiertas por la política y los rewrites, y la PWA no cachea un 404 como shell offline. Cualquier ruta nueva futura debe actualizar esta lista; los tests detectan divergencias.

**Salvedad de privacidad preexistente:** los metadatos SEO nuevos y el sitemap no contienen tokens ni información de clientes. Sin embargo, `backend/src/modules/tracking/tracking-preview.ts`, sin modificar y ya presente en main, genera `og:url` con el enlace compartido completo, incluido el token y, en el formato nuevo, el slug. Se confirmó ejecutando sólo el renderizador con datos ficticios, sin red ni base de datos. La preview utiliza noindex/nofollow/noarchive y una proyección que excluye detalles de reparación y cliente, pero no es correcto asegurar «cero tokens en todos los metadatos» mientras se preserve esa implementación. Antes de publicar, el propietario debe decidir si acepta esta excepción existente de las previews o autoriza una corrección específica del backend y sus regresiones. No se cambió el backend durante esta revisión.

Pendientes: comprobar routing/MIME/noindex/previews en el hosting real y rastreo en Search Console después de la autorización; acordar la salvedad anterior. Sin commit, push, PR, merge, despliegue ni cambios DNS.

## Preparación autorizada del PR en borrador

El propietario autorizó publicar exclusivamente estos 20 archivos en una rama SEO y abrir un PR en borrador, sin integrar ni desplegar. Se creó `codex/seo-search-console` en este mismo worktree (antes estaba en HEAD separado), preservando los cambios y el SHA base.

Antes del push se inspeccionó Vercel en modo de sólo lectura: el proyecto `adm-tecnico-celulares-jj5l` está conectado a `marcosgradac/AdmTecnicoCelulares`, tiene raíz `frontend` y rama productiva `main`. Se añadió únicamente `git.deploymentEnabled["codex/seo-search-console"] = false` al `frontend/vercel.json` ya incluido entre los 20 archivos. Esta es la única diferencia adicional respecto de las protecciones de despliegue comparadas en la revisión anterior. No cambia otras ramas, ajustes remotos ni comportamiento de previews sociales. La regla temporal deberá revisarse por separado al preparar una futura integración.

La [documentación de Vercel](https://vercel.com/docs/project-configuration/git-configuration) establece que esa exclusión por rama evita el despliegue automático al recibir commits. Se comprobarán también el estado de despliegues y los checks remotos después del push. El commit utiliza la marca `[skip render]` para evitar un despliegue automático de Render; no omite GitHub Actions.

El riesgo de `og:url` con token/slug en las previews existentes sigue abierto para revisión independiente. La autorización del PR no implica aceptación de cambios de backend ni autorización de publicación productiva.
