# Seguridad 4M — admisión acotada de tracking-preview

Preparación local en codex/security-4m-preview-fairness, basada en PR #5
(afb86d07bf37ba27c5e09a3c1d4a91831f0c594a). Sin commit, push o infraestructura.
Baseline continúa predeterminado y su limiter 30/min/IP no cambia. CF no activado.

## Corrección concreta

En CF se comprueba primero el contador IP+enlace; un rechazo por enlace no cobra
los techos IP ni proceso, ni consulta Prisma. Una solicitud admitida cobra los tres
presupuestos de forma síncrona antes de Prisma. No se confía en UA/XFF; usa la
identidad central. Las claves guardan hash del token, no su texto.

- Por enlace e IP: RATE_LIMIT_TRACKING_PREVIEW_MAX (30/min por defecto).
- Por IP/subred IPv6 /56: RATE_LIMIT_TRACKING_PREVIEW_CF_MAX (120/min).
- Total por proceso: RATE_LIMIT_TRACKING_PREVIEW_PROCESS_MAX (120/min, entero 1..600).
- Máximo de 2048 entradas entre contadores IP y pares, con claves acotadas.
- Máximo de 4 consultas de preview simultáneas por proceso; sin cola.

Ambos valores 120/min son EXPERIMENTALES, no aprobados para producción ni derivados
de una medición de capacidad. El techo global de API sigue sin cubrir previews;
este nuevo techo pertenece exclusivamente a previews. Rechazos por memoria o
admisión dan 429/Retry-After hasta el fin de la ventana. Capacidad concurrente
agotada da 429/Retry-After:1. Sin logs sensibles, no-store/noindex conservados.

Ventana monotónica de 60 s compartida; al vencer se limpian contadores. No hay
evicción de claves activas que permita resetear un límite mediante rotación.
Una solicitud rechazada no crea entradas. Tráfico admitido con token inválido
consume presupuestos pero no consulta Prisma, como antes. La concurrencia cubre
solo la consulta Prisma, hasta que su promesa termine, incluso tras desconexión
HTTP. Un error de DB libera el slot y mantiene el fallback 503 existente.

No se añadieron caché, bypass de bots, cola, identidad firmada, cambios de tokens,
privacidad, vencimiento, Open Graph, Redis ni dependencias.

## Alcance y limitaciones

Corrige que repetir un enlace ya agotado quite presupuesto a otros enlaces de la
misma salida. No garantiza disponibilidad bajo abuso de muchos enlaces: un ataque
que rota tokens puede consumir admisiones compartidas o llenar la capacidad y
producir 429 legítimos. NAT y Vercel siguen compartiendo IP; no se recupera la IP
original ni se autentica WhatsApp. Los intentos rechazados siguen teniendo costo
de HTTP, validación y respuesta; no es defensa volumétrica ni un límite de CPU.

El techo es por PROCESO: reinicios restauran presupuestos y N procesos pueden
admitir hasta N veces el techo y ejecutar hasta 4N consultas simultáneas. No se
promete un límite distribuido. Para garantizarlo se necesita un coordinador/store
compartido, o imponer/verificar una sola instancia y proceso; no se creó ni cambió
infraestructura. Los otros endpoints de DB no consumen estos contadores.

Hasta 120 consultas/min/proceso (7200/h sostenidas) en CF, si todas las admisiones
llegan a DB; ventanas permiten ráfagas. El límite simultáneo no mide conexiones
físicas del pool. Si una consulta no termina, conserva su slot: evita trabajo
ilimitado pero podría bloquear previews. Timeouts/cancelación reales de DB y la
capacidad de Render/PostgreSQL deben verificarse antes de activar.

Baseline conserva su comportamiento anterior, incluidos sus stores existentes;
los límites nuevos de memoria/proceso/concurrencia aplican únicamente a CF.

## Evidencia local reproducible

Desde backend, Node 22:

    npm run test
    npm run typecheck
    npm run build
    npm run test:health-checks
    npm run test:tracking-preview
    npm run test:tracking-preview-rate-limit
    npm run test:public-api-origin
    node node_modules/tsx/dist/cli.mjs tests/tracking-links-unit.ts

La regresión original falló con 429 donde otro enlace debía recibir 200. Tras la
corrección, la suite HTTP del servidor real usa Prisma mock: abuso de un enlace,
rotación, IPv6, tokens inválidos, privacidad, y quinta consulta concurrente
rechazada antes de Prisma; las cuatro anteriores se liberan y una nueva funciona.

tracking-preview-fairness añade seis pruebas: otros enlaces tras abuso; presupuesto
por IP y agregado por proceso; memoria sin evicción y reinicio de ventana; rechazo
sin cola y liberación por éxito/error; desconexión HTTP sin liberar prematuramente;
validación de parámetros. Solo loopback, mocks, promesas controladas y direcciones
de documentación. No son pruebas de rendimiento, infraestructura o WhatsApp real.

El documento CLIENT-IP-REVIEW.md describe el estado auditado previo del PR #5;
esta propuesta 4M cambia específicamente el orden/cobro y añade los techos aquí
explicados, sin modificar ese PR o su rama. Requiere nueva auditoría antes de publicar.