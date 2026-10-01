// Ejercita el flujo de estados y la confirmación de entrega sin navegador ni DOM.
// HTTP se simula en la frontera de servicios: no es una prueba visual.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('../node_modules/typescript')

function harness(file, exportName, props = {}, services = {}) {
  const slots = [], effects = [], timers = new Map()
  let cursor = 0, dirty = true, tree
  const react = {
    useState(initial) {
      const i = cursor++
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial
      return [slots[i], value => { const next = typeof value === 'function' ? value(slots[i]) : value; if (!Object.is(next, slots[i])) { slots[i] = next; dirty = true } }]
    },
    useEffect(fn, deps) {
      const i = cursor++, previous = slots[i]
      if (!previous || deps.some((value, j) => !Object.is(value, previous.deps[j]))) {
        previous?.cleanup?.(); slots[i] = { deps }; effects.push(() => { slots[i].cleanup = fn() })
      }
    },
  }
  const jsx = (type, props) => ({ type, props })
  const exports = {}
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    {
      exports,
      require(name) {
        if (name === 'react') return react
        if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
        if (name === 'axios') return { isAxiosError: e => !!e.isAxiosError }
        if (name.endsWith('/services/repairs')) return services
        if (name.endsWith('/utils/format')) return { formatMoney: value => `$${value}`, formatDate: value => value }
        return new Proxy({}, { get: (_, key) => key })
      },
      setTimeout: fn => { const id = timers.size + 1; timers.set(id, fn); return id },
      clearTimeout: id => timers.delete(id),
    },
  )
  const Component = exports[exportName]
  async function settle() {
    for (let round = 0; round < 40; round++) {
      if (dirty) { dirty = false; cursor = 0; tree = Component(props); while (effects.length) effects.shift()() }
      for (const [id, fn] of [...timers]) { timers.delete(id); fn() }
      await new Promise(setImmediate)
      if (!dirty && !effects.length && !timers.size) return
    }
    throw new Error('Repeated effect/render loop')
  }
  return { services, settle, root: () => tree }
}

function collect(node, predicate, found = []) {
  if (!node || typeof node !== 'object') return found
  if (predicate(node)) found.push(node)
  for (const value of Object.values(node)) collect(value, predicate, found)
  return found
}

const buttonsOf = root => collect(root, n => n.type === 'Button')
const repair = (status, payments = []) => ({
  id: 'r1', number: 1001, device: 'Samsung A14', status, total: 60000, paid: 30000,
  warrantyEnabled: true, warrantyDurationDays: 30, payments,
})

async function main() {

// 1. El flujo visible no ofrece BUDGET / APPROVED / TESTING, y los históricos avanzan
//    como su equivalente. Se carga el módulo de configuración en el mismo sandbox sin React.
function loadConfig() {
  const exports = {}
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/config/repairStatus.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports, require: name => (name === '@mui/icons-material' ? new Proxy({}, { get: () => 'Icon' }) : new Proxy({}, { get: (_, key) => key })) },
  )
  return exports
}
const config = loadConfig()
// Los arrays nacen en el sandbox de vm: se comparan por valor, no por identidad de realm.
assert.equal(config.repairFlow.join(','), 'received,review,waiting_part,repairing,ready,delivered', 'el flujo visible son seis pasos')
for (const legacy of ['budget', 'approved', 'testing']) {
  assert.ok(!config.repairStatuses.includes(legacy), `${legacy} no se puede seleccionar`)
  assert.ok(!config.repairFlow.includes(legacy), `${legacy} no es un paso del flujo`)
}
assert.ok(config.repairStatuses.includes('cancelled') && config.repairStatuses.includes('warranty'), 'los estados especiales se conservan')
assert.equal(config.canonicalStatus('budget'), 'review', 'BUDGET se lee como En revisión')
assert.equal(config.canonicalStatus('approved'), 'review', 'APPROVED se lee como En revisión')
assert.equal(config.canonicalStatus('testing'), 'repairing', 'TESTING se lee como En reparación')
assert.equal(config.repairStatusLabel('budget'), 'En revisión', 'BUDGET se muestra como En revisión')
assert.equal(config.repairStatusLabel('testing'), 'En reparación', 'TESTING se muestra como En reparación')
assert.equal(config.nextStatus('budget'), 'waiting_part', 'BUDGET avanza como En revisión')
assert.equal(config.nextStatus('testing'), 'ready', 'TESTING avanza como En reparación')
assert.equal(config.nextStatus('delivered'), null, 'desde Entregado no hay paso siguiente')
assert.equal(config.previousStatus('delivered'), null, 'desde Entregado no hay paso anterior')
assert.equal(config.nextStatus('cancelled'), null, 'un estado especial no avanza')
assert.equal(config.previousStatus('warranty'), null, 'un estado especial no retrocede')
assert.equal(config.nextStatus('received'), 'review')
assert.equal(config.previousStatus('received'), null, 'desde Recibido no se retrocede')
assert.equal(config.nextStatus('ready'), 'delivered')

