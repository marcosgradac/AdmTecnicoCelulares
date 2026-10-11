# PR #17 — Checklist de integración financiera

Este documento prepara una operación futura. No autoriza merge, despliegue, backup real, acceso a Supabase ni migraciones productivas. Todas las casillas son requisitos pendientes de ejecución supervisada y aprobación independiente.

## Puerta obligatoria: respaldo productivo recuperable

- [ ] Obtener autorización específica del propietario para el primer backup real, tratamiento de datos y prueba de recuperación; generar/custodiar credenciales únicamente dentro de esa autorización. Los tests ficticios aprobados no sustituyen el respaldo productivo.
- [ ] Usar las protecciones de 9A/9B: origen exacto autorizado, exportación deshabilitada por defecto, TLS/certificado/hostname verificados, streaming cifrado y ningún temporal sin cifrar. No imprimir secretos ni datos de usuarios.
- [ ] Completar un respaldo reciente, posterior a la pausa de escrituras y anterior a la migración. Registrar de forma privada hora, versión/esquema, identificador, manifiesto autenticado e integridad; un archivo parcial o una exportación solamente descargada no cuentan como recuperables.
- [ ] Guardar el respaldo y una segunda copia cifrada independiente, con acceso restringido; verificar disponibilidad de la clave fuera de Git y de ambos archivos, sin exponerla. No borrar respaldos previos.
- [ ] Probar la restauración del respaldo a una base local vacía, desechable y verificada, nunca a producción ni a una base remota. Esta prueba con datos reales necesita la autorización y el entorno privado correspondientes; no fue ejecutada en esta tarea.
- [ ] Comparar filas/IDs, dinero entero, clientes, reparaciones, pagos, relaciones, stock, suscripciones, restricciones, índices y migraciones; verificar lecturas funcionales y aislamiento sin enviar correos ni contactar servicios externos. Registrar sólo el resultado y evidencia no sensible.
- [ ] El responsable confirma por escrito que puede recuperar el respaldo y sus claves. **NO-GO para autorizar o ejecutar la migración si falta un respaldo completo cuya recuperación haya sido comprobada.**

## Compatibilidad verificada y límites

Los clientes antiguos no envían `requestId` ni `confirmed` en pagos ordinarios, cancelación o liquidación. Los nuevos endpoints rechazan esos comandos antes de escribir (400). `initial-cost` se retira con 409; un adelanto ya cobrado no se modifica ni se elimina. No hay fallback que invente UUID, infiera que hubo un pago o regenere una solicitud después de una respuesta perdida.

La creación antigua de una reparación no está bloqueada por versión: el presupuesto continúa siendo aceptado como presupuesto, pero ya no genera egresos. No puede asumirse que todos los clientes antiguos están bloqueados ni que todas sus pantallas reflejan el nuevo contrato. Un presupuesto nunca debe convertirse en una compra por compatibilidad.

El frontend nuevo conserva el UUID y payload al reintentar una operación en el mismo diálogo; no hay almacenamiento durable de ese comando a través de recargas. Antes de actualizar se debe resolver cualquier respuesta incierta consultando la evidencia autorizada: nunca repetir el cobro con otro UUID ni asumir que un timeout significa que no se registró. La prueba PostgreSQL confirma rechazo de clientes antiguos sin efectos, repetición idéntica sin duplicación y payload cambiado con 409.

La PWA identifica cada worker/caché con `BUILD_ID` del commit (`vite.config.ts` y `scripts/sw-build-id.mjs`). En `src/pwa/serviceWorkerRegistration.ts`, consulta actualizaciones al registro/carga y cada hora; no hay listener de foco. `UpdateNotice` puede cerrarse y se oculta a los 20 segundos; **no bloquea operaciones**. Sólo «Actualizar ahora» envía `SKIP_WAITING` y habilita una recarga por `controllerchange`. Una pestaña distinta puede recibir el nuevo controlador sin recargar su JavaScript viejo.

`sw.template.js` no intercepta POST ni la API y no tiene una cola de pagos offline. La navegación usa red primero, pero sin conexión puede devolver HTML viejo. El worker elimina sus cachés antiguas al activarse; esto no sustituye la recarga de cada pestaña ni garantiza actualización de un dispositivo desconectado. Actualmente no existe un control remoto obligatorio de versión mínima.

## Ventana y actualización segura de todos los clientes

