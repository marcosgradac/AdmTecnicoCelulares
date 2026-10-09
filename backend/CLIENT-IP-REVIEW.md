# Seguridad 4J — preparación local de identidad IP

Base: origin/main af36d16cfb133e34b297c9a3143f0bf101a912a7.
Rama de auditoría: security/central-client-ip. Publicación mediante commit y PR autorizada; sin merge ni deployment manual.
No modifica la rama security/cloudflare-api-migration ni configuración externa.

## Diseño y configuración

CLIENT_IP_MODE=baseline es el comportamiento predeterminado. Conserva trust proxy=1,
req.ip, presupuestos existentes y claves históricas del riesgo de seguimiento.
El nuevo modo cf requiere CLIENT_IP_CF_TRUST_ACK=render-public-web-service.
No aplicar esos valores todavía. La confirmación es del operador; no demuestra
por sí misma la topología o el saneamiento del proveedor.

En cf, trust proxy=false; req.ip sigue describiendo el socket. Un middleware
al inicio de /api, después de CORS y antes de previews, parsers, limitadores y
Prisma, captura una única CF-Connecting-IP IPv4/IPv6. La almacena por request en
WeakMap y centraliza la lectura. No modifica req.ip ni interpreta XFF, X-Real-IP,
CF-Connecting-IPv6, User-Agent o CF-Ray como pruebas de confianza.

Cabecera ausente, vacía, duplicada, lista, puerto, corchetes, zona IPv6 o valor
inválido: rechazo genérico, no-store/noindex, sin llegar a DB, captcha ni negocio.
No hay fallback a socket/XFF en cf. En cf, los lectores de identidad exigen que el middleware haya registrado
la solicitud; sin esa marca fallan cerrado y no leen cabeceras por su cuenta.

IPv6 se canonicaliza y IPv4 mapeada, incluida la forma hexadecimal, se normaliza.
ipKeyGenerator conserva IPv6 /56. El riesgo de seguimiento usa esa misma clave
en cf; Turnstile recibe la IP literal seleccionada y normalizada, no la subred.
Los límites por usuario siguen por usuario; sus alternativas por IP son centrales.
Los registros de seguridad usan la identidad central para su hash existente.
No se introducen logs de IP, cabeceras ni tokens ni nuevas dependencias.

## Defensa temprana contra cabeceras inválidas

En cf, CLIENT_IP_INVALID_MAX (predeterminado 60, entero 1..600) controla un
contador de rechazos por proceso y minuto. Las primeras 60 inválidas reciben 400;
las siguientes reciben 429 con Retry-After. No consulta IP, socket, XFF, UA ni
credenciales para separar presupuestos: variar cabeceras no crea otro contador.
Es una ventana monotónica y un contador saturado; memoria constante, sin mapas
por atacante, timers, colas, demoras o nuevos errores/stack traces por rechazo.

La cabecera se valida con un literal de hasta 45 caracteres y conteo de duplicados.
Solo las solicitudes inválidas entran al contador. CF válida continúa por sus
limitadores normales aunque un atacante haya agotado el guard: no bloquea a
usuarios válidos por compartir proxy/NAT. Un cliente legítimo sin CF también se
rechaza; eso indica un camino no cubierto por el contrato de ingreso y requiere
investigación, no un fallback a una cabecera falsificable.

El guard se ejecuta en /api después de Helmet/CORS y antes de parsers, previews,
auth/captcha y Prisma. Las solicitudes inválidas ya quedaban fuera de esos caminos;
la revisión añade respuesta de throttling y elimina la construcción de excepciones
por cada cabecera inválida. No limita el número de conexiones, TLS, bytes recibidos,
validaciones o rechazos emitidos. No es un cortafuegos ni asegura un techo de CPU
bajo ataque volumétrico. Reinicios restauran la ventana y varias instancias tienen
contadores separados. Sin una identidad confiable para requests malformados,
limitar el socket/proxy perjudicaría a todos; por eso no se introduce ese límite.
La protección perimetral continúa necesaria, sin cambios de infraestructura aquí.

