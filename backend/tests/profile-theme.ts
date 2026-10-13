import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import express from 'express'
const database = new URL(process.env.DATABASE_URL ?? '')
assert.equal(database.hostname, '127.0.0.1')
assert.equal(database.pathname, '/repair_finance_test')
process.env.RATE_LIMIT_AUTH_WRITES_MAX = '40'
async function main() {
  const [{ createAuthRoutes }, { prisma }] = await Promise.all([import('../src/modules/auth/auth.routes'), import('../src/lib/prisma')])
  const app = express(); app.use(express.json()); createAuthRoutes()(app)
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  const request = async (path: string, token = '', body?: unknown, method = body === undefined ? 'GET' : 'PATCH') => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    return { status: response.status, body: await response.json() as any }
  }
  try {
    const business = await prisma.business.create({ data: { name: 'Theme synthetic' } })
    const foreign = await prisma.business.create({ data: { name: 'Theme foreign' } })
    const passwordHash = await bcrypt.hash('SyntheticTheme123!', 4)
    const create = (businessId: string, role: 'OWNER' | 'TECHNICIAN') => prisma.user.create({ data: { businessId, name: role, email: `theme-${randomUUID()}@example.com`, passwordHash, role, permissions: [] } })
    const owner = await create(business.id, 'OWNER'), technician = await create(business.id, 'TECHNICIAN'), outsider = await create(foreign.id, 'OWNER')
    const token = (user: typeof owner, businessId = user.businessId) => jwt.sign({ userId: user.id, businessId, role: user.role, platformRole: user.platformRole, tokenVersion: user.tokenVersion }, process.env.JWT_SECRET!, { algorithm: 'HS256', expiresIn: '1h' })
    const ownerToken = token(owner), techToken = token(technician)
    await prisma.cashMovement.create({ data: { businessId: business.id, type: 'INCOME', amount: 12345, description: 'Theme financial baseline', origin: 'GENERAL' } })
    const beforeMoney = await prisma.cashMovement.findMany({ where: { businessId: business.id } })
    const beforeUsers = await prisma.user.findMany({ where: { businessId: business.id }, orderBy: { id: 'asc' } })
    assert.equal((await request('/profile/theme', '', { themePreference: 'DARK' })).status, 401)
    assert.equal((await request('/profile/theme', 'invalid', { themePreference: 'DARK' })).status, 401)
    assert.equal((await request('/profile/theme', token(owner, foreign.id), { themePreference: 'DARK' })).status, 401)
    for (const body of [{}, { themePreference: 'dark' }, { themePreference: 'AUTO' }, { themePreference: null }, { themePreference: 1 }, { themePreference: 'DARK', userId: outsider.id }, { themePreference: 'DARK', businessId: foreign.id }, { themePreference: 'DARK', extra: true }]) assert.equal((await request('/profile/theme', ownerToken, body)).status, 400, JSON.stringify(body))
    for (const preference of ['LIGHT', 'DARK', 'SYSTEM']) {
      const result = await request('/profile/theme', ownerToken, { themePreference: preference })
      assert.equal(result.status, 200, JSON.stringify(result.body)); assert.deepEqual(result.body, { themePreference: preference })
      for (const path of ['/auth/me', '/profile']) assert.equal((await request(path, ownerToken)).body.themePreference, preference)
    }
    assert.equal((await request('/profile/theme', ownerToken, { themePreference: 'DARK' })).status, 200)
    assert.equal((await request('/profile/theme', techToken, { themePreference: 'LIGHT' })).status, 200)
    assert.equal((await request('/auth/me', ownerToken)).body.themePreference, 'DARK')
    assert.equal((await request('/auth/me', techToken)).body.themePreference, 'LIGHT')
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: outsider.id } })).themePreference, 'SYSTEM')
    const afterUsers = await prisma.user.findMany({ where: { businessId: business.id }, orderBy: { id: 'asc' } })
    const withoutTheme = ({ themePreference, updatedAt, ...user }: typeof owner) => user
    assert.deepEqual(afterUsers.map(withoutTheme), beforeUsers.map(withoutTheme), 'No security/profile/permission mutation')
    assert.deepEqual(await prisma.cashMovement.findMany({ where: { businessId: business.id } }), beforeMoney, 'Financial data unchanged')
    const relogin = await request('/auth/login', '', { email: owner.email, password: 'SyntheticTheme123!' }, 'POST')
    assert.equal(relogin.status, 200); assert.equal(relogin.body.user.themePreference, 'DARK')
    assert.equal((await request('/auth/me', relogin.body.token)).body.themePreference, 'DARK', 'Restored session reads persisted preference')
    await prisma.user.update({ where: { id: owner.id }, data: { themePreference: 'historical-invalid' } })
    assert.equal((await request('/auth/me', ownerToken)).body.themePreference, 'SYSTEM')
    assert.equal((await request('/profile', techToken, { firstName: 'Tech', lastName: 'Theme' })).body.themePreference, 'LIGHT')
    let limited = false
    for (let i = 0; i < 45; i++) if ((await request('/profile/theme', ownerToken, { themePreference: 'SYSTEM' })).status === 429) { limited = true; break }
    assert.ok(limited, 'Authenticated write limiter applies')
    assert.equal((await request('/profile/theme', techToken, { themePreference: 'DARK' })).status, 200, 'Limiter keys remain per user')
    console.log('PASS profile theme: strict input, authentication, tenant/self ownership, independent users, persistence, normalized legacy, security/money unchanged, limiter')
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await prisma.$disconnect() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
