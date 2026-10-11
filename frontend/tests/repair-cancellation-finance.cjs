const assert = require('node:assert/strict')
const { harness, collect } = require('./repair-flow.cjs')
const repair = { id: 'r1', number: 1001, status: 'received', total: 60000, paid: 20000, clientName: 'Synthetic', device: 'Synthetic phone', history: [], expenseEntries: [{ id: 'expense1', amount: 30000, remaining: 30000, historical: false, description: 'Compra real' }], financialSummary: { income: 20000, expense: 30000, net: -10000, cashNet: -10000, accountingAdjustment: 0 } }
const find = (view, type, label) => collect(view.root(), node => node.type === type && (node.props.label === label || node.props.children === label))[0]
async function main() {
  const calls = []
  let lostResponse = true
  const view = harness('src/components/repairs/RepairCancellationDialog.tsx', 'RepairCancellationDialog', { repair, onClose() {}, onCancelled() {} }, {
    getRepair: async () => repair,
    getCancellationPreview: async (_, input) => { calls.push(['preview', input]); return { projectedNet: 20000, projectedCashNet: 20000, accountingAdjustment: 0, refundNow: 0, reviewBalance: 0, refundBalance: 0, version: 'synthetic-version' } },
    cancelRepair: async (_, input) => { calls.push(['cancel', input]); if (lostResponse) { lostResponse = false; throw new Error('Synthetic lost response after server committed') } return { ...repair, status: 'cancelled' } },
  })
  await view.settle()
  assert.ok(collect(view.root(), node => node.props?.children === '¿Qué pasó con los gastos de repuestos?').length, 'Cancellation must ask about actual expenses')
  for (const option of ['No compré repuestos.', 'Recuperé todo el dinero.', 'Conservar el gasto: no pude recuperar el dinero.', 'Recuperé solamente una parte.']) assert.ok(find(view, 'FormControlLabel', option), option)
  const expenseRadio = collect(view.root(), node => node.type === 'RadioGroup' && node.props['aria-label'] === 'Destino del gasto expense1')[0]
  expenseRadio.props.onChange({ target: { value: 'REFUND_FULL' } }); await view.settle()
  assert.ok(find(view, 'FormControlLabel', 'Confirmo que recibí realmente la devolución del proveedor.'))
  find(view, 'Button', 'Revisar liquidación').props.onClick(); await view.settle()
  assert.equal(calls.length, 0, 'Selecting full recovery alone cannot claim real money')
  find(view, 'FormControlLabel', 'Confirmo que recibí realmente la devolución del proveedor.').props.control.props.onChange({ target: { checked: true } }); await view.settle()
  const reviewRadio = collect(view.root(), node => node.type === 'RadioGroup' && node.props['aria-label'] === 'Cobro de revisión')[0]
  reviewRadio.props.onChange({ target: { value: 'yes' } }); await view.settle()
  find(view, 'CurrencyField', 'Costo de revisión').props.onValueChange(20000); await view.settle()
  find(view, 'Button', 'Revisar liquidación').props.onClick(); await view.settle()
  assert.equal(calls[0][0], 'preview')
  assert.equal(calls[0][1].expenses[0].confirmed, true)
  assert.equal(calls[0][1].reviewFee, 20000)
  assert.ok(collect(view.root(), node => node.props?.children === '$20000').length, 'Preview shows the expected real result')
  find(view, 'Button', 'Confirmar cancelación').props.onClick(); await view.settle()
  assert.equal(calls[1][0], 'cancel')
  assert.equal(calls[1][1].expectedVersion, 'synthetic-version')
  assert.equal(calls[0][1].requestId, calls[1][1].requestId, 'Retry identifier remains stable between preview and submission')
  assert.ok(find(view, 'Button', 'Confirmar cancelación'), 'An uncertain response must retain the original preview and idempotent retry')
  find(view, 'Button', 'Confirmar cancelación').props.onClick(); await view.settle()
  assert.equal(JSON.stringify(calls[2][1]), JSON.stringify(calls[1][1]))
  console.log('CANCELLATION FINANCE UI PASS: four choices, real confirmation, preview, stable request, server version')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