Tests: 400 hasta el umbral, 429/Retry-After después, rotación XFF/UA sin evasión,
reinicio de ventana simulado sin sleeps, clientes válidos/NAT después de saturar,
no Prisma/Turnstile/logs sensibles, y rechazo antes de parsear JSON malformado.
Baseline ignora esta variable y mantiene su comportamiento anterior.

## Health y condiciones de monitoreo

/health conserva liveness sin necesidad de cabecera. Los preflight se responden
por CORS antes de validar identidad. /api/health requiere cabecera válida en cf;
con ella conserva SELECT 1, 200/503 y presupuesto independiente. Antes de activar,
verificar que el monitoreo usa /health y que readiness entra por el ingreso público.
No exceptuar endpoints con DB de la validación CF por comodidad.
Baseline mantiene el contrato previo en ambos health checks. En cf, requests a
/api/health sin identidad válida reciben 400 o 429 del guard, nunca SELECT 1;
no deben interpretarse como una caída de PostgreSQL. Monitor Render: usar /health.
Un monitor readiness externo debe entrar por el ingreso público que sanea CF,
con frecuencia inferior a RATE_LIMIT_HEALTH_MAX (30/min por defecto y por IP).
Si varios monitores comparten egreso, comparten ese presupuesto. DB caída con
cabecera válida sigue devolviendo 503/ok:false; /health sigue 200/ok:true.
No se cambió ningún monitor ni ruta/configuración de Render.

## Previsualizaciones sociales

Baseline conserva 30/min/IP (RATE_LIMIT_TRACKING_PREVIEW_MAX, configurable).
La ruta /api/tracking-preview/:token se registra ANTES de globalApiLimiter.
El techo global NO se aplica a previews ni debe contarse como su protección.
CF propone dos capas propias, independientes del tracking interactivo:

- Techo total: 120/min/IP por defecto, RATE_LIMIT_TRACKING_PREVIEW_CF_MAX,
  entero 1..600. Se agrupa IPv6 /56.
- Techo por IP+enlace: RATE_LIMIT_TRACKING_PREVIEW_MAX, 30/min por defecto.
  La clave incluye hash del token; no se registran tokens ni se usa solo el token.

Ambas capas se ejecutan antes de Prisma y mantienen 429/Retry-After/no-store/noindex.
Cambiar token, slug o User-Agent no evita el techo IP. Tokens inválidos consumen
presupuesto sin consultar DB. Intentos bloqueados por enlace también consumen el
techo IP; no hay exención para bots. Metadata, expiración, privacidad y enlaces
históricos se conservan sin caché ni regeneración de tokens.

120/min es una propuesta experimental NO aprobada para producción, independiente
por completo del techo global. No representa capacidad comprobada de PostgreSQL
ni garantiza ausencia de bloqueo.
Permite varias previsualizaciones distintas por una salida compartida, pero aumenta
hasta cuatro veces el techo previo de previews únicamente en el modo no activado.
Requiere aprobación expresa del valor y validación del rewrite Vercel antes de
producción. No se añadieron IPs de Vercel ni autenticación ficticia del proxy.

Costo potencial: hasta 120 consultas Prisma por minuto y por IP/subred /56,
7200/h si se sostiene, frente a 1800/h del techo previo de 30/min. Son límites
por ventana, no una predicción de consumo: ventanas consecutivas permiten ráfagas.
Tokens con formato válido pero inexistentes también consultan; variar tokens no
evita el techo por IP. Múltiples IPs/subredes multiplican el total y no existe aquí
un techo global de previews, caché, límite de concurrencia o protección distribuida.
Además consumen TLS, CPU, memoria de limitadores, conexiones/cola PostgreSQL y
bandwidth; el costo monetario depende de cuotas/planes, no se cuantificó ni aprobó.

Dependencia bloqueante: medir el camino Vercel real aislado y confirmar su identidad
antes de elegir un presupuesto. Si CF muestra egreso Vercel, varios crawlers/enlaces
pueden compartir 120/min; con una IP por crawler o visitante el reparto es distinto.
Ningún User-Agent acredita esa procedencia. La mitigación de dos capas solo ofrece
margen a enlaces distintos, no garantiza servicio bajo abuso desde la misma IP.

## Evidencia y riesgos pendientes

