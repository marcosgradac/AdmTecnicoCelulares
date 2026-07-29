import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'

const api = process.env.TEST_API_URL ?? 'http://localhost:3100/api'
const prisma = new PrismaClient()
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
let passed = 0
const check = (condition, label) => {
  assert.ok(condition, label)
  console.log(`OK ${++passed}: ${label}`)
}
const request = async (path, { token, method = 'GET', body } = {}) => {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null }
}

const email = ` Marco.Auth.${suffix}@Example.com `
const registration = await request('/auth/register', {
  method: 'POST',
  body: {
    firstName: ' Marco ',
    lastName: ' Pérez ',
    phone: '+54 11 5555-1111',
    email,
    password: 'Password-2026!',
    businessName: ' Servicio Auth ',
    businessPhone: '+54 11 4444-2222',
  },
})
check(registration.status === 201, 'registro con contrato nuevo')
check(registration.body.user.firstName === 'Marco' && registration.body.user.lastName === 'Pérez', 'normaliza nombre y apellido')
check(registration.body.user.phone === '541155551111' && registration.body.user.profileComplete, 'normaliza teléfono y completa perfil')
check(!('passwordHash' in registration.body.user), 'registro no devuelve passwordHash')

const created = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() }, include: { business: true } })
check(Boolean(created && created.business && created.business.phone === '541144442222'), 'Business y User creados transaccionalmente')

const duplicate = await request('/auth/register', {
  method: 'POST',
  body: {
    firstName: 'Otro', lastName: 'Usuario', email: email.toUpperCase(), password: 'Password-2026!', businessName: 'Duplicado',
  },
})
check(duplicate.status === 409 && duplicate.body.message === 'Ya existe una cuenta con ese correo', 'email duplicado case-insensitive devuelve 409')

const login = await request('/auth/login', { method: 'POST', body: { email: email.toUpperCase(), password: 'Password-2026!' } })
check(login.status === 200 && login.body.user.fullName === 'Marco Pérez', 'login por email y contraseña')

const wrongPassword = await request('/auth/login', { method: 'POST', body: { email, password: 'incorrecta' } })
check(wrongPassword.status === 401 && wrongPassword.body.message === 'Email o contraseña incorrectos', 'contraseña incorrecta usa mensaje general')

const me = await request('/auth/me', { token: login.body.token })
check(me.status === 200 && me.body.fullName === 'Marco Pérez' && !('passwordHash' in me.body), '/auth/me devuelve fullName sin hash')

const historical = await prisma.user.findFirst({ where: { firstName: null, lastName: null }, orderBy: { createdAt: 'asc' } })
assert.ok(historical, 'Se necesita usuario histórico en la base de prueba')
const historicalLogin = await request('/auth/login', { method: 'POST', body: { email: historical.email, password: 'Password-2026!' } })
check(historicalLogin.status === 200 && historicalLogin.body.user.profileComplete === false, 'usuario histórico puede iniciar sesión con perfil incompleto')

const completed = await request('/profile', {
  token: historicalLogin.body.token,
  method: 'PATCH',
  body: { firstName: 'Histórico', lastName: 'Verificado', phone: '11 4000-5000' },
})
check(completed.status === 200 && completed.body.profileComplete && completed.body.fullName === 'Histórico Verificado', 'completa perfil histórico')
const profile = await request('/profile', { token: historicalLogin.body.token })
check(profile.status === 200 && profile.body.phone === '1140005000', 'GET /profile confirma persistencia')

const privateClient = await request('/clients', { token: login.body.token, method: 'POST', body: { name: 'Cliente privado', phone: `11${Date.now().toString().slice(-8)}` } })
const foreignClient = await request(`/clients/${privateClient.body.id}`, { token: historicalLogin.body.token })
check(privateClient.status === 201 && foreignClient.status === 404, 'aislamiento multinegocio permanece activo')

const publicRepair = await prisma.repair.findFirst({ select: { trackingToken: true } })
assert.ok(publicRepair)
const tracking = await request(`/tracking/${publicRepair.trackingToken}`)
check(tracking.status === 200 && !('businessId' in tracking.body), 'seguimiento público continúa disponible')

let limited = false
for (let attempt = 0; attempt < 15; attempt += 1) {
  const response = await request('/auth/login', { method: 'POST', body: { email: `missing-${suffix}@example.com`, password: 'incorrecta' } })
  if (response.status === 429) { limited = true; break }
}
check(limited, 'rate limiting responde HTTP 429')

console.log(JSON.stringify({ passed, result: 'ok' }))
await prisma.$disconnect()
