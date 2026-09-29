# Costos y adelanto de reparación

## Alcance y decisiones

Implementar en `feature/costos-reparacion`, desde `c5d37ed`, sin commit, push ni deploy.
El total se sugiere como costo más mano de obra, con edición independiente aprobada por el usuario.
`partsCost` conserva el costo; `laborCharge` representa ingreso incluido en `total`, nunca un gasto ni ingreso adicional.
`laborCost` histórico mantiene su significado de costo. Ganancia estimada: total menos partsCost y laborCost.
El adelanto es un Payment identificado como tal, integra paid y el historial normal; no afecta la ganancia.
El costo genera un EXPENSE REPAIR sin inventar un medio de pago. Un vínculo explícito identifica el egreso ya representado en partsCost.
Reports mantiene sus períodos actuales: reparaciones por fecha de creación, pagos y caja por fecha de movimiento. El egreso vinculado no vuelve a descontarse de la ganancia de reparaciones no canceladas; sigue visible en los gastos de Caja.
No se deducen asociaciones históricas por importe o descripción; los egresos sin vínculo siguen siendo gastos independientes.

## Implementación y verificación

- [x] Prueba HTTP con datos reales PostgreSQL: reproducción del costo/adelanto ignorado antes del cambio.
- [x] Esquemas PostgreSQL y SQLite, migraciones aditivas: laborCharge, vínculo único al costo de Caja, Payment.isAdvance; SQLite también incorpora los costos históricos que faltan en su esquema reducido.
- [x] Helper financiero transaccional y validación de montos; integrar en POST /repairs y devolver el historial completo.
- [x] Reports: identificar el egreso vinculado, conservar los gastos de Caja y descontar el costo exactamente una vez.
- [x] Formulario, tipos, mapeo y detalle: costo, mano de obra, total editable, adelanto, método condicional y resumen.
- [x] Tests de adelanto cero/parcial/total, montos inválidos, pago posterior, business, tracking público, rollback con fallo real de base de datos, períodos de Reports, gastos independientes y migraciones SQLite.
- [x] Frontend y backend: typecheck/build; pruebas de creación, reports, pagos, cancelación, numeración y SQLite; revisión visual del formulario/detalle.

## Riesgos a comprobar

- El costo no se identifica por descripción: un gasto independiente del mismo importe también debe descontarse.
- Cambiar el total no puede provocar que el adelanto lo supere ni sumar dos veces laborCharge.
- Un fallo al insertar el ingreso debe revertir también el egreso, el Payment, el Repair y su número.
- Un cliente de otro business nunca genera reparación ni movimientos.
- El seguimiento público no revela costo, mano de obra interna ni ganancia.

## Resultado final

Frontend y backend: typecheck y build correctos. Vite informa únicamente el aviso de chunks mayores a 500 kB.
Pasaron las pruebas PostgreSQL de creación financiera, reports, simplified-repairs, repair-cancellation, repair-numbering y cash-pagination, además de las migraciones y transacciones SQLite.
Flujo real de navegador verificado a 1440 y 375 px: total sugerido/editable, adelanto, detalle, historial y pago posterior; sin overflow ni errores de consola.
Las migraciones se aplicaron solo a la base local aislada de tests. La generación conjunta Prisma encontró un bloqueo de la DLL Windows por un proceso existente; los tipos y cliente actualizados se verificaron con typecheck y pruebas reales, y la generación SQLite pasó.
Sin commit, push ni deploy. Main permanece en c5d37edb8e6ca3e2674b570daf97f62dba471af6.
