const assert = require('node:assert/strict')
const { harness, collect } = require('./repair-flow.cjs')

const repair = { id: 'r1', number: 1001, device: 'Samsung QA', status: 'received', total: 80000, paid: 10000,
  partsCost: 30000, laborCost: 500, laborCharge: 40000, payments: [], history: [], clientId: 'c1', clientName: 'QA', phone: '1111111111' }
const button = (root, label) => collect(root, n => n.type === 'Button' && n.props.children === label)[0]
async function main() {
  const page = harness('src/pages/RepairDetailPage.tsx', 'RepairDetailPage', {}, { getRepair: async () => repair })
  await page.settle()
  assert.ok(!button(page.root(), 'Corregir costo/gasto'))
  button(page.root(), 'Editar').props.onClick()
  await page.settle()
  const drawer = collect(page.root(), n => n.type === 'EditRepairDrawer')[0]
  assert.equal(drawer.props.repair.partsCost, 30000)
  drawer.props.onUpdated({ ...repair, partsCost: 20000 })
  await page.settle()
  assert.ok(collect(page.root(), n => n.props?.label === 'Costo / gasto de la reparación' && n.props.value === '$20500').length)
  assert.ok(collect(page.root(), n => n.props?.label === 'Ganancia estimada' && n.props.value === '$59500').length)
  assert.ok(JSON.stringify(page.root()).includes('Reparación actualizada correctamente.'))
  assert.equal(collect(page.root(), n => n.type === 'EditRepairDrawer')[0].props.open, false)
  for (const financial of [false, true]) {
    const hidden = harness('src/pages/RepairDetailPage.tsx', 'RepairDetailPage', {}, {
      getRepair: async () => ({ ...repair, status: financial ? 'cancelled' : 'received', history: [{ previousStatus: 'received', newStatus: 'received', internalNote: 'Costo/gasto corregido de $30.000 a $20.000', createdAt: '2026-10-06' }] }),
    }, financial)
    await hidden.settle()
    assert.ok(!button(hidden.root(), 'Corregir costo/gasto'))
    if (!financial) assert.ok(!JSON.stringify(hidden.root()).includes('Costo/gasto corregido de $'))
  }
  for (const [current, amount, method] of [[30000, 20000, undefined], [30000, 0, undefined], [0, 20000, 'CASH']]) {
    const calls = []
    const view = harness('src/components/repairs/RepairInitialCostDialog.tsx', 'RepairInitialCostDialog', {
      repair: { ...repair, partsCost: current }, onClose() {}, onUpdated: updated => calls.push(['updated', updated.partsCost]),
    }, { updateRepairInitialCost: async (id, input) => { calls.push([id, input.amount, input.method]); return { ...repair, partsCost: input.amount } } })
    await view.settle()
    const field = collect(view.root(), n => n.type === 'CurrencyField')[0]
    assert.equal(field.props.value, current)
    field.props.onValueChange(amount)
    await view.settle()
    if (amount === 0) assert.ok(JSON.stringify(view.root()).includes('Al guardar $0 se eliminará de Caja el egreso inicial asociado a esta reparación.'))
    if (method) {
      assert.ok(button(view.root(), 'Guardar costo/gasto').props.disabled, 'New expense must explicitly select a method')
      collect(view.root(), n => n.type === 'TextField' && n.props.select)[0].props.onChange({ target: { value: method } })
      await view.settle()
    }
    await button(view.root(), 'Guardar costo/gasto').props.onClick()
    await view.settle()
    assert.equal(JSON.stringify(calls), JSON.stringify([['r1', amount, method], ['updated', amount]]))
  }
  console.log('INITIAL COST FRONTEND PASSED: financial permission, cancellation, current amount, 30000→20000/0 and 0→20000, explicit payment method, warning, updated cost/profit and success/close.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
