import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'

const base = process.env.TEST_API_URL ?? 'http://localhost:3100/api'
const prisma = new PrismaClient()
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
let passed = 0
const check = (condition, label) => {
  assert.ok(condition, label)
  console.log(`OK ${++passed}: ${label}`)
}
const request = async (path, { token, method = 'GET', body } = {}) => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null }
}
const hasPasswordHash = value => {
  if (!value || typeof value !== 'object') return false
  if (Array.isArray(value)) return value.some(hasPasswordHash)
  return Object.entries(value).some(([key, child]) => key === 'passwordHash' || hasPasswordHash(child))
}
const register = label => request('/auth/register', {
  method: 'POST',
  body: { firstName: `Owner${label}`, lastName: 'QA', email: `owner-${label}-${suffix}@example.com`, password: 'Password-2026!', businessName: `Negocio ${label}` },
})
const login = (email, password = 'Password-2026!') => request('/auth/login', { method: 'POST', body: { email, password } })

const ownerA = await register('A')
const ownerB = await register('B')
check(ownerA.status === 201 && ownerB.status === 201, 'negocios A y B registrados')
const tokenA = ownerA.body.token
const tokenB = ownerB.body.token

const listA = await request('/team', { token: tokenA })
check(listA.status === 200 && listA.body.users.length === 1, 'OWNER lista usuarios de su negocio')
check(!hasPasswordHash(listA.body), 'lista de Equipo no devuelve passwordHash')

const rejectedBusinessId = await request('/team', {
  token: tokenA,
  method: 'POST',
  body: { firstName: 'Mal', lastName: 'Asignado', email: `bad-${suffix}@example.com`, password: 'Password-2026!', role: 'TECHNICIAN', businessId: ownerB.body.user.business.id },
})
check(rejectedBusinessId.status === 400, 'businessId manual es rechazado')

const techEmail = `tech-a-${suffix}@example.com`
const technician = await request('/team', {
  token: tokenA,
  method: 'POST',
  body: { firstName: 'Juan', lastName: 'Técnico', email: techEmail, phone: '+54 11 4000-1000', password: 'Password-2026!', role: 'TECHNICIAN' },
})
check(technician.status === 201 && technician.body.role === 'TECHNICIAN', 'OWNER crea TECHNICIAN')
const techLogin = await login(techEmail)
check(techLogin.status === 200, 'usuario creado puede iniciar sesión')
let techToken = techLogin.body.token

const techTeam = await request('/team', { token: techToken })
check(techTeam.status === 403, 'TECHNICIAN recibe 403 en Equipo')

const duplicate = await request('/team', {
  token: tokenA,
  method: 'POST',
  body: { firstName: 'Duplicado', lastName: 'QA', email: techEmail.toUpperCase(), password: 'Password-2026!', role: 'TECHNICIAN' },
})
check(duplicate.status === 409, 'email duplicado devuelve 409')

const techB = await request('/team', {
  token: tokenB,
  method: 'POST',
  body: { firstName: 'Técnico', lastName: 'B', email: `tech-b-${suffix}@example.com`, password: 'Password-2026!', role: 'TECHNICIAN' },
})
check(techB.status === 201, 'negocio B crea su propio técnico')
const listAAfter = await request('/team', { token: tokenA })
check(!listAAfter.body.users.some(user => user.id === techB.body.id), 'OWNER A no ve usuarios de B')
check((await request(`/team/${techB.body.id}`, { token: tokenA })).status === 404, 'consulta cruzada devuelve 404')
check((await request(`/team/${techB.body.id}`, { token: tokenA, method: 'PATCH', body: { phone: '12345678' } })).status === 404, 'edición cruzada devuelve 404')
check((await request(`/team/${techB.body.id}/reset-password`, { token: tokenA, method: 'POST', body: { password: 'NuevaClave123' } })).status === 404, 'reset cruzado devuelve 404')

const edited = await request(`/team/${technician.body.id}`, {
  token: tokenA,
  method: 'PATCH',
  body: { firstName: 'Juana', lastName: 'Soporte', phone: '11 5555-7777' },
})
check(edited.status === 200 && edited.body.fullName === 'Juana Soporte' && edited.body.phone === '1155557777', 'OWNER edita nombre y teléfono')
const stored = await prisma.user.findUnique({ where: { id: technician.body.id } })
check(stored?.name === 'Juana Soporte', 'User.name sincronizado con fullName')

const promoted = await request(`/team/${technician.body.id}`, { token: tokenA, method: 'PATCH', body: { role: 'OWNER' } })
check(promoted.status === 200 && promoted.body.role === 'OWNER', 'OWNER cambia TECHNICIAN a OWNER')
const promotedLogin = await login(techEmail)
check(promotedLogin.status === 200 && promotedLogin.body.user.role === 'OWNER', 'rol nuevo se refleja en sesión nueva')
const promotedToken = promotedLogin.body.token

