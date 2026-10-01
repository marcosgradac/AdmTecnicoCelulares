// Ejercita la tabla agrupada de caja de reparaciones sin navegador ni DOM.
// No es una prueba visual: verifica estructura de tabla, alineación, expansión y accesibilidad.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('../node_modules/typescript')

function harness(file, exportName, props = {}, viewport = {}) {
  const slots = [], effects = []
  let cursor = 0, dirty = true, tree
  const react = {
    useState(initial) {
      const i = cursor++
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial
      return [slots[i], value => { const next = typeof value === 'function' ? value(slots[i]) : value; if (!Object.is(next, slots[i])) { slots[i] = next; dirty = true } }]
    },
    useEffect(fn, deps) {
      const i = cursor++, previous = slots[i]
      if (!previous || deps.some((value, j) => !Object.is(value, previous.deps[j]))) { previous?.cleanup?.(); slots[i] = { deps }; effects.push(() => { slots[i].cleanup = fn() }) }
    },
  }
  // Los componentes locales se invocan al vuelo para que el sandbox vea el árbol completo.
  const jsx = (type, props) => (typeof type === 'function' ? type(props ?? {}) : { type, props })
  const exports = {}
  const modules = {}
  const compile = target => ts.transpileModule(fs.readFileSync(target, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const sandbox = {
    exports,
    require(name) {
      if (name === 'react') return { ...react, Fragment: 'Fragment', createContext: () => ({ Provider: 'Provider', Consumer: 'Consumer' }) }
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' }
      // Los componentes de MUI se sustituyen por su nombre; las props llegan intactas.
      if (name === '@mui/material') return new Proxy({}, {
        get: (_, key) => {
          if (key === 'useMediaQuery') return () => Boolean(viewport.mobile)
          if (key === 'useTheme') return () => ({ breakpoints: { down: () => false } })
          return String(key)
        },
      })
      if (name === '@mui/icons-material') return new Proxy({}, { get: (_, key) => String(key) })
      if (name.endsWith('/theme/tokens')) return { TABLE_BORDER: '#EEF0F5' }
      if (name.endsWith('/utils/format')) return {
        formatMoney: value => `$${value}`,
        formatShortDate: value => String(value).slice(0, 10),
        formatShortTime: value => String(value).slice(11, 16),
      }
      // Los componentes del propio proyecto se cargan de verdad para ver el árbol completo.
      // Cada módulo corre en SU PROPIO contexto: el código transpilado lee `exports` al
      // invocarse, no al importarse, así que un `exports` compartido y reciclado llegaría vacío.
      if (name.startsWith('.')) {
        const target = path.resolve(path.dirname(path.resolve(__dirname, '..', file)), `${name}.tsx`)
        if (modules[target]) return modules[target]
        const loaded = {}
        modules[target] = loaded
        vm.runInNewContext(compile(target), Object.assign(Object.create(null), sandbox, { exports: loaded }))
        return loaded
      }
      return new Proxy({}, { get: (_, key) => key })
    },
  }
  vm.runInNewContext(compile(path.resolve(__dirname, '..', file)), Object.assign(Object.create(null), sandbox, { exports }))
  const Component = exports[exportName]
  async function settle() {
    for (let round = 0; round < 30; round++) {
      if (dirty) { dirty = false; cursor = 0; tree = Component(props); while (effects.length) effects.shift()() }
      await new Promise(setImmediate)
      if (!dirty && !effects.length) return
    }
    throw new Error('Repeated effect/render loop')
  }
  return { settle, root: () => tree }
}

function collect(node, predicate, found = []) {
  if (!node || typeof node !== 'object') return found
  if (predicate(node)) found.push(node)
  for (const value of Object.values(node)) collect(value, predicate, found)
  return found
}

const movement = (over = {}) => ({ id: 'm1', type: 'INCOME', description: 'Adelanto', amount: 30000, method: 'CASH', createdAt: '2026-09-30T00:42:00.000Z', repairId: 'r1', clientName: 'Bruno Acosta', origin: 'REPAIR', ...over })
const group = (over = {}) => ({
  repairId: 'r1', repairNumber: 1033, clientName: 'Bruno Acosta', deviceBrand: 'Samsung', deviceModel: 'F3',
  income: 60000, expense: 30000, net: 30000, movementCount: 3, lastMovementAt: '2026-09-30T00:42:00.000Z',
  movements: [
    movement(),
    movement({ id: 'm2', description: 'Pago reparación #1033', amount: 30000 }),
    movement({ id: 'm3', type: 'EXPENSE', description: 'Costo inicial', amount: 30000, method: null }),
  ],
  ...over,
})

async function main() {
  const view = harness('src/components/cash/RepairCashGroupsList.tsx', 'RepairCashGroupsList', { groups: [group()], loose: null })
  await view.settle()
  const headers = () => collect(view.root(), node => node.type === 'Box' && node.props?.component === 'button')
  const collapses = () => collect(view.root(), node => node.type === 'Collapse')
  const rows = () => collect(view.root(), node => node.type === 'TableRow')
  const cells = row => collect(row, node => node.type === 'TableCell')
  const click = node => node.props.onClick({ stopPropagation: () => {} })
  // En el navegador el Collapse desmonta el detalle; acá se construye igual, así que las filas
  // se distinguen por estructura: la principal tiene ocho celdas y la de detalle una sola con colSpan.
  const bodyRows = () => rows().filter(row => collect(row, node => node.type === 'Box' && node.props?.component === 'button').length > 0)
  const detailCellOf = row => {
    const child = row.props?.children
    return child && !Array.isArray(child) && child.type === 'TableCell' && child.props?.colSpan === 8 ? child : null
  }
  const detailRows = () => rows().filter(row => detailCellOf(row) !== null)

  // 1. El nivel principal es una tabla real con las columnas pedidas y una fila por reparación.
  const table = collect(view.root(), node => node.type === 'Table')[0]
  assert.ok(table, 'el nivel principal es una tabla')
  assert.equal(table.props['aria-label'], 'Caja de reparaciones agrupada por reparación')
  const headText = JSON.stringify(rows()[0])
  for (const label of ['Reparación', 'Cliente / equipo', 'Movimientos', 'Ingresos', 'Egresos', 'Neto', 'Última actividad']) {
    assert.ok(headText.includes(label), `la tabla tiene la columna ${label}`)
  }
  assert.equal(bodyRows().length, 1, 'una fila principal por reparación')
  assert.equal(detailRows().length, 1, 'y una fila de detalle plegable')

  // 2. Contenido de la fila principal: cada dato en su propia celda.
  const [header] = headers()
  assert.ok(header, 'la reparación se muestra como una fila activable')
  assert.equal(header.props.children.props.children, 'Reparación #1033', 'la columna Reparación muestra el número')
  const mainRow = bodyRows()[0]
  const rowText = JSON.stringify(mainRow)
  assert.ok(rowText.includes('Bruno Acosta'), 'la columna Cliente / equipo muestra el cliente')
  assert.ok(rowText.includes('Samsung F3'), 'y debajo el equipo')
  assert.ok(rowText.includes('3 movimientos'), 'la columna Movimientos usa un badge')
  assert.ok(rowText.includes('+$60000') && rowText.includes('−$30000') && rowText.includes('+$30000'), 'las columnas de importes muestran ingresos, egresos y neto')
  assert.ok(rowText.includes('2026-09-30'), 'la columna Úaltima actividad muestra la fecha')
  assert.ok(rowText.includes('00:42'), 'y la hora como texto secundario')
  assert.equal(cells(mainRow).length, 8, 'la fila principal tiene las ocho celdas')
  assert.equal(cells(mainRow).filter(cell => cell.props.align === 'right').length, 4, 'ingresos, egresos, neto y chevron van alineados a la derecha')

  // 3. Importes con dígitos de ancho fijo para que las columnas queden parejas.
  // Importes con dígitos de ancho fijo: + verde/rojo con signo menos tipográfico.
  const amounts = collect(mainRow, node => node.type === 'Typography' && typeof node.props?.children === 'string' && /^[+−]\$/.test(node.props.children))
  assert.equal(amounts.length, 3, 'ingresos, egresos y neto')
  for (const amount of amounts) assert.equal(amount.props.sx.fontVariantNumeric, 'tabular-nums', 'los importes usan tabular-nums')

  // 4. Accesibilidad: el botón de la fila declara el estado y define foco visible.
  assert.equal(header.props.type, 'button', 'la fila es activable por teclado')
  assert.equal(header.props['aria-expanded'], false, 'arranca plegada y lo declara')
  assert.ok(String(header.props.sx.cursor).includes('pointer'), 'informa que es clickeable')
  assert.ok(JSON.stringify(header.props.sx).includes('focus-visible'), 'define foco visible')
  assert.equal(mainRow.props.sx.cursor, 'pointer', 'la fila completa es clickeable con el mouse')

  // 5. El detalle se despliega en una fila propia que abarca todas las columnas.
  const detailCell = detailCellOf(detailRows()[0])
  assert.equal(detailCell.props.colSpan, 8, 'el detalle cruza la tabla con colSpan')
  assert.equal(collapses()[0].props.in, false, 'el grupo arranca plegado')
  assert.equal(collapses()[0].props.unmountOnExit, true, 'al plegar, los movimientos se desmontan')
  // El botón detiene la propagación para no togglear dos veces al clickear.
  let stopped = false
  header.props.onClick({ stopPropagation: () => { stopped = true } })
  await view.settle()
  assert.equal(stopped, true, 'el botón detiene la propagación hacia la fila')
  assert.equal(headers()[0].props['aria-expanded'], true, 'y el grupo queda abierto')
  assert.equal(collapses()[0].props.in, true, 'el grupo queda desplegado')
  const expanded = JSON.stringify(view.root())
  assert.ok(expanded.includes('Adelanto') && expanded.includes('Costo inicial'), 'aparecen los movimientos individuales')
  assert.ok(expanded.includes('Efectivo'), 'muestra el medio de pago')
  assert.ok(expanded.includes('Sin medio informado'), 'distingue el movimiento sin medio informado')
  assert.ok(expanded.includes('Ingreso') && expanded.includes('Egreso'), 'distingue ingresos de egresos')
  assert.ok(expanded.includes('Movimiento') && expanded.includes('Medio de pago') && expanded.includes('Fecha') && expanded.includes('Hora') && expanded.includes('Importe'), 'el detalle conserva la tabla de movimientos')
  // El detalle no repite los totales que ya están en la fila principal.
  const detailText = JSON.stringify(detailCell)
  assert.ok(!detailText.includes('>Ingresos<') && !detailText.includes('>Egresos<') && !detailText.includes('>Neto<'), 'el detalle no repite los totales del encabezado')

  // 6. Cerrar vuelve a la fila resumen.
  click(headers()[0])
  await view.settle()
  assert.equal(headers()[0].props['aria-expanded'], false, 'se puede volver a plegar')
  assert.equal(collapses()[0].props.in, false, 'al plegar se ocultan los movimientos')
  // 7. Dos reparaciones quedan alineadas en la misma tabla y se despliegan por separado.
  const two = harness('src/components/cash/RepairCashGroupsList.tsx', 'RepairCashGroupsList', {
    groups: [group(), group({ repairId: 'r2', repairNumber: 1032, clientName: 'Agustina Torres', deviceModel: 'A22', income: 40000, expense: 30000, net: 10000, movements: [movement({ id: 'm4', repairId: 'r2', amount: 40000 })] })],
    loose: null,
  })
  await two.settle()
  const twoRows = () => collect(two.root(), node => node.type === 'TableRow')
  const twoBodyRows = () => twoRows().filter(row => collect(row, node => node.type === 'Box' && node.props?.component === 'button').length > 0)
  const twoDetailRows = () => twoRows().filter(row => detailCellOf(row) !== null)
  assert.equal(twoBodyRows().length, 2, 'dos reparaciones son dos filas principales')
  assert.equal(twoDetailRows().length, 2, 'cada una con su fila de detalle')
  // Una sola tabla principal contiene todas las reparaciones: eso es lo que alinea las columnas.
  // Las tablas de detalle se cuentan aparte porque el sandbox las construye aunque estén plegadas.
  const mainTables = root => collect(root, node => node.type === 'Table' && node.props['aria-label'] === 'Caja de reparaciones agrupada por reparación')
  const bodyRowsOf = root => collect(root, node => node.type === 'TableRow').filter(row => collect(row, node => node.type === 'Box' && node.props?.component === 'button').length > 0)
  assert.equal(mainTables(two.root()).length, 1, 'ambas reparaciones comparten la misma tabla: las columnas quedan alineadas')
  const twoHeaders = () => collect(two.root(), node => node.type === 'Box' && node.props?.component === 'button')
  assert.equal(twoHeaders().length, 2, 'cada reparación tiene su fila')
  assert.deepEqual(twoHeaders().map(node => node.props.children.props.children), ['Reparación #1033', 'Reparación #1032'], 'en el orden que llegan del backend')
  assert.deepEqual(twoHeaders().map(node => node.props['aria-expanded']), [false, false], 'ambas arrancan plegadas')
  click(twoHeaders()[1])
  await two.settle()
  assert.deepEqual(collect(two.root(), node => node.type === 'Box' && node.props?.component === 'button').map(node => node.props['aria-expanded']), [false, true], 'desplegar una no despliega la otra')
  for (const row of twoBodyRows()) assert.equal(cells(row).length, 8, 'todas las filas principales tienen la misma cantidad de celdas')

  // 8. La tabla secundaria es un componente propio: título exacto y contenido manual.
  const looseBlock = { income: 7000, expense: 2000, net: 5000, movementCount: 1, lastMovementAt: '2026-09-30T00:42:00.000Z', movements: [movement({ id: 'l1', repairId: null, description: 'Ajuste manual sin orden' })] }
  const loose = harness('src/components/cash/LooseMovementsTable.tsx', 'LooseMovementsTable', { loose: looseBlock })
  await loose.settle()
  const looseText = JSON.stringify(loose.root())
  assert.ok(looseText.includes('Otros movimientos'), 'los movimientos manuales tienen su propia tabla')
  assert.ok(!looseText.includes('Otros movimientos de reparaciones'), 'el título no lleva el nombre de la caja')
  assert.ok(!looseText.includes('Otros movimientos de reventa') && !looseText.includes('Otros movimientos de comercio'), 'ni el de ninguna otra caja')
  assert.equal(collect(loose.root(), node => node.type === 'Table' && node.props['aria-label'] === 'Otros movimientos de caja').length, 1, 'la tabla secundaria se dibuja cuando hay manuales')
  assert.ok(looseText.includes('Ajuste manual sin orden'), 'el movimiento manual se ve sin desplegar nada')
  assert.ok(looseText.includes('Efectivo') && looseText.includes('2026-09-30'), 'con medio de pago y fecha')
  // 7 bis. Caja General muestra nombres humanos en la columna Origen, nunca el enum crudo.
  // Las dos tablas (principal y secundaria) traducen el origen igual.
  const humanOrigins = [
    ['EQUIPMENT', 'Reventa de equipos'], ['REPAIR', 'Reparaciones'],
    ['COMMERCE', 'Comercio'], ['GENERAL', 'General'],
  ]
  for (const [enumValue, label] of humanOrigins) {
    const mainWithOrigin = harness('src/components/admin/CashMovementList.tsx', 'CashMovementList', { movements: [{ ...movement({ id: 'o' + enumValue }), origin: enumValue }], showOrigin: true })
    await mainWithOrigin.settle()
    const mainOriginText = JSON.stringify(mainWithOrigin.root())
    assert.ok(mainOriginText.includes(label), `la tabla principal muestra "${label}"`)
    assert.ok(!mainOriginText.includes('"' + enumValue + '"'), `y nunca el enum ${enumValue}`)

    const looseWithOrigin = harness('src/components/cash/LooseMovementsTable.tsx', 'LooseMovementsTable', { loose: { ...looseBlock, movements: [{ ...movement({ id: 'p' + enumValue, repairId: null }), origin: enumValue }] }, showOrigin: true })
    await looseWithOrigin.settle()
    const looseOriginText = JSON.stringify(looseWithOrigin.root())
    assert.ok(looseOriginText.includes(label), `la tabla de otros también muestra "${label}"`)
    assert.ok(!looseOriginText.includes('"' + enumValue + '"'), `y tampoco el enum ${enumValue}`)
  }

  // La tabla principal de reparaciones nunca muestra una fila genérica de movimientos sueltos.
  const mixed = harness('src/components/cash/RepairCashGroupsList.tsx', 'RepairCashGroupsList', { groups: [group()] })
  await mixed.settle()
  assert.equal(mainTables(mixed.root()).length, 1, 'con reparaciones hay una sola tabla principal')
  assert.equal(bodyRowsOf(mixed.root()).length, 1, 'y una sola fila: la de la reparación')
  assert.ok(JSON.stringify(mainTables(mixed.root())[0]).includes('Reparación #1033'), 'la fila genérica de otros movimientos no está en la tabla principal')

  // 9. Sin movimientos manuales la tabla NO desaparece: conserva encabezado y muestra el estado
  // vacío dentro del cuerpo, con el colSpan de todas sus columnas.
  const empty = harness('src/components/cash/LooseMovementsTable.tsx', 'LooseMovementsTable', { loose: { income: 0, expense: 0, net: 0, movementCount: 0, lastMovementAt: '', movements: [] } })
  await empty.settle()
  const emptyText = JSON.stringify(empty.root())
  assert.ok(emptyText.includes('Otros movimientos'), 'la tabla secundaria sigue presente aunque esté vacía')
  assert.equal(collect(empty.root(), node => node.type === 'Table' && node.props['aria-label'] === 'Otros movimientos de caja').length, 1, 'la tabla se sigue dibujando')
  const emptyHead = JSON.stringify(collect(empty.root(), node => node.type === 'TableHead'))
  for (const column of ['Movimiento', 'Medio de pago', 'Fecha', 'Hora', 'Tipo', 'Importe']) {
    assert.ok(emptyHead.includes(column), `el encabezado conserva la columna ${column}`)
  }
  const emptyCells = collect(empty.root(), node => node.type === 'TableCell' && node.props?.colSpan === 6)
  assert.equal(emptyCells.length, 1, 'el estado vacío ocupa el ancho de las seis columnas con colSpan')
  assert.ok(emptyText.includes('No hay movimientos manuales para mostrar.'), 'muestra el empty state con el texto acordado')
  assert.ok(emptyText.includes('Los ingresos y egresos cargados manualmente aparecerán acá.'), 'y el texto secundario')

  // 10. En mobile no se usa la tabla horizontal: se mantienen las tarjetas.
  const card = harness('src/components/cash/RepairCashGroupsList.tsx', 'RepairCashGroupsList', { groups: [group()] }, { mobile: true })
  await card.settle()
  assert.equal(collect(card.root(), node => node.type === 'Table').length, 0, 'en mobile no hay tabla')
  assert.equal(collect(card.root(), node => node.type === 'Box' && node.props?.component === 'article').length, 1, 'en mobile se usa una tarjeta por reparación')
  const cardText = JSON.stringify(card.root())
  assert.ok(cardText.includes('Reparación #1033') && cardText.includes('Ingresos') && cardText.includes('Egresos') && cardText.includes('Neto'), 'la tarjeta conserva los totales')

  // 11. La tabla secundaria por sí sola: título exacto y color principal, y empty state aunque
  // no llegue ningún bloque (`null` o vacío) desde el backend.
  const looseFile = 'src/components/cash/LooseMovementsTable.tsx'
  const titles = root => collect(root, node => node.type === 'Typography' && node.props?.variant === 'h2')
  const looseTable = root => collect(root, node => node.type === 'Table' && node.props['aria-label'] === 'Otros movimientos de caja')

  for (const props of [{}, { loose: null }, { loose: { income: 0, expense: 0, net: 0, movementCount: 0, lastMovementAt: '', movements: [] } }]) {
    const bare = harness(looseFile, 'LooseMovementsTable', props)
    await bare.settle()
    const [title] = titles(bare.root())
    assert.equal(title?.props?.children, 'Otros movimientos', 'el título es exactamente "Otros movimientos"')
    assert.equal(title?.props?.color, 'primary.main', 'y usa el color principal de TecnoDesk')
    assert.equal(looseTable(bare.root()).length, 1, 'sin movimientos la tabla sigue dibujándose')
    const text = JSON.stringify(bare.root())
    assert.ok(text.includes('No hay movimientos manuales para mostrar.'), 'y con el empty state adentro')
    assert.ok(text.includes('Los ingresos y egresos cargados manualmente aparecerán acá.'), 'con su texto secundario')
  }
  // En mobile tampoco hay tabla horizontal para la sección secundaria.
  const looseMobile = harness(looseFile, 'LooseMovementsTable', { loose: looseBlock }, { mobile: true })
  await looseMobile.settle()
  assert.equal(looseTable(looseMobile.root()).length, 0, 'en mobile la tabla secundaria son tarjetas')
  assert.ok(JSON.stringify(looseMobile.root()).includes('Ajuste manual sin orden'), 'con el movimiento visible')

  // 12. Las dos tablas comparten tokens: mismo encabezado, bordes y alto de fila. Por eso la
  // principal y la secundaria se leen como tablas hermanas y no como dos diseños distintos.
  const mainTable = harness('src/components/admin/CashMovementList.tsx', 'CashMovementList', { movements: [{ ...movement(), clientName: 'Bruno Acosta', resaleDeviceId: null }], showOrigin: false })
  await mainTable.settle()
  const sharedTableSx = root => JSON.stringify(collect(root, node => node.type === 'Table')[0]?.props?.sx)
  const looseTableSx = sharedTableSx(loose.root())
  assert.equal(sharedTableSx(mainTable.root()), looseTableSx, 'la tabla principal y la secundaria comparten exactamente el mismo estilo')
  assert.ok(looseTableSx.includes('MuiTableBodyCell-root'), 'incluye el alto de fila común')

  // 13. La tabla principal de cada caja tampoco desaparece cuando no hay datos: mantiene su
  // encabezado y muestra el estado vacío dentro del cuerpo.
  for (const [file, exportName, props, colSpan] of [
    ['src/components/admin/CashMovementList.tsx', 'CashMovementList', { movements: [], showOrigin: false }, 6],
    ['src/components/cash/RepairCashGroupsList.tsx', 'RepairCashGroupsList', { groups: [] }, 8],
  ]) {
    const blank = harness(file, exportName, props)
    await blank.settle()
    const tables = collect(blank.root(), node => node.type === 'Table')
    assert.equal(tables.length, 1, `${exportName}: la tabla principal se sigue dibujando sin datos`)
    assert.ok(JSON.stringify(collect(blank.root(), node => node.type === 'TableHead')).length > 10, `${exportName}: conserva su encabezado`)
    assert.equal(collect(blank.root(), node => node.type === 'TableCell' && node.props?.colSpan === colSpan).length, 1, `${exportName}: el estado vacío ocupa el ancho de sus ${colSpan} columnas`)
  }

  // 14. La línea auxiliar del panel es opcional: sólo la usa la caja que la pide. Con `hint`
  // aparece como caption discreto debajo del subtítulo; sin `hint`, no queda nada.
  const panelFile = 'src/components/cash/cashTableTokens.tsx'
  const panelOf = async hint => {
    const view = harness(panelFile, 'CashTablePanel', { title: 'Últimos movimientos', description: 'Movimientos vinculados a reparaciones · hoy', ...(hint ? { hint } : {}), children: null })
    await view.settle()
    return view.root()
  }
  const withHint = JSON.stringify(await panelOf('Una fila por reparación, ordenada por actividad reciente.'))
  assert.ok(withHint.includes('Una fila por reparación, ordenada por actividad reciente.'), 'el panel muestra la línea auxiliar cuando se le pasa')
  const withoutHint = JSON.stringify(await panelOf(undefined))
  assert.ok(!withoutHint.includes('Una fila por reparación'), 'y no muestra nada cuando no se le pasa')
  // La línea auxiliar se pinta como caption en secondary, más discreta que el subtítulo.
  const caption = collect(await panelOf('Una fila por reparación, ordenada por actividad reciente.'), node => node.type === 'Typography' && node.props?.variant === 'caption')
  assert.equal(caption.length, 1, 'la línea auxiliar usa typography caption')
  assert.equal(caption[0].props.color, 'text.secondary', 'en color text.secondary')

  // Sólo la caja de reparaciones pide la línea auxiliar, porque es la única agrupada por
  // reparación. En las otras tres, `grouped` es false y el panel se queda sólo con el subtítulo.
  const cashPage = fs.readFileSync(path.resolve(__dirname, '..', 'src/pages/CashPage.tsx'), 'utf8')
  assert.ok(/const grouped = origin === 'REPAIR'/.test(cashPage), 'la caja agrupada es exactamente Reparaciones')
  assert.ok(/hint=\{grouped \? 'Una fila por reparación, ordenada por actividad reciente\.' : undefined\}/.test(cashPage), 'y es la única que pide la línea auxiliar')

  console.log('CASH GROUPS FRONTEND PASSED: tabla con columnas fijas y una fila por reparación, detalle en fila propia con colSpan, importes alineados con tabular-nums, aria-expanded y click de fila sin doble toggle, sin repetir totales en el detalle, alineación entre reparaciones, tabla secundaria "Otros movimientos" con título y color exactos, su empty state también sin bloque, sin fila genérica en la tabla principal, tokens compartidos entre las dos tablas, línea auxiliar opcional sólo en Reparaciones y tarjetas en mobile')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
