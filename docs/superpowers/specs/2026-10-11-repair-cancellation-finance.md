# Cancelaciones: presupuesto, dinero real y conciliación

Base: `10bc148f5992c22b313388183bfe23ffc3f67296`. Diseño funcional aprobado por el propietario el 2026-10-11. Autoriza implementar después de validar esta especificación; no autoriza merge, despliegue, acceso a Supabase ni cambios productivos.

## Causa y decisión

`recordInitialRepairFinance` convierte `partsCost` en egreso sin confirmación de compra. `correctInitialRepairCost` modifica o elimina ese egreso. La cancelación liquida al cliente, pero no concilia gastos; su resumen ignora los egresos. Reportes toma ingresos de Payment, mientras Caja y dashboard usan CashMovement.

Se mantiene CashMovement como libro de movimientos, incorporando una clasificación explícita para compensaciones. Una corrección de un gasto inexistente es un asiento EXPENSE negativo, identificado como `accountingOnly`, sin medio de pago: reduce egresos registrados y **jamás** aumenta ingresos o se presenta como dinero recibido. Una devolución de proveedor es un INCOME positivo, confirmado y con medio de pago. Ambos se vinculan por ID al egreso original, con motivo, autor y fecha de registro. Esta opción conserva las consultas por período y evita un segundo libro que cada consumidor pudiera olvidar. No se cambian importes, fechas ni vínculos de movimientos originales.

## Presupuesto y operaciones

`Repair.partsCost` conserva el presupuesto del repuesto; las nuevas reparaciones se identifican con `financeVersion=2`. Cargar o editar ese presupuesto no produce Caja. Un gasto efectivo separado requiere importe positivo, medio de pago y confirmación explícita. Se pueden registrar varios gastos; la cancelación recibe decisiones por movimiento, no deduce compras de una descripción.

Los egresos históricos sin clasificación quedan `LEGACY/pendiente de conciliación`: no se convierten ni se compensan automáticamente. El usuario financiero puede atribuir explícitamente un egreso de su reparación a compra real o error de registro. Toda corrección requiere motivo y confirmación de que el dinero nunca salió; no se admite corregir un pago, devolución, garantía ni compensación como si fuera compra. El importe recuperado/corregido acumulado no puede superar el egreso original. Operaciones y respuestas siempre se limitan por businessId.

## Cancelación y liquidación

Vista previa calculada en el servidor y revisada nuevamente dentro de una transacción con bloqueo de la reparación. Cuatro opciones: sin compra, recuperación total, conservar gasto, recuperación parcial. Una selección no confirma dinero: recuperaciones y devolución al cliente requieren casilla explícita y método. Repuesto conservado para stock es un destino físico documentado; no crea ingresos ni modifica cantidades. Sin una relación comprobada con inventario no se simula una transferencia a stock. El uso posterior no vuelve a registrar compra por el mero costo del artículo.

La revisión conserva cobros anteriores. El saldo por cobrar es máximo(0, tarifa de revisión - pagos anteriores aplicables - cobros posteriores de revisión). No se crean ingresos por una tarifa pendiente. Si el adelanto supera la revisión, la devolución real se registra una vez; se puede cancelar dejando una devolución pendiente y registrarla después, con fecha de realización. Los cobros de revisión y la devolución pendiente tienen operaciones explícitas idempotentes. Una devolución histórica efectivamente registrada no se borra ni repite.

Cancelar y las operaciones financieras usan un `requestId` de cliente (UUID), bloqueo de Repair y comprobación del mismo payload ante reintento. Igual identificador con contenido distinto devuelve 409. Pagos ordinarios toman el mismo bloqueo antes de leer saldos; un pago concurrente no puede escapar de la liquidación. No se permite borrar una reparación CANCELLED, aunque no tenga importe.

## Vistas y períodos

Un resumen financiero común expone cobros reales, devolución al cliente, gasto bruto, recuperación de proveedor, correcciones sin dinero, costo neto, caja neta, revisión pendiente y devolución pendiente. Caja incluye canceladas con etiqueta, cliente, equipo y detalle expandible. Una cancelada sin movimientos también puede mostrarse como neto 0 dentro de su período.

Caja General, Caja de Reparaciones, dashboard y reportes muestran tres conceptos explícitos: flujo registrado de dinero (excluye accountingOnly), ajuste sin dinero, y saldo conciliado (incluye el ajuste). Una corrección hoy de un error de ayer no es flujo positivo de dinero hoy. Los gráficos de flujo excluyen ajustes; el saldo conciliado los identifica por separado. Reportes conserva facturación/ganancia estimada como indicadores distintos de caja neta; el presupuesto no es costo real y las canceladas no son entregadas. Recuperaciones no se cuentan como pagos de clientes. Las operaciones posteriores pertenecen a su fecha real de registro y no reescriben períodos anteriores.

La edición del presupuesto no toca el gasto. Los flujos antiguos que corrigen gastos mediante update/delete se sustituyen por operaciones trazables. Los cobros reales no se eliminan para ajustar el adelanto; la edición de un adelanto ya registrado se bloquea y remite a la liquidación explícita, conservando pagos posteriores.

## Migración y despliegue pendiente

Migración aditiva en PostgreSQL y esquema SQLite: campos nullable de clasificación/vínculo/motivo/autor/idempotencia en CashMovement; versión financiera y datos idempotentes de cancelación en Repair. Defaults mantienen movimientos existentes sin alterarlos. Relaciones compensatorias impiden borrar originales y se validan dentro del mismo taller. No hay UPDATE retroactivo ni backfill que adivine operaciones.

