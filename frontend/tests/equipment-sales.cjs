// Exercise actual page/drawer handlers and effects without a browser or DOM.
// HTTP is mocked at the service boundary; this is not a visual/layout test.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('../node_modules/typescript')

function harness(file, exportName, props = {}) {
  const slots = [], effects = [], timers = new Map()
  let cursor = 0, dirty = true, tree, nextTimer = 0
  const services = {}
  const react = {
    useState(initial) {
      const i = cursor++
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial
      return [slots[i], value => { const next = typeof value === 'function' ? value(slots[i]) : value; if (!Object.is(next, slots[i])) { slots[i] = next; dirty = true } }]
    },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial } },
    useEffect(fn, deps) {
      const i = cursor++, previous = slots[i]
      if (!previous || deps.some((value, j) => !Object.is(value, previous.deps[j]))) {
        previous?.cleanup?.(); slots[i] = { deps }; effects.push(() => { slots[i].cleanup = fn() })
      }
    },
  }
  const jsx = (type, props) => ({ type, props })
  const load = file => {
    const exports = {}
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
      exports,
      require(name) {
        if (name === 'react') return react
        if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
        if (name === 'axios') return { isAxiosError: e => !!e.isAxiosError }
        if (name.endsWith('/services/equipmentSales')) return services
        if (name.endsWith('/AuthContext')) return { useAuth: () => ({ user: { role: 'OWNER' } }) }
        if (name.endsWith('/permissions')) return { canAccess: () => true }
        if (name.endsWith('/utils/format')) return { formatMoney: String }
        if (name === './equipmentPresentation') return load(path.join(path.dirname(file), 'equipmentPresentation.ts'))
        return new Proxy({}, { get: (_, key) => key })
      },
      setTimeout: fn => { const id = ++nextTimer; timers.set(id, fn); return id },
      clearTimeout: id => timers.delete(id),
    })
    return exports
  }
  const Component = load(path.resolve(__dirname, '../src/features/equipmentSales', file))[exportName]
  async function settle(flushTimers = true) {
    for (let round = 0; round < 30; round++) {
      if (dirty) { dirty = false; cursor = 0; tree = Component(props); while (effects.length) effects.shift()() }
      if (flushTimers) for (const [id, fn] of [...timers]) { timers.delete(id); fn() }
      await new Promise(setImmediate)
      if (!dirty && !effects.length && (!flushTimers || !timers.size)) return
    }
    throw new Error('Repeated effect/render loop')
  }
  function find(predicate, node = tree) {
    if (!node || typeof node !== 'object') return
    if (predicate(node)) return node
    for (const value of Object.values(node)) { const result = find(predicate, value); if (result) return result }
  }
  return { services, settle, find, root: () => tree }
}

