# Preparación de Cloudflare Free para la API de TecnoDesk

Estado: preparación, sin activar destinos nuevos. Base revisada:
`4c78387ab6006fc7ef47e3bd9e9169935bfd3481`. Fecha: 2026-10-07.
Todos los pasos de infraestructura de esta guía requieren aprobación posterior;
esta rama no cambia DNS, variables, servicios ni producción.

## Arquitectura y cambios incluidos

```text
www.tecnodeskpro.com ──────────────────────────── Vercel (DNS only)
tecnodeskpro.com ──────────────────────────────── redirección actual a www (Vercel)
api.tecnodeskpro.com ── Cloudflare Free (proxied) ─ Render
Turnstile ─────────────────────────────────────── configuración actual
PostgreSQL Supabase ───────────────────────────── sin cambios
```

`PUBLIC_API_ORIGIN` configura el origen HTTPS de las imágenes relativas en Open
Graph. Si no existe, sigue usando `https://tecnodesk-api.onrender.com`. Se rechazan
valores con credenciales, ruta, query o fragmento; el error no imprime el valor.
El nombre del negocio, escape HTML, logo externo, fallback de TecnoDesk, URLs
de seguimiento en www, tokens de 16/64 caracteres, vencimiento, privacidad,
`no-store` y `noindex` conservan su comportamiento.

El frontend ya usa `VITE_API_URL` para Axios y los assets de API. Los únicos
destinos de Render fijos en frontend son los dos rewrites para bots de WhatsApp
y Facebook en `frontend/vercel.json`. Se conservan en esta rama. El generador
offline produce un candidato en stdout y nunca escribe el archivo activo:

```sh
cd frontend
node scripts/prepare-api-domain.mjs https://api.tecnodeskpro.com
```

Solo después de validar el dominio, una futura PR reemplazará las dos
destinations por las del candidato y configurará `VITE_API_URL` en el entorno
aprobado de Vercel. Es una variable de build: requiere un nuevo build, no cambia
el bundle publicado. El generador preserva condiciones de user-agent, slug,
token y fallback SPA; permite generar también el candidato de reversión con
`https://tecnodesk-api.onrender.com`. No introducir secretos en variables VITE.

## 1. Inventario obligatorio en DonWeb: condición para continuar

Los nameservers informados son `ns1.donweb.com` y `ns2.donweb.com`.
No se accedió al panel de DonWeb ni se dispone de un inventario completo de la
zona. **No cambiar nameservers hasta obtener, copiar y comparar TODOS los
registros reales.** La búsqueda automática de Cloudflare no prueba integridad.

1. En DonWeb, abrir la administración DNS de tecnodeskpro.com. Exportar la zona
   si el panel lo permite; en caso contrario registrar manualmente cada fila,
   incluidas todas las páginas/subdominios, con captura privada de respaldo.
2. Inventariar nombre, tipo, contenido exacto, TTL y prioridad para todos los
   A, AAAA, CNAME, MX, TXT, SRV, CAA y delegaciones NS existentes. Incluir apex,
   www, mail, autodiscover, SPF, cada selector DKIM, `_dmarc`, validaciones de
   proveedores y cualquier servicio no relacionado con TecnoDesk.
3. Obtener los selectores DKIM del panel/proveedor de correo. Consultar solo
   TXT del apex no descubre DKIM ni todos los subdominios; DNS público no permite
   enumerar la zona completa. No inventar MX, IPs, SPF ni valores de verificación.
4. Consultar los valores de dominio que Vercel muestra actualmente y comparar
   con DonWeb. Conservar los registros correctos de apex y www y la redirección
   configurada en Vercel. Una redirección HTTP no es un registro DNS.
5. Comprobar si hay DNSSEC y DS en el registrador. Si están activos, planificar
   su desactivación y propagación antes del cambio de autoridad; después de
   estabilizar Cloudflare, habilitarlo allí y publicar su nuevo DS en DonWeb.
   No conservar un DS de la zona anterior.

Plantilla privada de inventario (completar con valores verificados; no publicar
credenciales, exports ni tokens de verificación en Git):

| Nombre | Tipo | Contenido real | TTL | Prioridad | Servicio | Comparado en Cloudflare |
| --- | --- | --- | --- | --- | --- | --- |
| completar desde DonWeb | | | | | | |