Antes de desplegar se necesita aprobación independiente para aplicar la migración: el launcher actual ejecuta migrate deploy. Orden futuro: respaldo autorizado independiente, migración aditiva, backend, frontend; comprobar compatibilidad de cliente antiguo (un presupuesto sin confirmación no genera gasto), conciliación de muestra sintética y rollback de aplicación sin borrar nuevas operaciones. No se propone revertir el esquema eliminando historial.

## Pruebas y aceptación

Primero regresiones que fallen contra la base actual, luego implementación. PostgreSQL local nuevo, loopback, credenciales ficticias, dotenv deshabilitado; ningún test usa la configuración de producción. Casos A–F: 0, +20000, -10000, 0, -30000, 0. Agregar revisión parcial, pagos múltiples/medios mixtos, devolución pendiente, gastos previos, recuperación/corrección en período posterior, historial ambiguo, stock sin cambio, doble clic, concurrencia pago/cancelación/recuperación, fallo de transacción, permisos y aislamiento.

Pruebas frontend ejercitan decisiones, confirmaciones, importes y vista previa. Compilación de ambos proyectos, CI de ambos y revisión independiente antes de un único PR borrador. No hay intervención en infraestructura ni datos reales.

## Validación contra reglas del propietario

1–3: presupuesto separado; compra confirmada; corrección sin ingreso ficticio y devolución real tipada.
4–6: revisión y deuda preservadas; stock explícito sin automatismo; A–F cubiertos.
7–8: historial append-only, vistas compatibles, fechas intactas, tenant/permisos/locks/idempotencia.
9: migración únicamente en repo/local, tests y auditoría, un PR draft; producción fuera de alcance.

## Hallazgos de revisión independiente incorporados

- Sin signo negativo externo: importe solicitado positivo; únicamente el servidor genera EXPENSE negativo accountingOnly, sin método, con motivo y vínculo al original. El ingreso real nunca incluye correcciones.
- Escritura financiera requiere repairs.viewFinancials y cash.create (OWNER conserva acceso); cancelación además repairs.changeStatus.
- Decisiones sin asiento (conservar gasto/destino stock) e idempotencia se persisten en Repair.cancellationRequestId/Payload y en historial con autor.
- Pagos históricos sin vínculo de Caja comprobable o paid discrepante bloquean liquidación; no se reconstruye dinero.
- Dashboard-cash excluye ajustes del gráfico; Reportes incluye deuda de revisión y separa caja neta de ganancia estimada.

## Compatibilidad y límites concretos

Los cobros ordinarios ahora exigen UUID y confirmación: un cliente antiguo sin esos campos recibe 400 y debe actualizarse; no se infiere idempotencia de importes o fechas. Un presupuesto enviado por un cliente antiguo jamás produce gasto. El endpoint destructivo initial-cost responde 409; un adelanto existente no se modifica ni elimina. El frontend actualizado ofrece compra, compensación y devolución explícitas.

Reportes reconoce costos registrados por evidencia del ledger, con límite temporal para que una compensación posterior no altere costos de períodos anteriores. El contador unclassifiedExpenses identifica egresos históricos sin clasificación tipada individual; las decisiones explícitas de cancelación se consultan en su historial; ni el presupuesto ni una descripción prueban una compra. Facturación/rentabilidad estimada siguen siendo indicadores distintos del saldo de Caja; los saldos pendientes son el estado actual de las órdenes, no un balance histórico congelado.

SQLite conserva filas al reconstruir únicamente CashMovement para incorporar la relación compuesta y los checks. La migración se prueba sobre la cadena local completa; no se aplicó a bases existentes fuera del test. Todos los resultados monetarios previos y fechas de sus movimientos se preservan.

## Evidencia de revisión y pruebas locales

Auditoría independiente final: no quedan hallazgos críticos o importantes demostrados. Se corrigieron UUID/confirmación obligatorios, reintentos tras respuesta perdida, presupuesto usado indebidamente como costo, corte temporal de compensaciones y el tratamiento NULL de los CHECK. SQLite conserva en la prueba permanente los vínculos de gastos, ingresos y Payment existentes antes de la redefinición.

Casos A–F: 0, +20000, -10000, 0, -30000 y 0. Se ejercitan deuda de revisión, devolución pendiente, recuperaciones parciales, conservación para stock sin inventario automático, originales inmutables, fechas, respuesta perdida, concurrencia pago/cancelación y rollback transaccional por fallo de historial. Aislamiento: 357 comprobaciones HTTP; permisos: 312; sesiones: 90, sin fallos.

Las regresiones de backups 9A/9B restauraron únicamente clústeres locales propios con 26 modelos ficticios y compararon filas, importes, relaciones, restricciones y migraciones. Streaming ficticio de 172295404 bytes: RSS máximo de backup 78008320 y restauración 76926976 bytes; ninguna conexión productiva. Esta tarea no añade ni activa automatizaciones de backup.

La validación visual usa servidores locales y respuestas sintéticas; los tests unitarios de UI verifican presupuesto separado de compra, confirmación real, vista previa, cuatro opciones y reintentos con UUID estable. Los avisos de chunks grandes y service worker en modo desarrollo son límites preexistentes de herramientas. El resultado final de ambos jobs de CI debe confirmarse en el PR antes de cualquier futura autorización de integración.

Resultado final local: 16 suites financieras, compilación/typecheck de backend y frontend, UI financiera, 9 grupos de XSS/recuperación, CSP y 21 controles visuales de sesiones aprobados. El primer timeout de carga visual no se reprodujo al ejecutar la suite aislada. CI incluye automáticamente las regresiones nuevas, siempre sobre bases locales ficticias.
