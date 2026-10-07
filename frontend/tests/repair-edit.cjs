const assert = require('node:assert/strict')
const { harness, collect } = require('./repair-flow.cjs')
const repair = { id: 'r1', number: 1001, device: 'Samsung A14', deviceBrand: 'Samsung', deviceModel: 'A14', issue: 'Pantalla rota', diagnosis: 'Pantalla', notes: 'Observación', imei: '123', color: 'Negro', status: 'received', total: 55000, paid: 25000,
  partsCost: 30000, laborCost: 500, laborCharge: 30000, clientId: 'c1', clientName: 'Cliente', phone: '1111111111', estimatedDeliveryDate: '2026-11-01T00:00:00Z', warrantyEnabled: true, warrantyDurationDays: 30,
  history: [], payments: [{ id: 'advance', amount: 20000, method: 'CASH', isAdvance: true, createdAt: '2026-10-01' }, { id: 'later', amount: 5000, method: 'CARD', createdAt: '2026-10-02' }] }
const find = (view, type, label) => collect(view.root(), n => n.type === type && (n.props.label === label || n.props.children === label))[0]
const money = (view, label) => find(view, 'CurrencyField', label)
async function main() {
  const page = harness('src/pages/RepairDetailPage.tsx', 'RepairDetailPage', {}, { getRepair: async () => repair })
  await page.settle()
  const header = collect(page.root(), n => n.type === 'PageHeader')[0]
  assert.equal(collect(header, n => n.type === 'StatusChip').length, 0)
  assert.equal(find(page, 'Button', 'Editar').props.variant, 'contained')
  assert.equal(find(page, 'Button', 'Editar').props.color, 'primary')
  find(page, 'Button', 'Editar').props.onClick(); await page.settle()
  let drawer = collect(page.root(), n => n.type === 'EditRepairDrawer')[0]
  assert.equal(drawer.props.open, true)
  assert.ok(!JSON.stringify(page.root()).includes('Editar datos generales'))
  assert.ok(!find(page, 'Button', 'Corregir costo/gasto')); assert.ok(!find(page, 'Button', 'Corregir adelanto inicial'))
  const titles = collect(page.root(), n => n.type === 'Typography').map(n => n.props.children)
  assert.ok(titles.indexOf('Equipo y cliente') < titles.indexOf('Resumen de pago'))
  assert.ok(titles.indexOf('Resumen de pago') < titles.indexOf('Garantía'))
  assert.ok(titles.indexOf('Garantía') < titles.indexOf('Historial'))
  assert.equal(collect(page.root(), n => n.props?.label === 'Costo / gasto de la reparación')[0].props.color, 'error.main')
  assert.equal(collect(page.root(), n => n.props?.label === 'Mano de obra cobrada')[0].props.color, 'success.main')
  drawer.props.onUpdated({ ...repair, partsCost: 20000, laborCharge: 35000, paid: 15000, total: 50000 }); await page.settle()
  assert.equal(collect(page.root(), n => n.type === 'EditRepairDrawer')[0].props.open, false)
  assert.ok(JSON.stringify(page.root()).includes('Reparación actualizada correctamente.'))
  assert.ok(collect(page.root(), n => n.props?.label === 'Ganancia estimada' && n.props.value === '$29500').length)
  find(page, 'Button', 'Registrar pago').props.onClick(); await page.settle()
  assert.ok(collect(page.root(), n => n.type === 'Dialog' && n.props.open).length)
  const negative = harness('src/pages/RepairDetailPage.tsx', 'RepairDetailPage', {}, { getRepair: async () => ({ ...repair, total: 25000 }) })
  await negative.settle()
  assert.equal(collect(negative.root(), n => n.props?.label === 'Ganancia estimada')[0].props.color, 'error.main')
  const calls = []
  const view = harness('src/components/repairs/EditRepairDrawer.tsx', 'EditRepairDrawer', { open: true, repair: { ...repair, partsCost: undefined, payments: undefined }, onClose() {}, onUpdated() {} }, {
    getRepair: async () => repair,
    editRepair: async (id, input) => { calls.push({ id, input }); return repair },
  })
  await view.settle()
  assert.equal(money(view, 'Costo / gasto de la reparación').props.value, 30000, 'Fetch detail instead of defaulting missing summary finances to zero')
  assert.equal(money(view, 'Mano de obra cobrada').props.value, 30000)
  assert.equal(money(view, 'Adelanto recibido (opcional)').props.value, 20000)
  assert.equal(money(view, 'Total al cliente').props.value, 55000)
  assert.equal(find(view, 'TextField', 'Fecha estimada de entrega').props.value, '2026-11-01')
  assert.equal(find(view, 'TextField', 'Modelo').props.value, 'A14')
  assert.ok(!find(view, 'TextField', 'Estado inicial')); assert.ok(!find(view, 'TextField', 'Duración de la garantía'))
  assert.ok(collect(view.root(), n => n.type === 'MenuItem' && String(n.props.children).includes('Cliente histórico')).length)
  view.root().props.onSubmit(); await view.settle(); assert.equal(JSON.stringify(calls[0].input), '{}', 'No-op sends no financial changes')
  const aliasCalls = []
  const alias = harness('src/components/repairs/EditRepairDrawer.tsx', 'EditRepairDrawer', { open: true, repair, onClose() {}, onUpdated() {} }, { getRepair: async () => ({ ...repair, deviceBrand: 'iPhone' }), editRepair: async (_, input) => { aliasCalls.push(input); return repair } })
  await alias.settle(); alias.root().props.onSubmit(); await alias.settle()
  assert.equal(JSON.stringify(aliasCalls[0]), '{}', 'Opening an existing alias does not rewrite the historical brand')
  money(view, 'Costo / gasto de la reparación').props.onValueChange(20000); await view.settle()
  money(view, 'Mano de obra cobrada').props.onValueChange(40000); await view.settle()
  assert.equal(money(view, 'Total al cliente').props.value, 55000, 'Costs never silently overwrite the agreed total')
  assert.ok(money(view, 'Total al cliente').props.helperText.includes('$60000'))
  find(view, 'Button', 'Usar total sugerido').props.onClick(); await view.settle()
  assert.equal(money(view, 'Total al cliente').props.value, 60000)
  find(view, 'TextField', 'Fecha estimada de entrega').props.onChange({ target: { value: '' } }); await view.settle()
  view.root().props.onSubmit(); await view.settle()
  assert.equal(JSON.stringify(calls[1].input), JSON.stringify({ total: 60000, estimatedDeliveryDate: null, partsCost: 20000, laborCharge: 40000 }))
  money(view, 'Total al cliente').props.onValueChange(10000); await view.settle()
  assert.equal(view.root().props.submitDisabled, true)
  assert.equal(money(view, 'Total al cliente').props.helperText, 'El total al cliente no puede ser menor que el importe ya pagado.')
  for (const financial of [false, true]) {
    const restricted = harness('src/components/repairs/EditRepairDrawer.tsx', 'EditRepairDrawer', { open: true, repair, onClose() {}, onUpdated() {} }, { getRepair: async () => ({ ...repair, status: financial ? 'cancelled' : 'received' }) }, financial)
    await restricted.settle()
    if (financial) assert.equal(money(restricted, 'Costo / gasto de la reparación').props.disabled, true)
    else {
      assert.ok(!money(restricted, 'Costo / gasto de la reparación')); assert.ok(!money(restricted, 'Mano de obra cobrada')); assert.ok(!money(restricted, 'Adelanto recibido (opcional)'))
      assert.ok(find(restricted, 'TextField', 'Modelo')); assert.ok(money(restricted, 'Total al cliente'))
    }
  }
  console.log('REPAIR EDIT UI PASSED: detail header/drawer, financial colors/order, no duplicates, preload/date clearing, permissions, explicit suggested total, no-op and single save.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
