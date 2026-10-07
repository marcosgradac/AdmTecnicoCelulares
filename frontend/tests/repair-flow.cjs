// Ejercita el flujo de estados y la confirmación de entrega sin navegador ni DOM.
// HTTP se simula en la frontera de servicios: no es una prueba visual.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('../node_modules/typescript')

function harness(file, exportName, props = {}, services = {}, financial = true) {
  const slots = [], effects = [], timers = new Map()
  let cursor = 0, dirty = true, tree
  const reactCallbacks = new Map()
const react = {
    // useCallback memoriza por dependencias, igual que React: si la lista no cambia,
    // devuelve la misma función y el useEffect que la usa puede estabilizarse.
    useCallback(fn, deps = []) {
      const key = JSON.stringify(deps)
      if (!reactCallbacks.has(key)) reactCallbacks.set(key, fn)
      return reactCallbacks.get(key)
    },
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
        // La página de detalle pide sesión, navegación y permisos: se simulan en la frontera.
        if (name.endsWith('/auth/AuthContext')) return { useAuth: () => ({ user: { role: 'OWNER', permissions: [] } }) }
        if (name === 'react-router-dom') return { useNavigate: () => () => {}, useParams: () => ({ id: 'r1' }) }
        if (name.endsWith('/auth/permissions')) return { canAccess: (_, permission) => !['repairs.viewFinancials', 'payments:create'].includes(permission) || financial }
        if (name.endsWith('/services/operations')) return { getClientOptions: async () => [], registerPayment: async () => {}, ...services }
        // La página usa la configuración real de estados: se carga en el mismo sandbox sin React.
        if (name.endsWith('/config/repairStatus')) return loadConfig()
        if (name.endsWith('/config/deviceBrands')) return loadDeviceBrands()
        if (name.endsWith('/types')) return loadTypes()
        // La construcción del enlace de seguimiento es lógica real del repo: se carga
        // el módulo de verdad, con el mismo origen que simula `window` acá abajo.
        if (name.endsWith('/utils/trackingLink')) return loadTrackingLink()
        return new Proxy({}, { get: (_, key) => key })
      },
      setTimeout: fn => { const id = timers.size + 1; timers.set(id, fn); return id },
      clearTimeout: id => timers.delete(id),
      // La página arma enlaces de seguimiento y WhatsApp con el origen del navegador.
      window: { location: { origin: 'https://taller.test' }, open: () => {} },
      navigator: { clipboard: { writeText: async () => {} } },
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

// Los arrays nacen en el sandbox de vm: se comparan por valor, no por identidad de realm.
// Se carga el módulo de configuración en el mismo sandbox, sin React.
let configCache
function loadDeviceBrands() {
  const exports = {}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/config/deviceBrands.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports, require: () => new Proxy({}, { get: () => ({ path: '', hex: '000000' }) }) })
  return exports
}
function loadConfig() {
  if (configCache) return configCache
  const exports = {}
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/config/repairStatus.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports, require: name => (name === '@mui/icons-material' ? new Proxy({}, { get: () => 'Icon' }) : new Proxy({}, { get: (_, key) => key })) },
  )
  return (configCache = exports)
}

// Los tipos reales (isStatusNote) deciden si una entrada del historial es una corrección.
let typesCache
function loadTypes() {
  if (typesCache) return typesCache
  const exports = {}
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/types/index.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports, require: () => new Proxy({}, { get: (_, key) => key }) },
  )
  return (typesCache = exports)
}

/**
 * Carga el módulo real de enlaces de seguimiento.
 *
 * Se ejecuta en su propio sandbox con el mismo origen que usa el harness, para que
 * `buildTrackingLink(token, nombre)` sin origen explícito produzca una URL absoluta
 * igual que en el navegador. Se simula `window` porque el módulo lo consulta.
 */
let trackingLinkCache
function loadTrackingLink() {
  if (trackingLinkCache) return trackingLinkCache
  const exports = {}
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/utils/trackingLink.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports, window: { location: { origin: 'https://taller.test' } } },
  )
  return (trackingLinkCache = exports)
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
  clientId: 'c1', clientName: 'Cliente', phone: '1133334444',
})

