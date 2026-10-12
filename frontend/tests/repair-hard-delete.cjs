const assert = require('node:assert/strict')
const { harness, collect } = require('./repair-flow.cjs')
const find = (view, type, label) => collect(view.root(), node => node.type === type && node.props.children === label)[0]
async function main() {
  const states = ['received', 'review', 'budget', 'approved', 'waiting_part', 'repairing', 'testing', 'ready', 'delivered', 'cancelled', 'warranty']
  const repairs = states.map((status, i) => ({ id: 'menu-' + i, number: i + 1, status, paid: 50000, total: 50000, clientName: 'Synthetic', phone: '', history: [] }))
  for (const allowed of [true, false]) {
    const list = harness('src/pages/RepairsPage.tsx', 'RepairsPage', {}, {
      getRepairsPage: async () => ({ items: repairs, total: repairs.length }), deniedPermissions: allowed ? [] : ['repairs.delete'],
    })
    await list.settle()
    const menus = collect(list.root(), node => node.type === 'RowActionsMenu')
    assert.equal(menus.length, states.length)
    for (const menu of menus) {
      assert.ok(!menu.props.actions.some(action => action.label === 'Cancelar reparación'))
      const action = menu.props.actions.find(action => action.label === 'Eliminar reparación')
      assert.ok(action && !action.disabled)
      assert.equal(action.hidden, !allowed)
      if (allowed) {
        action.onClick(); await list.settle()
        assert.ok(collect(list.root(), node => node.type === 'RepairDeleteDialog')[0].props.repair)
      }
    }
  }

  for (const status of states) {
    let calls = 0, deleted = 0, finish
    const view = harness('src/components/repairs/RepairDeleteDialog.tsx', 'RepairDeleteDialog', {
      repair: { id: 'synthetic', number: 1, paid: 50000, status }, onClose() {}, onDeleted() { deleted++ },
    }, { deleteRepair: () => { calls++; return new Promise(resolve => { finish = resolve }) } })
    await view.settle()
    assert.ok(find(view, 'DialogTitle', '¿Eliminar definitivamente esta reparación?'))
    assert.ok(find(view, 'Typography', 'Esta acción es irreversible.'))
    assert.ok(find(view, 'Button', 'Volver'))
    const button = find(view, 'Button', 'Eliminar definitivamente')
    assert.equal(button.props.color, 'error')
    button.props.onClick(); button.props.onClick()
    await view.settle()
    assert.equal(calls, 1, 'Immediate double click issues one DELETE')
    assert.equal(find(view, 'Button', 'Eliminando…').props.disabled, true)
    assert.equal(find(view, 'Button', 'Volver').props.disabled, true)
    assert.equal(collect(view.root(), node => node.type === 'Dialog')[0].props.onClose, undefined)
    finish(); await view.settle()
    assert.equal(deleted, 1)
  }
  let attempts = 0, deleted = false
  const failure = harness('src/components/repairs/RepairDeleteDialog.tsx', 'RepairDeleteDialog', {
    repair: { id: 'failure', paid: 5000 }, onClose() {}, onDeleted() { deleted = true },
  }, { deleteRepair: async () => { if (++attempts === 1) throw { isAxiosError: true, response: { data: { message: 'Synthetic storage conflict' } } } } })
  await failure.settle()
  find(failure, 'Button', 'Eliminar definitivamente').props.onClick(); await failure.settle()
  assert.equal(deleted, false)
  assert.ok(find(failure, 'Alert', 'Synthetic storage conflict'))
  find(failure, 'Button', 'Eliminar definitivamente').props.onClick(); await failure.settle()
  assert.equal(deleted, true)
  const statusView = harness('src/components/repairs/RepairStatusDialog.tsx', 'RepairStatusDialog', { repair: { id: 'r', status: 'received' }, onClose() {}, onUpdated() {} })
  await statusView.settle()
  const options = collect(statusView.root(), node => node.type === 'MenuItem').map(node => node.props.value)
  assert.ok(!options.includes('cancelled'))
  assert.ok(options.includes('delivered'))
  for (const status of states) {
    const detail = harness('src/pages/RepairDetailPage.tsx', 'RepairDetailPage', {}, { getRepair: async () => ({ id: 'r', number: 1, status, paid: 50000, total: 100000, phone: '', createdAt: '', updatedAt: '', history: [] }) })
    await detail.settle()
    assert.ok(find(detail, 'Button', 'Eliminar reparación'), `Paid ${status} repair offers deletion`)
  }
  console.log('HARD DELETE UI PASS: all states and paid repairs, confirmation, immediate double click, busy dismissal blocked, errors and retry, cancellation absent from status options')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