- [ ] Aprobar una ventana supervisada y asignar responsables. Antes del despliegue, pausar todas las escrituras de negocio, especialmente altas/ediciones financieras, cobros, devoluciones y cancelaciones en todos los dispositivos; esperar las operaciones en curso y resolver respuestas inciertas sin reintentarlas con una identidad nueva.
- [ ] Inventariar navegadores, ventanas, pestañas y PWA instaladas que estén en uso. Cerrar cada sesión de trabajo después de guardar o descartar formularios de forma consciente; no recargar automáticamente una operación en curso. Incluir dispositivos temporalmente offline en el procedimiento de retorno.
- [ ] Confirmar SHA exacto, ambos CI, auditoría y respaldo recuperable; autorizar por separado la integración y migración. No usar el autodespliegue de un merge como sustituto de una ventana coordinada y del gate de respaldo.
- [ ] Dentro de la pausa, aplicar el esquema y backend nuevos antes de habilitar el frontend nuevo; verificar migraciones y contratos. No habilitar una combinación frontend nuevo/backend antiguo, que todavía podría interpretar presupuesto como gasto. Registrar SHA/IDs de cada despliegue bajo la autorización futura.
- [ ] Publicar el frontend correspondiente. No es posible descargar una versión todavía no publicada «antes del despliegue»: la preparación y pausa son previas, y la actualización verificada se completa después de publicar, **antes de reabrir operaciones**.
- [ ] Con conexión, abrir cada cliente y pulsar «Actualizar ahora» si aparece; cerrar todas las pestañas y ventanas de TecnoDesk y reabrirlas. Si el aviso no aparece, solicitar `registration.update()` desde las herramientas del navegador en esa sesión y completar la activación/recarga; comprobar todos los clientes, no sólo la pestaña usada para activar el worker.
- [ ] Si sigue una versión anterior, cerrar todos los clientes del origen, quitar únicamente el registro/cachés de TecnoDesk desde las herramientas del navegador y reabrir online. No borrar localStorage/sesiones indiscriminadamente ni ejecutar acciones financieras para «probar» que actualizó.
- [ ] Verificar online que `/sw.js` tiene el SHA aprobado, el worker activo/cachés llevan ese `BUILD_ID` y cada pestaña carga el HTML y assets nuevos; inspeccionar las cuatro opciones/vista previa y el contrato de solicitudes con cuentas sintéticas autorizadas. El worker nuevo por sí solo no demuestra que el JavaScript de una pestaña sea nuevo.
- [ ] Reabrir operaciones sólo cuando todos los clientes activos estén verificados; un dispositivo pendiente deberá actualizarse antes de volver a trabajar. **NO-GO si no puede imponerse la pausa o verificarse los clientes**; un gate técnico obligatorio requeriría otro cambio revisado, no está implementado en este PR.
- [ ] Confirmar health, CORS, Origin Auth, JWT, rutas públicas y ausencia de errores, más coherencia financiera con fixtures autorizadas. No registrar pagos ficticios en negocios reales.

## Recuperación y preservación

- [ ] Definir previamente responsable, respaldo validado, SHA anterior y criterios de detención. Mantener la pausa si falla una migración o una verificación.
- [ ] No eliminar la migración ni asientos compensatorios para volver atrás. Un binario anterior puede volver a mutar gastos históricos y no entiende el ledger nuevo: **no ejecutar rollback de código con escrituras financieras abiertas**.
- [ ] Recuperar sólo bajo autorización específica, conservando evidencia y movimientos posteriores; la restauración productiva no forma parte del flujo local 9A/9B. No restaurar automáticamente un backup pre-migración sobre dinero registrado después de él. Si hubo escrituras nuevas, exigir conciliación supervisada antes de elegir recuperación.

## Evidencia de esta revisión (sólo local)

La regresión `backend/tests/repair-report-cash-flow.ts` reproduce gasto histórico de 70.000 ayer y corrección sin dinero hoy. Antes de la corrección del código, `finance.timeline.expenses` daba -70.000 hoy. La solución mantiene el movimiento original y los filtros: `expenses` omite `accountingOnly`, `timeline.accountingAdjustment` registra el ajuste por su propia fecha, y los resúmenes preservan `balance` y `accountingAdjustment`. Los gráficos monetarios de hoy deben dar cero ingresos/egresos por esa operación; el período de siete días conserva el gasto de ayer. Caja, dashboard y reportes se comparan en PostgreSQL local.
