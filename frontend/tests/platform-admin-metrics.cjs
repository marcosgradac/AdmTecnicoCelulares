// Render actual section components and chips; simulate only resource/hooks and UI primitives.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('../node_modules/typescript')

function render(file, exportName, data, mobile = false) {
  const cache = new Map()
  const jsx = (type, props) => ({ type, props })
  const primitives = new Proxy({}, { get: (_, key) => key })
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative)
    const exports = {}
    cache.set(relative, exports)
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/features/platformAdmin', relative), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText, { exports, require(name) {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
      if (name === 'react') return { useState: value => [value, () => {}] }
      if (name === '@mui/material') return new Proxy({ useMediaQuery: () => mobile, useTheme: () => ({ breakpoints: { down: () => 'md' } }) }, { get: (object, key) => object[key] ?? key })
      if (name.endsWith('platformAdmin.shared')) return load('platformAdmin.shared.tsx')
      if (name.endsWith('platformAdmin.hooks')) return { usePlatformResource: () => ({ data, loading: false, error: null, reload: () => {} }) }
      if (name.endsWith('platformAdmin.dialogs')) return { useBusinessLifecycleActions: () => ({ element: null }) }
      if (name.endsWith('billing.utils')) return { formatDate: value => value, formatARS: value => `$${value}` }
      return primitives
    } })
    return exports
  }
  function expand(node) {
    if (Array.isArray(node)) return node.map(expand)
    if (!node || typeof node !== 'object') return node
    if (typeof node.type === 'function') return expand(node.type(node.props))
    return { ...node, props: Object.fromEntries(Object.entries(node.props ?? {}).map(([key, value]) => [key, expand(value)])) }
  }
  return expand(load(file)[exportName]({ refreshToken: 0, onDataChanged() {}, onOpenBusiness() {} }))
}
function collect(node, type, found = []) {
  if (!node || typeof node !== 'object') return found
  if (node.type === type) found.push(node.props)
  for (const value of Object.values(node)) collect(value, type, found)
  return found
}
const business = status => ({ id: 'customer', name: 'Customer', users: [{ name: 'Owner', email: 'owner@example.test' }], _count: { users: 1, repairs: 0, clients: 0 }, subscription: { status, plan: { name: 'Completo' } }, access: { status: 'ACTIVE', expiresAt: null, daysRemaining: 30 } })
for (const mobile of [false, true]) {
  const trial = render('sections/BusinessesSection.tsx', 'BusinessesSection', { items: [business('TRIALING')], total: 1, page: 1 }, mobile)
  assert.equal(collect(trial, mobile ? 'RecordCard' : 'Table').length, 1, 'Render the actual responsive branch')
  const chips = collect(trial, 'Chip')
  assert.equal(chips.filter(chip => chip.label === 'En prueba').length, 1)
  assert.ok(!chips.some(chip => chip.label === 'Activo'))
  assert.equal(chips.find(chip => chip.label === 'En prueba').sx.color, '#1D6FB8')
  for (const status of ['ACTIVE', 'GRACE', 'SUSPENDED', null]) {
    const row = business(status)
    if (status === null) row.subscription = null
    const normal = render('sections/BusinessesSection.tsx', 'BusinessesSection', { items: [row], total: 1, page: 1 }, mobile)
    assert.equal(collect(normal, 'Chip').filter(chip => chip.label === 'Activo').length, 1, 'Non-trials preserve AccountAccess presentation')
  }
}
const dashboard = render('sections/DashboardSection.tsx', 'DashboardSection', {
  clients: 2, activeBusinesses: 2, inactiveBusinesses: 0, active: 0, trials: 2, pendingPayments: 0, estimatedMrrARS: 0,
  grace: 0, suspended: 0, owners: 2, technicians: 0, lifecycle: { expiring: 0, grace: 0, blocked: 0 }, attention: [], recentBusinesses: [],
})
const cards = collect(dashboard, 'StatCard')
for (const [label, value] of [['Negocios', '2'], ['Suscripciones activas', '0'], ['Trials en curso', '2'], ['Pagos pendientes', '0'], ['MRR estimado', '$0']]) assert.equal(cards.find(card => card.label === label).value, value)
assert.equal(cards.find(card => card.label === 'Negocios').helper, '2 habilitados · 0 deshabilitados')
assert.equal(cards.find(card => card.label === 'Suscripciones activas').helper, 'Planes activados fuera del período de prueba')
console.log('platform-admin UI: actual desktop/mobile trial chips, non-trial access chips and commercial dashboard passed')