Conservar la zona y el acceso de DonWeb durante toda la migración y reversión.
Fuente: [importación DNS](https://developers.cloudflare.com/dns/manage-dns-records/how-to/import-and-export/).

## 2. Agregar zona Free sin alterar el sitio

1. En Cloudflare, agregar `tecnodeskpro.com` y seleccionar Free. No transferir
   el registro del dominio ni contratar servicios pagos.
2. Importar/copiar el inventario real. Revisar todas las filas contra DonWeb.
   Dejar apex, www y los hosts de correo en **DNS only**. MX/TXT no llevan proxy;
   sus targets de correo tampoco deben quedar proxied. Mantener TTL/prioridades.
3. Revisar CAA para permitir las autoridades que necesiten Vercel, Render y
   Cloudflare, según sus paneles/documentación. No borrar restricciones sin
   revisar ni sustituir valores por ejemplos genéricos.
4. Solo con inventario firmado y DNSSEC resuelto, cambiar en DonWeb los
   nameservers por los DOS asignados específicamente a esta zona Cloudflare.
   No usar nameservers de ejemplos. Esperar zona Active y verificar resolución,
   HTTPS de www, redirección del apex y correo entrante/saliente con cuentas de
   prueba autorizadas. No avanzar si algún registro difiere.

## 3. Agregar solamente api a Render y Cloudflare

1. En una etapa aprobada, agregar `api.tecnodeskpro.com` como Custom Domain del
   servicio Render correcto. No reemplazar www/apex ni agregar un wildcard.
2. Crear CNAME `api` → `tecnodesk-api.onrender.com`, primero **DNS only** para
   que Render verifique y emita su certificado. Confirmar el target con Render.
   Resolver conflictos A/AAAA únicamente en `api`; preservar los de Vercel y
   otros servicios. Si existen verificaciones adicionales, usar valores del panel.
3. Esperar dominio verificado y certificado Render válido para api. Comprobar
   `/health` y `/api/health` con GET puntuales, sin carga. Mantener onrender activo.
4. Configurar Cloudflare SSL/TLS **Full (strict)** y verificar el certificado de
   origen y el edge. Nunca Flexible ni desactivar validación para resolver errores.
   No instalar Origin CA en Render: su certificado público conserva DNS-only y
   reversión. Revisar renovaciones y CAA. Apex/www siguen DNS only.
5. Pasar únicamente `api` a **Proxied** y volver a comprobar TLS y ambas rutas.
   Conservar el DNS original y documentar hora/TTL de cada cambio.

Fuentes: [Render y Cloudflare DNS](https://render.com/docs/configure-cloudflare-dns),
[TLS Full (strict)](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/).

## 4. IP, CORS, caché y health: puertas de validación

Esta rama conserva `trust proxy = 1` y los limitadores existentes con
`ipKeyGenerator`. **No se incorpora confianza en CF-Connecting-IP, True-Client-IP,
Host o X-Forwarded-Host enviados por un cliente.** La prueba local demuestra
que cambiar CF-Connecting-IP y el extremo izquierdo de X-Forwarded-For no evade
el presupuesto del último hop configurado. No prueba cómo Render sanea esas
cabeceras: eso requiere verificar la cadena real en staging.

Antes de activar el tráfico nuevo, observar sin tokens/cookies/Authorization
ni datos personales la IP resultante y la cadena de proxies en un entorno
aislado. Probar dos IPs reales diferentes, IPv6 y acceso directo; verificar que
Render sobrescribe o valida el último hop. Si todas las IPs colapsan en una IP
de Cloudflare, o un cliente puede fijar la IP efectiva, detener la migración.
No solucionar eso con `trust proxy = true`, leyendo el primer XFF o aumentando
un número de hops a ciegas. Un ajuste de confianza requerirá otra PR y pruebas
de ambos caminos; todavía no hay garantía de IP real extremo a extremo.

CORS enumera ORÍGENES DEL FRONTEND, no la API: conservar www/apex o los orígenes
de staging realmente usados. No añadir wildcard, no quitar JWT, y no considerar
CORS como filtro contra bots. Probar preflight OPTIONS y Authorization.
Turnstile continúa validando en el backend; revisar sus hostnames de frontend
al crear staging, sin cambiar el secreto ni moverlo al cliente.

No crear reglas Cache Everything para API, previews o rutas autenticadas.
Configurar bypass de caché para api si existen reglas heredadas que fuerzan
caché; verificar `no-store`, `noindex` y ausencia de contenido privado cacheado.
Mantener `/health` como liveness 200 sin DB, sin challenges ni limitador nuevo;
`/api/health` conserva SELECT 1, presupuesto separado 30/min/IP y 503 genérico.
Los presupuestos de preview (30/min/IP) y tracking interactivo siguen separados.
Render debe seguir monitoreando su ruta actual; no cambiar su configuración.
Fuente: [Express detrás de proxies](https://expressjs.com/en/guide/behind-proxies/).

## 5. WAF y rate limiting compatibles con Free

Activar/verificar Cloudflare Free Managed Ruleset, revisar eventos y falsos
positivos con flujos de staging. Mantener Bot Fight Mode y Under Attack Mode
desactivados para esta API: sus challenges pueden romper JSON, preflights,
WhatsApp y servicios automáticos. Bot Fight Mode no permite excepciones con
Skip en reglas WAF. No usar allowlists de user-agent como autenticación.

Free permite UNA regla de rate limiting, contando por IP, con ventana y bloqueo
de 10 segundos. Sus campos de expresión son Path y Verified Bot; no copiar
reglas de Pro con Host/Method/headers ni prometer un límite Free por minuto.
Como propuesta inicial para staging, seleccionar path que empieza con `/api/`,
120 solicitudes por IP en 10 s, acción Block durante 10 s. Es un techo de ráfaga
a validar, no un umbral aprobado para producción ni sustituto del backend.
Excluye `/health` por ruta. No omitir verificados automáticamente: también
consumen recursos. Si hay callbacks server-to-server, revisar sus rutas reales
y excluirlas de esta regla solo con autenticación/validación propia comprobada.

En Security > Security rules, crear la regla de rate limiting con expresión
`starts_with(http.request.uri.path, "/api/")`, característica IP, requests 120,
period 10 s, acción Block y duration 10 s. Si la interfaz ofrece un producto
pago en vez de esta regla Free, detenerse sin contratarlo. Para una custom rule
opcional de escáneres, probar en staging la expresión
`http.host eq "api.tecnodeskpro.com" and http.request.uri.path in {"/.env" "/wp-login.php" "/xmlrpc.php"}`
y acción Block. Esos paths no son endpoints de TecnoDesk; no extender el match
al resto de la API. Aquí Host corresponde a CUSTOM rules, no al rate limiter
Free, que solo usa Path. No hay reglas creadas ni activadas por esta rama.

No activar bloqueos amplios por país/ASN, ni challenges en login, registro,
tracking, logo, health u OPTIONS. Añadir custom rules solo para tráfico cuyo
bloqueo se demuestre seguro en staging. No se configura OWASP completo ni bot
score de planes pagos. IPs compartidas (NAT, oficinas, redes móviles, Vercel
rewrites y crawlers) pueden agotar un presupuesto conjunto: revisar eventos,
subir el techo si procede y conservar límites backend por usuario/endpoints.
Los contadores edge tienen retraso y alcance por centro de datos; no son un
cupo global exacto ni detienen una botnet distribuida.

Fuentes: [límites por plan](https://developers.cloudflare.com/waf/rate-limiting-rules/),
[Free Managed Ruleset](https://developers.cloudflare.com/waf/get-started/),
[limitaciones de Bot Fight Mode](https://developers.cloudflare.com/bots/get-started/bot-fight-mode/).

## 6. Acceso directo a Render: limitación pendiente

Mientras onrender siga público, un atacante puede saltarse el WAF de NUESTRA
zona. El origen conserva Helmet, JWT, Turnstile, validaciones y rate limiting,
pero las solicitudes llegan a Express. Cloudflare por sí solo no cierra ese
camino; CF-Ray/CF-Connecting-IP y un Host esperado no acreditan nuestra zona.

Para una futura fase independiente, evaluar un header secreto de origen
sobrescrito en una Transform Rule exclusiva de nuestra zona, validado con
comparación segura ANTES de Prisma, con rotación y excepción mínima para
liveness/monitoreo. No enviarlo al frontend, publicarlo ni registrar su valor.
Es una barrera de aplicación, no un firewall: el tráfico rechazado igual toca
Render. Requiere decidir compatibilidad y reversión de Vercel, callbacks y
clientes antiguos antes de exigirlo. No está implementado en esta rama.

Después de migrar consumidores, podría deshabilitarse onrender con autorización
expresa, pero NO ahora y NO como prueba de aislamiento del origen custom-domain.
Render ofrece restricciones inbound de web services en Scale/Enterprise; no
asumirlas disponibles en Free. Incluso una allowlist de IPs Cloudflare no
autentica nuestra zona. Un origen privado/Tunnel es otra arquitectura y revisión.

Fuentes: [dominios Render](https://render.com/docs/custom-domains),
[request header transforms](https://developers.cloudflare.com/rules/transform/request-header-modification/),
[restricciones inbound Render](https://render.com/docs/inbound-ip-rules).

## 7. Staging, activación posterior y reversión

Primero aprobar esta PR sin activar el dominio. Crear staging solo en recursos
de prueba autorizados, con Prisma simulado o DB aislada sin datos reales y sin
credenciales de producción. No crear recursos pagos ni modificar producción
para probar. Si no hay staging autorizado, detenerse en las pruebas locales.

Matriz funcional con tráfico mínimo: ambos dominios, dos IPs, IPv6, preflight,
login/registro/Turnstile con usuarios de prueba, panel, reparaciones simuladas,
tracking moderno/histórico/vencido/deshabilitado, preview de ambos enlaces,
logo/fallback/escape y crawler WhatsApp/Facebook simulado. Validar health 200/503
y 429 con Retry-After SOLO localmente; las pruebas incluidas simulan Prisma.
Mercado Pago: inventariar destinos y callbacks reales en su integración, probar
solo sandbox si está autorizado; no cambiar callbacks ni generar pagos reales.
No hacer ataques ni pruebas de carga contra Render o producción.

Con DNS/TLS/IP/caché/WAF validados, aprobar una etapa de activación: establecer
PUBLIC_API_ORIGIN en Render, VITE_API_URL en Vercel y aplicar el candidato de
rewrites mediante PR. Mantener CORS frontend, onrender y enlaces existentes.
Verificar despliegues y flujos con datos de prueba, vigilar errores 403/429,
latencia y disponibilidad antes de considerar bloqueo de origen.

Reversión escalonada:

1. Si el WAF produce falsos positivos, desactivar solamente la regla nueva;
   no quitar los controles backend. Si falla el proxy, volver api a DNS only
   siempre que el certificado Render sea válido; se pierde el WAF temporalmente.
2. Revertir VITE_API_URL y los dos rewrites a onrender con build/PR aprobados,
   revertir PUBLIC_API_ORIGIN o eliminarla para usar su default. No regenerar
   tokens; www y los enlaces públicos permanecen iguales.
3. Si falla la autoridad DNS/correo, restaurar en DonWeb sus nameservers
   originales y su zona preservada. Coordinar DS/DNSSEC con esa autoridad y
   esperar propagación; mantener ambas zonas correctas durante la transición.
4. No borrar api, zona ni certificados mientras haya clientes/cachés usando
   sus destinos. Registrar qué fase se revirtió y verificar correo/www/API.

## Verificación local y datos pendientes

Comandos sin servicios externos:

```sh
cd backend
npm run typecheck
npm run build
npm run test:public-api-origin
npm run test:health-checks
npm run test:tracking-preview
npm run test:tracking-preview-rate-limit
node node_modules/tsx/dist/cli.mjs tests/tracking-links-unit.ts
cd ../frontend
# Configurar VITE_API_URL=http://127.0.0.1:3000 únicamente para este build local.
npm run typecheck
npm run build
npm run test:api-domain-prep
npm run test:pwa
```

Comprobado en código: inventario de hostname fijo, configuración frontend,
generación OG, separación de limitadores y liveness/readiness. Las nuevas
pruebas también se ejecutan en Backend CI y Frontend CI, con datos simulados.
Pendiente de acceso/configuración externa: zona completa DonWeb, DNSSEC/DS,
targets de Vercel, CAA/certificados, plan/panel Cloudflare, cadena IP real Render,
configuración Turnstile, callbacks Mercado Pago y resultados de staging.
Estos pendientes impiden declarar lista la activación o cerrado el bypass.
