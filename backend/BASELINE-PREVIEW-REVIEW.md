# Baseline: aislamiento acotado de tracking-preview

Base revisada: main 6727b0d9e57bad9410da66a0977ce499a58e886d.
Propuesta para PR; no cambia variables, proveedores ni CLIENT_IP_MODE en producción.

## Defecto reproducido

El test HTTP del servidor real, con Prisma simulado, emitió 30 solicitudes del
mismo enlace A con la misma IP final de proxy. Un enlace B recibió 429 en lugar
de 200. Cambiar el User-Agent, CF-Connecting-IP o la entrada izquierda de XFF
no evita el bloqueo. La reproducción falló con el código anterior y pasa con
la protección compartida. No se repitieron los laboratorios 4K/4N.

## Cambio y límites propuestos

Se reutiliza createTrackingPreviewProtection y runLookup en ambos modos.
La identidad no cambia: baseline usa la selección central actual de Express
(trust proxy 1), ignora CF-Connecting-IP y conserva la agrupación IPv6 /56.
CF permanece experimental, requiere su confirmación explícita y conserva sus
valores anteriores; no se activa ni se adopta 120/min para baseline.

Baseline tiene tres presupuestos de 60 segundos, por proceso:

- IP+enlace: 10 por defecto, configurable con
  RATE_LIMIT_TRACKING_PREVIEW_BASELINE_LINK_MAX (entero 1..600); se limita al
  menor entre ese valor y RATE_LIMIT_TRACKING_PREVIEW_MAX.
- Por IP o subred /56: RATE_LIMIT_TRACKING_PREVIEW_MAX, sigue en 30 por defecto.
- Por proceso: RATE_LIMIT_TRACKING_PREVIEW_BASELINE_PROCESS_MAX, 600 por defecto,
  entero 1..600. Es una propuesta nueva para revisión, no una capacidad medida
  ni un valor previamente aprobado para producción. Coincide numéricamente
  con el default global de API pero tiene contador/configuración independientes.
  No descuenta presupuestos de login, registro, tracking ni otras operaciones.

Con defaults, A puede admitir 10 solicitudes y sus siguientes rechazos no cobran
IP ni proceso: B y C conservan 10 cada uno. Si se agotan las 30 admisiones reales
por IP, otro enlace será rechazado: no existe una reserva garantizada por enlace.
Los valores personalizados bajos del techo IP pueden reducir/eliminar esa reserva.
Cambiar tokens inválidos consume admisiones finitas; no consulta Prisma.

Memoria: 2048 claves máximas, sin evicción, con IP normalizada y hash acotado del
token. Concurrencia: cuatro consultas Prisma por proceso, sin cola. Un rechazo
por concurrencia no crea claves ni cobra ningún presupuesto. La plaza no se
libera por desconexión HTTP, solo al terminar la promesa de DB. Ventana monotónica.
429 mantiene Retry-After, no-store y noindex. Se conservan cabeceras draft-8 de
presupuesto, ahora identificando enlace, IP y proceso; nunca contienen tokens
ni IPs en texto. No se añaden logs de preview, caché ni confianza en User-Agent.
Open Graph, token histórico, vencimiento y privacy fallback siguen igual.

## Evaluación de abuso y límites que permanecen

La admisión por IP no aumenta. La consulta por proceso tiene ahora un límite
que antes baseline no tenía; un único proxy no puede consumir el techo de 600
con su presupuesto de 30. Para agotar 600 en una ventana se necesitan al menos
20 claves /56 o IPv4 efectivas con capacidad de 30, o reinicios/procesos separados.
Rotar enlaces dentro de una IP puede agotar sus 30; cambiar IPs puede agotar 600
y perjudicar previews ajenas durante la ventana. No es disponibilidad garantizada
bajo ataque distribuido. El rechazo por proceso solo afecta previews, no la API
normal. Un store coordinado externo sería necesario para un límite distribuido;
no se creó infraestructura. El diseño evita aumentar el trabajo admitido por IP
y agrega límites de DB/memoria; no resuelve el agotamiento por muchos clientes.

600/min supone hasta 36000 consultas/h/proceso, con ráfagas y cuatro simultáneas,
si todas las admisiones tienen formato válido. No es un objetivo de rendimiento
ni aprobación productiva; debe revisarse capacidad antes del merge. Si no se
acepta ese techo o el límite de 10/enlace, no activar ni integrar esta propuesta.
Reducir el techo puede bloquear tráfico legítimo; aumentarlo eleva costo de DB.
Sin medición de tráfico legítimo no se afirma que estos valores sean óptimos.

Los límites son por proceso; reinicios restablecen contadores y N procesos tienen
N veces la capacidad. DB bloqueada conserva plazas y puede interrumpir previews.
No limita volumen HTTP/CPU fuera del middleware, ni cambios de IP hechos por
proxies externos. El acceso directo onrender y la identidad intermediaria de
Vercel siguen pendientes. No recuperar IP de visitantes con cabeceras arbitrarias.

## Verificación aislada

npm run test ejecuta las regresiones de identidad/auth, las siete pruebas 4M
para CF y baseline, y el test HTTP nuevo del servidor real con Prisma simulado.
Este demuestra otros enlaces tras abuso, tokens inválidos, techo agregado IP y
proceso, cuatro consultas simultáneas, presupuesto intacto después de rechazos,
login/registro/tracking independientes y ausencia de tokens en logs/rechazos.
La suite reutilizada cubre memoria sin evicción, reset de ventana, error de DB y
desconexión. Las suites health, tracking-preview, rate-limit, public-api-origin y
tracking-links conservan sus regresiones locales. Typecheck, build y diff check
completan las verificaciones; CI del PR repite las comprobaciones aisladas.
No se usa PostgreSQL real ni se hacen solicitudes funcionales a producción.