async function main() {

// 1. El flujo visible no ofrece BUDGET / APPROVED / TESTING, y los históricos avanzan
//    como su equivalente.
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

// 5. El historial no duplica pagos: cada Payment genera exactamente un evento.
//    Renderiza la página de detalle y cuenta los rótulos del bloque «Historial».
async function historyOf(payments, history = []) {
  const detail = harness('src/pages/RepairDetailPage.tsx', 'RepairDetailPage', {}, {
    getRepair: async () => ({ ...repair('received', payments), clientId: 'c1', clientName: 'Cliente', history }),
    getClientOptions: async () => [],
  })
  await detail.settle()
  const root = detail.root()
  const card = collect(root, node => node.type === 'CardContent' && node.props.children?.some?.(child => child?.props?.children === 'Historial'))
  assert.equal(card.length, 1, 'la tarjeta de historial esta una sola vez')
  const text = JSON.stringify(card[0])
  const count = label => (text.match(new RegExp(`"${label}"`, 'g')) ?? []).length
  return {
    text,
    countAdvance: () => count('Adelanto recibido'),
    countPayment: () => count('Pago recibido'),
    countCorrection: () => count('Adelanto corregido'),
    countReview: () => count('Pago de revisión'),
  }
}
// Un solo adelanto => un solo evento «Adelanto recibido».
const singleAdvance = await historyOf([{ id: 'p1', amount: 30000, method: 'CASH', isAdvance: true, createdAt: '2026-09-29T10:00:00Z' }])
assert.equal(singleAdvance.countAdvance(), 1, 'un Payment de adelanto produce exactamente un evento')
// Dos pagos distintos => dos eventos (no cuatro).
const twoPayments = await historyOf([
  { id: 'p1', amount: 30000, method: 'CASH', isAdvance: true, createdAt: '2026-09-29T10:00:00Z' },
  { id: 'p2', amount: 30000, method: 'CASH', createdAt: '2026-10-02T10:00:00Z' },
])
assert.equal(twoPayments.countAdvance(), 1, 'el adelanto aparece una vez')
assert.equal(twoPayments.countPayment(), 1, 'el pago normal aparece una vez')
// Un adelanto corregido deja su evento y, aparte, el de la corrección.
const corrected = await historyOf(
  [{ id: 'p1', amount: 30000, method: 'CASH', isAdvance: true, createdAt: '2026-09-29T10:00:00Z' }],
  [{ id: 'h1', previousStatus: 'received', newStatus: 'received', internalNote: 'Adelanto corregido de $20.000 a $30.000', createdAt: '2026-10-01T10:00:00Z' }],
)
assert.equal(corrected.countAdvance(), 1, 'la corrección no duplica el adelanto')
assert.ok(corrected.text.includes('Adelanto corregido de $20.000 a $30.000'), 'la corrección del adelanto se muestra aparte')

// 6. Correcciones unificadas en Editar: no quedan botones duplicados de adelanto.
const detailPage = harness('src/pages/RepairDetailPage.tsx', 'RepairDetailPage', {}, {
  getRepair: async () => ({ ...repair('received', [{ id: 'p1', amount: 30000, method: 'CASH', isAdvance: true, createdAt: '2026-09-29T10:00:00Z' }]), clientId: 'c1', clientName: 'Cliente' }),
  getClientOptions: async () => [],
})
await detailPage.settle()
const pageText = JSON.stringify(detailPage.root())
const advanceButtons = collect(detailPage.root(), node => node.type === 'Button' && typeof node.props.children === 'string' && node.props.children.startsWith('Corregir adelanto'))
assert.deepEqual(advanceButtons.map(node => node.props.children), [], 'la corrección se ofrece dentro de Editar')
assert.ok(pageText.includes('Costos y ganancia'), 'la tarjeta de costos sigue visible')
assert.ok(!pageText.includes('"Corregir adelanto"'), 'la tarjeta de costos ya no ofrece corregir el adelanto')

// Redacted responses preserve operational totals without showing invented financial zeros.
const redacted = harness('src/pages/RepairDetailPage.tsx', 'RepairDetailPage', {}, {
  getRepair: async () => ({ ...repair('received'), payments: undefined, history: [] }),
}, false)
await redacted.settle()
const redactedText = JSON.stringify(redacted.root())
assert.ok(!redactedText.includes('Costos y ganancia'))
assert.ok(!redactedText.includes('Ganancia estimada'))
assert.ok(!redactedText.includes('Corregir adelanto inicial'))
assert.ok(!redactedText.includes('NaN'))
assert.ok(redactedText.includes('Resumen de pago'))
assert.ok(collect(redacted.root(), node => node.props?.label === 'Total al cliente' && node.props?.value === '$60000').length)
assert.ok(collect(redacted.root(), node => node.props?.label === 'Pagado' && node.props?.value === '$30000').length)

// Even stale complete data must not expose payment events after permission removal.
const stale = harness('src/pages/RepairDetailPage.tsx', 'RepairDetailPage', {}, {
  getRepair: async () => ({ ...repair('received', [{ id: 'p1', amount: 30000, isAdvance: true, createdAt: '2026-10-01' }]), history: [{ previousStatus: 'received', newStatus: 'received', internalNote: 'Adelanto corregido de $20.000 a $30.000', createdAt: '2026-10-01' }] }),
}, false)
await stale.settle()
assert.ok(!JSON.stringify(stale.root()).includes('Adelanto recibido'))
assert.ok(!JSON.stringify(stale.root()).includes('Adelanto corregido de'))
const noFinanceCancel = harness('src/components/repairs/RepairCancellationDialog.tsx', 'RepairCancellationDialog', { repair: repair('received'), onClose() {}, onCancelled() {} }, {}, false)
await noFinanceCancel.settle()
assert.ok(buttonsOf(noFinanceCancel.root()).find(node => node.props.children === 'Confirmar cancelación').props.disabled)
assert.ok(!JSON.stringify(noFinanceCancel.root()).includes('Medio de devolución'))

console.log('REPAIR FLOW FRONTEND PASSED: flujo de seis pasos sin estados históricos, equivalencia visual de BUDGET/APPROVED/TESTING, confirmación obligatoria de Entregado, cancelación sin efectos, corrección de entrega con motivo, límites del adelanto, historial sin pagos duplicados y edición unificada sin botones duplicados')
}
module.exports = { harness, collect }
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1 })