Render afirma que su ingreso público sobrescribe CF-Connecting-IP:
https://render.com/articles/host-pocketbase-on-render
4H validó IPv4 en ambos caminos del laboratorio y bloqueo de CF sintética.
Los tests locales comprueban selección y controles, NO saneamiento de Render.
Una CF válida falsificada llega a controlar identidad si el proceso se expone
por otra frontera sin saneamiento: el test lo demuestra explícitamente.

Falta inspeccionar Workers, Pseudo IPv4 Overwrite Headers y transformaciones:
https://developers.cloudflare.com/fundamentals/reference/http-headers/
No se usa automáticamente CF-Connecting-IPv6 para recuperar otra identidad.
Vercel conserva cabeceras de visitante, pero eso no acredita que CF represente al
visitante tras Render; salida agregada y presupuestos compartidos siguen posibles:
https://vercel.com/docs/routing/rewrites
También falta prueba IPv6 real y comparación entre dos redes. NAT siempre comparte
IP; la agrupación /56 comparte deliberadamente presupuesto y riesgo.

El dominio onrender.com continúa público: este cambio no obliga a pasar por
nuestra zona Cloudflare ni evita su bypass, y no es protección DDoS.
No adoptar primer XFF, número mayor de saltos, allowlists observadas o excepciones
por UA para compensar resultados inesperados. Mantener PR #4 pendiente.

## Verificación reproducible y aislada

Node 22:

    npm run typecheck
    npm run build
    npm run test:client-ip
    npm run test:health-checks
    npm run test:tracking-preview
    npm run test:tracking-preview-rate-limit
    npm run test:public-api-origin
    node node_modules/tsx/dist/cli.mjs tests/tracking-links-unit.ts

Ejecutar desde backend. Los tests nuevos usan solo loopback, direcciones de
documentación, Prisma mock y Turnstile interceptado, sin DB ni APIs reales.
La prueba HTTP obliga a localhost en su fetch y rechaza otros destinos.
No ejecutar las suites que necesitan bases reales como sustituto de estos tests.
Backend CI ejecuta npm run test después del build: es un alias de la suite aislada test:client-ip, sin PostgreSQL real. Las regresiones comprueban que los eventos de 429 de seguimiento y del limiter global no incluyan tokens; registran /api/tracking/:token. Los demás tests existentes de backend y frontend se conservan.

Activación y reversión futuras requieren otra aprobación. No se cambiaron .env
reales ni variables del proveedor; .env.example mantiene baseline y ACK vacío.

## Corrección final: recuperación de contraseña y obligatoriedad del middleware

forgotLimiter y resetLimiter de password-reset.routes.ts usan clientIpKey mediante
sus opciones compartidas. Conservan PASSWORD_RESET_RATE_LIMIT_WINDOW_MS,
PASSWORD_RESET_RATE_LIMIT_MAX, handler y toda la lógica de recuperación.
Los presupuestos de forgot y reset siguen separados; NAT comparte cada uno.

En cf, clientIp/clientIpKey/clientRiskKey no vuelven a analizar CF fuera del
middleware central. Sin marca en el WeakMap fallan cerrado con error de montaje;
ninguna cabecera válida por sí sola autoriza la identidad. Baseline mantiene la
lectura histórica de req.ip incluso en routers independientes sin middleware.
No se cambian los valores experimentales de tracking-preview.

La regresión password-reset-client-ip usa HTTP loopback con payloads inválidos y
trampas Prisma: prueba IPs independientes, NAT, presupuestos separados entre rutas,
XFF falso irrelevante, IPv6 /56 y ausencia de lecturas de headers sin middleware.
Se ejecuta en procesos aislados para cf y baseline. No envía correos, no consulta
bases, no llama APIs y no usa credenciales reales. Los tests no sustituyen la
prueba funcional de emisión/consumo de tokens contra una DB temporal.

Auditoría estática de backend/src: los demás rateLimit tienen generador central
o clave explícita por usuario, y el único acceso directo a req.ip queda dentro
del selector central para baseline. Turnstile recibe esa identidad desde sus
llamadores; no se cambia la validación de captcha ni la lógica de usuario.