check((await request(`/team/${ownerB.body.user.id}`, { token: tokenB, method: 'PATCH', body: { role: 'TECHNICIAN' } })).status === 409, 'último OWNER no puede degradarse')
check((await request(`/team/${ownerB.body.user.id}`, { token: tokenB, method: 'PATCH', body: { isActive: false } })).status === 400, 'OWNER no puede desactivarse a sí mismo')
check((await request(`/team/${ownerA.body.user.id}`, { token: tokenA, method: 'PATCH', body: { isActive: false } })).status === 400, 'OWNER tampoco se desactiva aunque exista otro OWNER')

const disposableEmail = `disposable-${suffix}@example.com`
const disposable = await request('/team', {
  token: tokenA, method: 'POST',
  body: { firstName: 'Temporal', lastName: 'QA', email: disposableEmail, password: 'Password-2026!', role: 'TECHNICIAN' },
})
check(disposable.status === 201, 'crea técnico para ciclo de activación')
check((await request(`/team/${disposable.body.id}`, { token: tokenA, method: 'PATCH', body: { isActive: false } })).body.isActive === false, 'OWNER desactiva TECHNICIAN')
check((await login(disposableEmail)).status === 403, 'usuario desactivado no inicia sesión')
check((await request(`/team/${disposable.body.id}`, { token: tokenA, method: 'PATCH', body: { isActive: true } })).body.isActive === true, 'OWNER reactiva usuario')

const reset = await request(`/team/${disposable.body.id}/reset-password`, { token: tokenA, method: 'POST', body: { password: 'NuevaClave123' } })
check(reset.status === 200 && reset.body.success, 'OWNER restablece contraseña')
check((await login(disposableEmail)).status === 401, 'contraseña anterior deja de funcionar')
const activeTechnicianLogin = await login(disposableEmail, 'NuevaClave123')
check(activeTechnicianLogin.status === 200, 'contraseña nueva funciona')
const restrictedTechToken = activeTechnicianLogin.body.token

check((await request('/cash/movements', { token: restrictedTechToken })).status === 403, 'TECHNICIAN no accede a caja ni datos financieros')
const technicianDashboard = await request('/dashboard/summary', { token: restrictedTechToken })
check(technicianDashboard.status === 200 && technicianDashboard.body.monthlyIncome === 0, 'dashboard técnico funciona sin exponer ingresos')
const repair = await request('/repairs', {
  token: restrictedTechToken, method: 'POST',
  body: { clientName: 'Cliente Técnico', phone: `11${Date.now().toString().slice(-8)}`, deviceBrand: 'Moto', deviceModel: 'G', issue: 'No enciende', total: 100 },
})
check(repair.status === 201, 'TECHNICIAN puede crear reparaciones')
check((await request('/stock', { token: restrictedTechToken })).status === 200, 'TECHNICIAN puede consultar stock')
const stock = await request('/stock', {
  token: tokenA, method: 'POST',
  body: { name: `Stock ${suffix}`, category: 'QA', quantity: 5, minimumStock: 0, cost: 10, salePrice: 20 },
})
check((await request(`/stock/${stock.body.id}`, { token: restrictedTechToken, method: 'DELETE' })).status === 403, 'TECHNICIAN no puede desactivar stock')
check((await request(`/stock/${stock.body.id}`, { token: restrictedTechToken, method: 'PATCH', body: { cost: 99 } })).status === 403, 'TECHNICIAN no puede editar costes')
check((await request(`/tracking/${repair.body.trackingToken}`)).status === 200, 'seguimiento público continúa funcionando')
check((await request('/health')).status === 200, 'health continúa respondiendo 200')

const simultaneous = await Promise.all([
  request(`/team/${technician.body.id}`, { token: tokenA, method: 'PATCH', body: { role: 'TECHNICIAN' } }),
  request(`/team/${ownerA.body.user.id}`, { token: promotedToken, method: 'PATCH', body: { role: 'TECHNICIAN' } }),
])
check(simultaneous.filter(result => result.status === 200).length === 1 && simultaneous.filter(result => result.status === 409).length === 1, 'concurrencia permite degradar sólo un OWNER')
const businessAId = ownerA.body.user.business.id
check(await prisma.user.count({ where: { businessId: businessAId, role: 'OWNER', isActive: true } }) === 1, 'concurrencia conserva un OWNER activo')

const allResponses = [ownerA, ownerB, listA, technician, techLogin, techB, edited, promoted, disposable, reset, repair, stock]
check(!allResponses.some(response => hasPasswordHash(response.body)), 'ninguna respuesta expone passwordHash')

console.log(JSON.stringify({ passed, result: 'ok' }))
await prisma.$disconnect()