async function main() {
  let createdInput
  const create = harness('EquipmentDrawers.tsx', 'EquipmentEditor', { device: null, onClose() {}, onSaved() {}, onRefresh() {} })
  create.services.createEquipment = async input => { createdInput = input; return {} }
  await create.settle()
  const createField = label => create.find(n => n.type === 'TextField' && n.props.label === label).props
  assert.equal(createField('Gastos de reparación').value, '', 'new devices start with optional empty repair expenses')
  assert.ok(!createField('Gastos de reparación').required)
  for (const [label, value] of [['Marca', 'Samsung'], ['Modelo', 'A54'], ['Precio de compra', '100'], ['Precio estimado de venta', '180']]) {
    createField(label).onChange({ target: { value } }); await create.settle()
  }
  assert.equal(create.root().props.submitDisabled, false, 'empty repair expenses must not prevent creation')
  create.root().props.onSubmit(); await create.settle()
  assert.equal(createdInput.repairExpenses, 0)
  const device = { id: 'd', brand: 'Samsung', model: 'A54', purchasePrice: 100, repairExpenses: 20, estimatedSalePrice: 180, totalCost: 120, estimatedProfit: 60, status: 'READY_FOR_SALE', version: 3, createdAt: '2026-09-19T04:43:07.123Z' }
  const page = harness('EquipmentSalesPage.tsx', 'EquipmentSalesPage')
  const calls = []
  let summaries = 0, fail = false, slowResolve
  page.services.getEquipmentPage = async params => {
    calls.push(params)
    if (params.search === 'slow') return new Promise(resolve => { slowResolve = resolve })
    if (fail) throw new Error('HTTP 500')
    return { items: [device], total: 21, pages: 2 }
  }
  page.services.getEquipmentSummary = async () => { summaries++; return { inProcess: 0, readyForSale: 1, totalInvested: 120, purchaseInvestment: 100, repairInvestment: 20, salesCount: 0, realizedProfit: 0 } }
  const field = label => page.find(n => n.type === 'TextField' && n.props.label === label).props
  await page.settle()
  assert.equal(calls.length, 1)
  assert.equal(summaries, 1)
  page.find(n => n.type === 'ListPagination').props.onPageChange(1)
  await page.settle()
  field('Buscar por marca o modelo').onChange({ target: { value: 's' } })
  await page.settle(false)
  field('Buscar por marca o modelo').onChange({ target: { value: ' SAMSUNG ' } })
  await page.settle()
  assert.equal(calls.length, 3, 'typing is debounced to one request')
  assert.equal(calls.at(-1).page, 1, 'search resets pagination atomically')
  assert.equal(calls.at(-1).search, 'samsung')
  assert.equal(summaries, 1, 'filters do not reload summary')
  field('Estado').onChange({ target: { value: 'READY_FOR_SALE' } })
  await page.settle()
  assert.equal(calls.at(-1).status, 'READY_FOR_SALE')
  page.find(n => n.type === 'EquipmentDeviceList').props.onEdit(device)
  await page.settle()
  const beforeClose = calls.length
  page.find(n => n.type === 'EquipmentEditor').props.onClose()
  await page.settle()
  assert.equal(calls.length, beforeClose, 'opening/closing drawers does not fetch')
  fail = true
  field('Buscar por marca o modelo').onChange({ target: { value: 'failure' } })
  await page.settle()
  const failedCount = calls.length
  await page.settle()
  assert.equal(calls.length, failedCount, 'failed load does not loop')
  fail = false
  page.find(n => n.type === 'UiState' && n.props.actionLabel === 'Reintentar').props.action()
  await page.settle()
  assert.equal(calls.length, failedCount + 1)
  field('Buscar por marca o modelo').onChange({ target: { value: 'slow' } })
  await page.settle()
  field('Buscar por marca o modelo').onChange({ target: { value: 'newer' } })
  await page.settle()
  slowResolve({ items: [], total: 0, pages: 1 })
  await page.settle()
  assert.equal(page.find(n => n.type === 'EquipmentDeviceList').props.devices[0].id, 'd', 'stale response cannot overwrite newer list')
  page.find(n => n.type === 'EquipmentDeviceList').props.onSell(device)
  await page.settle()
  page.find(n => n.type === 'EquipmentSaleDrawer').props.onSaved()
  await page.settle()
  assert.equal(summaries, 2, 'successful write refreshes module summary')

  let sales = 0, finishSale, saved = 0
  const sale = harness('EquipmentDrawers.tsx', 'EquipmentSaleDrawer', { device, onClose() {}, onSaved() { saved++ }, onRefresh() {} })
  sale.services.sellEquipment = async (id, input) => { sales++; assert.equal(id, 'd'); assert.equal(input.expectedVersion, 3); assert.equal(input.actualSalePrice, 180); assert.equal(input.soldAt, undefined, 'now is timestamped by backend, not the input'); return new Promise(resolve => { finishSale = resolve }) }
  await sale.settle()
  sale.root().props.onSubmit(); sale.root().props.onSubmit()
  await sale.settle()
  assert.equal(sales, 1, 'synchronous duplicate clicks submit once')
  finishSale(device); await sale.settle()
  assert.equal(saved, 1)
  sale.find(n => n.type === 'TextField' && n.props.label === 'Fecha de venta').props.onChange({ target: { value: 'CUSTOM' } })
  await sale.settle()
  const dateField = () => sale.find(n => n.type === 'TextField' && n.props.label === 'Fecha efectiva de venta').props
  assert.equal(dateField().slotProps.htmlInput.step, 0.001)
  dateField().onChange({ target: { value: '2026-09-18T01:43:00.000' } }); await sale.settle()
  assert.equal(sale.root().props.submitDisabled, true, 'effective sale cannot precede purchase')
  const editor = harness('EquipmentDrawers.tsx', 'EquipmentEditor', { device, onClose() {}, onSaved() {}, onRefresh() {} })
  let edits = 0
  editor.services.updateEquipment = async () => { edits++; throw { isAxiosError: true, response: { status: 409, data: { message: 'Equipo vendido' } } } }
  await editor.settle()
  editor.root().props.onSubmit(); await editor.settle()
  assert.equal(editor.root().props.submitDisabled, true, '409 requires refreshing stale form')
  editor.root().props.onSubmit(); await editor.settle()
  assert.equal(edits, 1)
  assert.equal(editor.find(n => n.type === 'Alert').props.children, 'Equipo vendido')
  console.log('EQUIPMENT FRONTEND PASSED: debounce, pagination/filter requests, stale responses, explicit retry/no loops, module-only refresh, duplicate submit guard and 409 recovery')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