// 2. Entregar pide confirmación: nada cambia hasta que el usuario confirma.
const confirmCalls = []
const confirm = harness('src/components/repairs/RepairDeliveryConfirmDialog.tsx', 'RepairDeliveryConfirmDialog', {
  repair: repair('ready'), onClose: () => confirmCalls.push('close'), onDelivered: () => confirmCalls.push('delivered'),
}, { advanceRepairStatus: async id => { confirmCalls.push(`advance:${id}`); return repair('delivered') } })
await confirm.settle()
const dialog = confirm.root()
assert.equal(dialog.type, 'Dialog', 'el paso a Entregado se envuelve en un diálogo')
const text = JSON.stringify(dialog)
assert.ok(text.includes('Confirmar entrega del dispositivo?'), 'el título pide confirmar la entrega')
assert.ok(text.includes('no vas a poder volver a un estado anterior'), 'el mensaje advierte que no se puede retroceder')
assert.ok(text.includes('período de garantía'), 'el mensaje advierte que puede iniciar la garantía')
assert.deepEqual(confirmCalls, [], 'abrir el diálogo no cambia el estado')
assert.deepEqual(buttonsOf(confirm.root()).map(node => node.props.children), ['Cancelar', 'Confirmar entrega'], 'los botones son Cancelar y Confirmar entrega')
buttonsOf(confirm.root())[0].props.onClick()
await confirm.settle()
assert.deepEqual(confirmCalls, ['close'], 'Cancelar no cambia el estado: sólo cierra')
buttonsOf(confirm.root())[1].props.onClick()
await confirm.settle()
assert.deepEqual(confirmCalls, ['close', 'advance:r1', 'delivered'], 'Confirmar entrega avanza a Entregado y recién entonces notifica el resultado')

// 3. «Corregir entrega» exige motivo antes de llamar al servicio.
const corrections = []
const correction = harness('src/components/repairs/RepairDeliveryCorrectionDialog.tsx', 'RepairDeliveryCorrectionDialog', {
  repair: repair('delivered'), onClose: () => {}, onCorrected: () => {},
}, { correctRepairDelivery: async (id, reason) => { corrections.push({ id, reason }); return repair('ready') } })
await correction.settle()
assert.ok(JSON.stringify(correction.root()).includes('Corregir entrega'), 'la acción administrativa tiene su propio diálogo')
assert.ok(JSON.stringify(correction.root()).includes('volverá a'), 'el diálogo explica que la reparación vuelve a Listo')
assert.ok(JSON.stringify(correction.root()).includes('borrarán la fecha de entrega'), 'el diálogo explica qué fechas se limpian')
buttonsOf(correction.root())[1].props.onClick()
await correction.settle()
assert.deepEqual(corrections, [], 'sin motivo no se llama al servicio')
collect(correction.root(), n => n.type === 'TextField')[0].props.onChange({ target: { value: 'Se entregó el equipo equivocado' } })
await correction.settle()
buttonsOf(correction.root())[1].props.onClick()
await correction.settle()
assert.deepEqual(corrections, [{ id: 'r1', reason: 'Se entregó el equipo equivocado' }], 'con motivo se llama al servicio de corrección')

// 4. El diálogo del adelanto arranca con el valor actual, avisa el máximo y guarda con medio de pago.
const advanceUpdates = []
const advance = harness('src/components/repairs/RepairAdvanceDialog.tsx', 'RepairAdvanceDialog', {
  repair: repair('received', [{ id: 'p1', amount: 20000, method: 'CASH', isAdvance: true, createdAt: '2026-01-01' }]),
  onClose: () => {}, onUpdated: () => {},
}, { updateRepairAdvance: async (id, input) => { advanceUpdates.push({ id, input }); return repair('received') } })
await advance.settle()
const amountOf = () => collect(advance.root(), n => n.type === 'CurrencyField')[0]
const saveOf = () => collect(advance.root(), n => n.type === 'Button' && n.props.children === 'Guardar adelanto')[0]
assert.equal(amountOf().props.value, 20000, 'el formulario abre con el adelanto ya registrado')
assert.ok(String(amountOf().props.helperText).includes('Adelanto actual'), 'muestra el adelanto actual')
// La reparación tiene 20.000 de adelanto y 10.000 de otro pago: el adelanto puede llegar
// hasta 50.000 (60.000 - 10.000). 55.000 haría que el total pagado supere el presupuesto.
amountOf().props.onValueChange(55000)
await advance.settle()
assert.equal(amountOf().props.error, true, 'marca el error cuando el total pagado superaría el presupuesto')
assert.ok(String(amountOf().props.helperText).includes('Máximo'), 'explica el máximo permitido: el total menos los otros pagos')
assert.equal(saveOf().props.disabled, true, 'no permite guardar un importe que supera el total')
amountOf().props.onValueChange(30000)
await advance.settle()
saveOf().props.onClick()
await advance.settle()
assert.equal(advanceUpdates.length, 1, 'guarda una sola vez el adelanto corregido')
assert.equal(advanceUpdates[0].id, 'r1')
assert.equal(advanceUpdates[0].input.amount, 30000, 'guarda el importe corregido')
assert.equal(advanceUpdates[0].input.method, 'TRANSFER', 'guarda el medio de pago')

console.log('REPAIR FLOW FRONTEND PASSED: flujo de seis pasos sin estados históricos, equivalencia visual de BUDGET/APPROVED/TESTING, confirmación obligatoria de Entregado, cancelación sin efectos, corrección de entrega con motivo y límites del adelanto')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
