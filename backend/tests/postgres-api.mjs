import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
require('tsx/cjs')
const { validRegistrationPayload } = require('./helpers/registration.ts')

const base = process.env.TEST_API_URL ?? 'http://localhost:3100/api'
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
let passed = 0

async function request(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null }
}

function check(condition, label) {
  assert.ok(condition, label)
  passed += 1
  console.log(`OK ${passed}: ${label}`)
}

const health = await request('/health')
check(health.status === 200 && health.body.ok, 'health usa PostgreSQL')

const unauthorized = await request('/repairs')
check(unauthorized.status === 401, 'rutas privadas rechazan falta de token')

async function register(label) {
  return request('/auth/register', {
    method: 'POST',
    body: validRegistrationPayload({
      businessName: `Negocio ${label} ${suffix}`,
      firstName: 'Dueño',
      lastName: label.toUpperCase(),
      email: `owner-${label}-${suffix}@example.com`,
      password: 'Password-2026!',
    }),
  })
}

const accountA = await register('a')
const accountB = await register('b')
check(accountA.status === 201, 'registro negocio A')
check(accountB.status === 201, 'registro negocio B')
const tokenA = accountA.body.token
const tokenB = accountB.body.token

const login = await request('/auth/login', {
  method: 'POST',
  body: { email: accountA.body.user.email, password: 'Password-2026!' },
})
check(login.status === 200 && login.body.user.business.id === accountA.body.user.business.id, 'login en PostgreSQL')

const me = await request('/auth/me', { token: tokenA })
check(me.status === 200 && me.body.business.id === accountA.body.user.business.id, 'sesión conserva negocio')

const clientA = await request('/clients', {
  token: tokenA,
  method: 'POST',
  body: { name: 'Cliente Ñandú', phone: '+54 11 5555 9000' },
})
const clientB = await request('/clients', {
  token: tokenB,
  method: 'POST',
  body: { name: 'Cliente B', phone: '+54 11 5555 9000' },
})
check(clientA.status === 201 && clientB.status === 201, 'mismo teléfono permitido en negocios distintos')

const crossClient = await request(`/clients/${clientA.body.id}`, { token: tokenB })
check(crossClient.status === 404, 'cliente aislado entre negocios')

const repairPayload = {
  clientId: clientA.body.id,
  deviceBrand: 'Samsung',
  deviceModel: 'S23',
  issue: 'No enciende',
  diagnosis: 'Pendiente',
  total: 100,
}
const repair = await request('/repairs', { token: tokenA, method: 'POST', body: repairPayload })
check(repair.status === 201 && repair.body.clientId === clientA.body.id, 'reparación reutiliza cliente seleccionado')

const clientsA = await request('/clients/options', { token: tokenA })
check(clientsA.status === 200 && clientsA.body.length === 1, 'no duplica cliente al crear reparación')

const updatedRepair = await request(`/repairs/${repair.body.id}`, {
  token: tokenA,
  method: 'PATCH',
  body: { deviceBrand: 'Samsung', deviceModel: 'S23', issue: 'No carga', diagnosis: 'Puerto dañado', total: 100 },
})
const reloadedRepair = await request(`/repairs/${repair.body.id}`, { token: tokenA })
check(updatedRepair.status === 200 && reloadedRepair.body.diagnosis === 'Puerto dañado', 'edición de reparación persiste')

const status = await request(`/repairs/${repair.body.id}/status`, {
  token: tokenA,
  method: 'PATCH',
  body: { status: 'REPAIRING' },
})
check(status.status === 200 && status.body.status === 'REPAIRING', 'cambio de estado')

const tracking = await request(`/tracking/${repair.body.trackingToken}`)
check(tracking.status === 200 && !('businessId' in tracking.body), 'tracking público no expone negocio')

const concurrentRepairs = await Promise.all(
  Array.from({ length: 10 }, (_, index) =>
    request('/repairs', {
      token: tokenA,
      method: 'POST',
      body: { ...repairPayload, deviceModel: `Concurrente ${index}`, issue: `Falla ${index}` },
    }),
  ),
)
const numbers = concurrentRepairs.map((result) => result.body?.number)
check(concurrentRepairs.every((result) => result.status === 201), '10 reparaciones simultáneas creadas')
check(new Set(numbers).size === numbers.length, 'numeración simultánea sin duplicados')

const payments = await Promise.all([
  request(`/repairs/${repair.body.id}/payments`, { token: tokenA, method: 'POST', body: { amount: 75, method: 'CASH' } }),
  request(`/repairs/${repair.body.id}/payments`, { token: tokenA, method: 'POST', body: { amount: 75, method: 'TRANSFER' } }),
])
check(payments.filter((result) => result.status === 201).length === 1 && payments.filter((result) => result.status === 409).length === 1, 'pagos simultáneos respetan saldo')

const paidRepair = await request(`/repairs/${repair.body.id}`, { token: tokenA })
const paymentList = await request(`/repairs/${repair.body.id}/payments`, { token: tokenA })
check(paidRepair.body.paid === 75 && paymentList.body.length === 1, 'pago y total pagado consistentes')

const belowPaid = await request(`/repairs/${repair.body.id}`, {
  token: tokenA,
  method: 'PATCH',
  body: { deviceBrand: 'Samsung', deviceModel: 'S23', issue: 'No carga', diagnosis: 'Puerto dañado', total: 50 },
})
check(belowPaid.status === 400, 'total menor a pagado rechazado')

const cash = await request('/cash/movements', { token: tokenA })
check(
  cash.status === 200
    && Array.isArray(cash.body.items)
    && cash.body.items.some((row) => row.repairId === repair.body.id && row.amount === 75)
    && cash.body.total >= cash.body.items.length
    && cash.body.summary?.totalMovements === cash.body.total,
  'pago genera movimiento de caja',
)

const crossRepair = await request(`/repairs/${repair.body.id}`, { token: tokenB })
check(crossRepair.status === 404, 'reparación aislada entre negocios')

const dashboard = await request('/dashboard/overview', { token: tokenA })
check(dashboard.status === 200 && dashboard.body.current.activeRepairs === 11 && dashboard.body.modules.repairs.active === 11, 'dashboard consulta las 11 reparaciones activas en PostgreSQL')

console.log(JSON.stringify({ passed, result: 'ok' }))
