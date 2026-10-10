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
ni IPs en texto. Se omite pk: no se publican hashes ni identificadores estables
de IP/enlace. Los hashes internos acotados siguen siendo privados en memoria.
No se añaden logs de preview, caché ni confianza en User-Agent.
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

npm run test ejecuta las regresiones de identidad/auth, las nueve pruebas de protección
para CF y baseline, y el test HTTP nuevo del servidor real con Prisma simulado.
Este demuestra otros enlaces tras abuso, tokens inválidos, techo agregado IP y
proceso, cuatro consultas simultáneas, presupuesto intacto después de rechazos,
login/registro/tracking independientes y ausencia de tokens en logs/rechazos.
La suite reutilizada cubre memoria sin evicción, reset de ventana, error de DB y
desconexión. Las suites health, tracking-preview, rate-limit, public-api-origin y
tracking-links conservan sus regresiones locales. Typecheck, build y diff check
completan las verificaciones; CI del PR repite las comprobaciones aisladas.
No se usa PostgreSQL real ni se hacen solicitudes funcionales a producción.

## Ajuste de revisión: privacidad y política inicial

RateLimit-Policy conserva nombre de política, cuota q y ventana w; RateLimit
conserva restante r y reinicio t. pk es opcional en el draft-8 utilizado:
https://www.ietf.org/archive/id/draft-ietf-httpapi-ratelimit-headers-08.html#section-3
No hay consumidores de pk en el frontend actual. La regresión comprueba que
éxitos y rechazos siguen exponiendo campos de presupuesto con formato correcto,
pero no identificadores por IP/enlace; la política es idéntica entre dos IPs.
Esto no modifica cabeceras ni limitadores de otras rutas. Los valores de saldo
siguen describiendo presupuestos compartidos: omitir pk no oculta esa propiedad.

10/enlace+IP es una política inicial de aislamiento, no un límite por persona:
reserva, mientras no se hayan usado otras admisiones, dos tercios del techo IP
para enlaces distintos. Un crawler repetitivo del mismo enlace no puede cobrar
los 30 solo con ese enlace. Elevarlo a 15 dejaría margen para solo otro enlace;
elevarlo a 30 anularía el aislamiento. Bajarlo aumenta falsos rechazos. Sin datos
de tráfico no hay fundamento para afirmar que 10 sea óptimo ni aumentarlo ahora.

La contrapartida funcional es explícita: hasta diez consultas admitidas al mismo
enlace e IP en una ventana; el undécimo visitante/crawler legítimo recibe 429
aunque exista saldo IP/proceso. No se distingue por UA, cookies o IP inventada;
el seguimiento interactivo del navegador tiene su presupuesto separado. En una
ventana simulada, diez crawlers con UA distintos reciben 200, el undécimo 429,
otro enlace 200 y el primero vuelve a 200 al reset de ventana. Reintentos también
consumen el límite. No prometer previews de WhatsApp para todos los visitantes.

600/proceso es un techo preventivo frente a la ausencia anterior de un techo de
baseline por proceso. Equivale a veinte presupuestos completos de 30/IP, conserva
el límite individual y evita una admisión ilimitada al rotar IPs. Permite que un
solo proxy, acotado a 30, no bloquee todas las otras IPs. Es una elección inicial
de política con margen para fuentes independientes, NO capacidad PostgreSQL
medida ni garantía de disponibilidad. Su coincidencia con el límite global de
API no demuestra capacidad. El límite de cuatro consultas simultáneas mantiene
el trabajo pendiente acotado; no acota su duración ni asegura latencia adecuada.

Recomendación: GO de código para merge con aceptación expresa de esta política
inicial y sus falsos rechazos posibles; no activar cf ni modificar variables.
Después de un merge autorizado, observar 429 y disponibilidad mediante señales
agregadas sin tokens/IPs, y revertir el cambio si perjudica previews legítimas.
No aumentar límites sin evidencia de tráfico/capacidad. El riesgo de agotamiento
por enlaces rotados, varias IPs, reinicios o varios procesos permanece.