const assert = require('node:assert/strict')
const { harness, collect } = require('./repair-flow.cjs')
const repair = { id: 'r1', number: 1001, device: 'Samsung A14', deviceBrand: 'Samsung', deviceModel: 'A14', issue: 'Pantalla rota', diagnosis: 'Pantalla', notes: 'Observación', imei: '123', color: 'Negro', status: 'received', total: 55000, paid: 25000,
  partsCost: 30000, laborCost: 500, laborCharge: 30000, clientId: 'c1', clientName: 'Cliente', phone: '1111111111', estimatedDeliveryDate: '2026-11-01T00:00:00Z', warrantyEnabled: true, warrantyDurationDays: 30,
  history: [], payments: [{ id: 'advance', amount: 20000, method: 'CASH', isAdvance: true, createdAt: '2026-10-01' }, { id: 'later', amount: 5000, method: 'CARD', createdAt: '2026-10-02' }] }
const find = (view, type, label) => collect(view.root(), n => n.type === type && (n.props.label === label || n.props.children === label))[0]
const editForm = view => collect(view.root(), n => n.type === 'FormDrawer')[0]
const clientPicker = view => collect(view.root(), n => n.type === 'Autocomplete' && n.props.renderInput?.({}).props.label === 'Buscar cliente...')[0]
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
  assert.equal(clientPicker(view).props.value.id, repair.clientId)
  assert.ok(clientPicker(view).props.getOptionLabel(clientPicker(view).props.value).includes('Cliente histórico'))
  editForm(view).props.onSubmit(); await view.settle(); assert.equal(JSON.stringify(calls[0].input), '{}', 'No-op sends no financial changes')
  const aliasCalls = []
  const alias = harness('src/components/repairs/EditRepairDrawer.tsx', 'EditRepairDrawer', { open: true, repair, onClose() {}, onUpdated() {} }, { getRepair: async () => ({ ...repair, deviceBrand: 'iPhone' }), editRepair: async (_, input) => { aliasCalls.push(input); return repair } })
  await alias.settle(); editForm(alias).props.onSubmit(); await alias.settle()
  assert.equal(JSON.stringify(aliasCalls[0]), '{}', 'Opening an existing alias does not rewrite the historical brand')
  money(view, 'Costo / gasto de la reparación').props.onValueChange(20000); await view.settle()
  money(view, 'Mano de obra cobrada').props.onValueChange(40000); await view.settle()
  assert.equal(money(view, 'Total al cliente').props.value, 55000, 'Costs never silently overwrite the agreed total')
  assert.ok(money(view, 'Total al cliente').props.helperText.includes('$60000'))
  find(view, 'Button', 'Usar total sugerido').props.onClick(); await view.settle()
  assert.equal(money(view, 'Total al cliente').props.value, 60000)
  find(view, 'TextField', 'Fecha estimada de entrega').props.onChange({ target: { value: '' } }); await view.settle()
  editForm(view).props.onSubmit(); await view.settle()
  assert.equal(JSON.stringify(calls[1].input), JSON.stringify({ total: 60000, estimatedDeliveryDate: null, partsCost: 20000, laborCharge: 40000 }))
  money(view, 'Total al cliente').props.onValueChange(10000); await view.settle()
  assert.equal(editForm(view).props.submitDisabled, true)
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
  const clientCalls = [], activeClient = { id: 'c2', name: 'María Pérez', phone: '1122334455' }
  const clientsView = harness('src/components/repairs/EditRepairDrawer.tsx', 'EditRepairDrawer', { open: true, repair, onClose() {}, onUpdated() {} }, {
    getRepair: async () => repair, getClientOptions: async () => [activeClient],
    editRepair: async (_, input) => { clientCalls.push(input); return repair },
  })
  await clientsView.settle()
  let picker = clientPicker(clientsView)
  assert.ok(picker, 'Client picker is a searchable Autocomplete')
  assert.equal(picker.props.value.id, 'c1', 'Historical current client stays selected')
  assert.equal(picker.props.getOptionDisabled(picker.props.value), true)
  assert.equal(picker.props.filterOptions(picker.props.options, { inputValue: 'pÉrEz' })[0].id, 'c2')
  assert.equal(picker.props.filterOptions(picker.props.options, { inputValue: '223344' })[0].id, 'c2')
  assert.equal(picker.props.getOptionLabel(activeClient), 'María Pérez · 1122334455')
  picker.props.onChange(null, activeClient); await clientsView.settle()
  assert.equal(clientPicker(clientsView).props.value.id, 'c2')
  assert.equal(clientCalls.length, 0, 'Selecting a client does not save the repair')
  find(clientsView, 'Button', '+ Crear cliente').props.onClick(); await clientsView.settle()
  let newClient = collect(clientsView.root(), n => n.type === 'NewClientDrawer')[0]
  assert.equal(newClient.props.open, true); assert.equal(editForm(clientsView).props.open, false)
  newClient.props.onClose(); await clientsView.settle()
  assert.equal(editForm(clientsView).props.open, true); assert.equal(clientPicker(clientsView).props.value.id, 'c2')
  find(clientsView, 'Button', '+ Crear cliente').props.onClick(); await clientsView.settle()
  newClient = collect(clientsView.root(), n => n.type === 'NewClientDrawer')[0]
  const created = { id: 'c3', name: 'Cliente nuevo', phone: '1199999999' }
  newClient.props.onCreated(created); await clientsView.settle()
  picker = clientPicker(clientsView)
  assert.equal(picker.props.value.id, 'c3'); assert.equal(picker.props.options.filter(c => c.id === 'c3').length, 1)
  assert.equal(editForm(clientsView).props.open, true); assert.equal(collect(clientsView.root(), n => n.type === 'NewClientDrawer')[0].props.open, false)
  assert.equal(clientCalls.length, 0, 'Creating a client does not save the repair')
  assert.equal(money(clientsView, 'Total al cliente').props.value, 55000)
  editForm(clientsView).props.onSubmit(); await clientsView.settle()
  assert.equal(JSON.stringify(clientCalls), '[{"clientId":"c3"}]')
  const delivered = { ...repair, status: 'delivered' }, deliveryCalls = [], deliveryUpdates = []
  const deliveryPage = harness('src/pages/RepairDetailPage.tsx', 'RepairDetailPage', {}, { getRepair: async () => delivered })
  await deliveryPage.settle()
  assert.ok(!find(deliveryPage, 'Button', 'Corregir entrega'), 'Delivery action leaves the status card')
  assert.ok(!JSON.stringify(deliveryPage.root()).includes('Desde acá sólo'))
  find(deliveryPage, 'Button', 'Editar').props.onClick(); await deliveryPage.settle()
  const pageDrawer = collect(deliveryPage.root(), n => n.type === 'EditRepairDrawer')[0]
  pageDrawer.props.onDeliveryCorrected({ ...delivered, status: 'ready' }); await deliveryPage.settle()
  assert.equal(collect(deliveryPage.root(), n => n.type === 'EditRepairDrawer')[0].props.open, false)
  assert.ok(JSON.stringify(deliveryPage.root()).includes('Entrega corregida. La reparación volvió a «Listo para retirar».'))
  const delivery = harness('src/components/repairs/EditRepairDrawer.tsx', 'EditRepairDrawer', { open: true, repair: delivered, onClose() {}, onUpdated() { throw Error('Must not report ordinary save') }, onDeliveryCorrected: r => deliveryUpdates.push(r) }, {
    getRepair: async () => delivered, editRepair: async (_, input) => { deliveryCalls.push(input); return delivered },
  })
  await delivery.settle()
  const deliveryButton = find(delivery, 'Button', 'Corregir entrega')
  assert.equal(deliveryButton.props.variant, 'outlined'); assert.equal(deliveryButton.props.color, 'warning')
  find(delivery, 'TextField', 'Modelo').props.onChange({ target: { value: 'Pending model' } }); await delivery.settle()
  deliveryButton.props.onClick(); await delivery.settle()
  let correctionDialog = collect(delivery.root(), n => n.type === 'RepairDeliveryCorrectionDialog')[0]
  assert.equal(correctionDialog.props.repair.id, repair.id); assert.equal(editForm(delivery).props.open, false)
  correctionDialog.props.onClose(); await delivery.settle()
  assert.equal(editForm(delivery).props.open, true)
  assert.equal(find(delivery, 'TextField', 'Modelo').props.value, 'Pending model')
  assert.equal(deliveryCalls.length, 0)
  find(delivery, 'Button', 'Corregir entrega').props.onClick(); await delivery.settle()
  correctionDialog = collect(delivery.root(), n => n.type === 'RepairDeliveryCorrectionDialog')[0]
  correctionDialog.props.onCorrected({ ...delivered, status: 'ready' }); await delivery.settle()
  assert.equal(deliveryUpdates[0].status, 'ready'); assert.equal(deliveryCalls.length, 0, 'Correction never submits pending /edit changes')
  assert.ok(!find(view, 'Button', 'Corregir entrega'), 'Not delivered has no correction action')
  const technician = harness('src/components/repairs/EditRepairDrawer.tsx', 'EditRepairDrawer', { open: true, repair: delivered, onClose() {}, onUpdated() {} }, { getRepair: async () => delivered, userRole: 'TECHNICIAN' })
  await technician.settle(); assert.ok(!find(technician, 'Button', 'Corregir entrega'))
  console.log('REPAIR EDIT UI PASSED: detail header/drawer, financial colors/order, no duplicates, preload/date clearing, permissions, explicit suggested total, no-op and single save.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
