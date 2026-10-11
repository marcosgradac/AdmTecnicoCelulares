const assert = require('node:assert/strict')
const { harness, collect } = require('./repair-flow.cjs')
const find = (view, type, label) => collect(view.root(), node => node.type === type && (node.props.label === label || node.props.children === label))[0]
async function main() {
  const purchases = []
  const drawer = harness('src/components/repairs/NewRepairDrawer.tsx', 'NewRepairDrawer', { open: true, initialClientId: 'c1', onClose() {}, onCreated() {} }, {
    createRepair: async input => { purchases.push(input); return { id: 'new' } },
    getClientOptions: async () => [{ id: 'c1', name: 'Synthetic' }],
  })
  await drawer.settle()
  const brand = collect(drawer.root(), node => node.type === 'Autocomplete' && node.props.renderInput?.({ InputProps: {} }).props.label === 'Marca')[0]
  brand.props.onChange(null, 'Samsung'); await drawer.settle()
  find(drawer, 'TextField', 'Modelo').props.onChange({ target: { value: 'Synthetic' } })
  find(drawer, 'TextField', 'Falla informada').props.onChange({ target: { value: 'Synthetic broken screen' } })
  await drawer.settle()
  find(drawer, 'CurrencyField', 'Presupuesto de repuestos').props.onValueChange(30000); await drawer.settle()
  const form = () => collect(drawer.root(), node => node.type === 'FormDrawer')[0]
  form().props.onSubmit(); await drawer.settle()
  assert.equal(purchases.length, 1)
  assert.equal(purchases[0].partsCost, 30000)
  assert.equal(purchases[0].initialExpenseAmount, undefined, 'Budget alone must never declare a purchase')
  assert.equal(purchases[0].partsCostMethod, undefined)

  brand.props.onChange(null, 'Samsung'); await drawer.settle()
  find(drawer, 'TextField', 'Modelo').props.onChange({ target: { value: 'Synthetic' } })
  find(drawer, 'TextField', 'Falla informada').props.onChange({ target: { value: 'Synthetic issue' } })
  find(drawer, 'CurrencyField', 'Gasto realizado de repuestos').props.onValueChange(25000); await drawer.settle()
  find(drawer, 'TextField', 'Medio de pago del gasto').props.onChange({ target: { value: 'CASH' } }); await drawer.settle()
  form().props.onSubmit(); await drawer.settle()
  assert.equal(purchases.length, 1, 'A selected method alone cannot confirm a purchase')
  collect(drawer.root(), node => node.type === 'FormControlLabel')[0].props.control.props.onChange({ target: { checked: true } }); await drawer.settle()
  find(drawer, 'CurrencyField', 'Presupuesto de repuestos').props.onValueChange(40000); await drawer.settle()
  form().props.onSubmit(); await drawer.settle()
  assert.equal(purchases.length, 2)
  assert.equal(purchases[1].partsCost, 40000)
  assert.equal(purchases[1].initialExpenseAmount, 25000)
  assert.equal(purchases[1].initialExpenseMethod, 'CASH')
  assert.equal(purchases[1].expenseConfirmed, true)

  const payments = []
  const paymentView = harness('src/components/repairs/RepairPaymentDialog.tsx', 'RepairPaymentDialog', { repair: { id: 'payment-repair' }, onClose() {}, onRegistered() {} }, {
    registerPayment: async (_, input) => { payments.push(input); if (payments.length === 1) throw new Error('Synthetic lost response') },
  })
  await paymentView.settle()
  find(paymentView, 'CurrencyField', 'Importe').props.onValueChange(20000); await paymentView.settle()
  assert.equal(find(paymentView, 'Button', 'Guardar pago').props.disabled, true)
  collect(paymentView.root(), node => node.type === 'FormControlLabel')[0].props.control.props.onChange({ target: { checked: true } }); await paymentView.settle()
  find(paymentView, 'Button', 'Guardar pago').props.onClick(); await paymentView.settle()
  find(paymentView, 'Button', 'Guardar pago').props.onClick(); await paymentView.settle()
  assert.equal(payments.length, 2)
  assert.deepEqual(payments[1], payments[0], 'Retry after a lost response preserves the exact financial command')
  assert.equal(payments[0].confirmed, true)
  assert.match(payments[0].requestId, /^[\da-f-]{36}$/)

  const repair = { id: 'r', status: 'cancelled', expenseEntries: [{ id: 'expense', amount: 30000, remaining: 30000, description: 'Actual purchase', historical: true }], financialSummary: { refundBalance: 20000 } }
  for (const kind of ['SUPPLIER_REFUND', 'EXPENSE_CORRECTION', 'CUSTOMER_REFUND']) {
    const calls = []
    const view = harness('src/components/repairs/RepairFinancialOperationDialog.tsx', 'RepairFinancialOperationDialog', { repair, kind, onClose() {}, onRegistered() {} }, {
      getRepair: async () => repair,
      registerRepairFinancialOperation: async (_, input) => { calls.push(input); return repair },
      registerCancellationRefund: async (_, input) => { calls.push(input); return repair },
    })
    await view.settle()
    if (kind !== 'CUSTOMER_REFUND') find(view, 'TextField', 'Gasto original').props.onChange({ target: { value: 'expense' } })
    await view.settle()
    if (kind === 'EXPENSE_CORRECTION') find(view, 'TextField', 'Motivo de la corrección').props.onChange({ target: { value: 'Confirmed synthetic evidence: never purchased' } })
    await view.settle()
    assert.equal(find(view, 'Button', 'Registrar operación').props.disabled, true)
    const confirmation = collect(view.root(), node => node.type === 'FormControlLabel')[0]
    confirmation.props.control.props.onChange({ target: { checked: true } }); await view.settle()
    find(view, 'Button', 'Registrar operación').props.onClick(); await view.settle()
    assert.equal(calls.length, 1)
    assert.equal(calls[0].confirmed, true)
    assert.match(calls[0].requestId, /^[\da-f-]{36}$/)
    assert.equal(calls[0].amount, kind === 'CUSTOMER_REFUND' ? 20000 : 30000)
    if (kind === 'EXPENSE_CORRECTION') {
      assert.equal(calls[0].method, undefined, 'Accounting correction must not invent a payment method')
      assert.ok(calls[0].reason)
    }
  }
  console.log('FINANCIAL OPERATIONS UI PASS: budget without expenditure, supplier refunds, non-cash corrections, customer refunds, confirmations and stable request IDs')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
