import 'dotenv/config'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'

// This integration test writes fixtures only to the project's local PostgreSQL.
const database = new URL(process.env.DATABASE_URL ?? '')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(database.hostname), 'Use local PostgreSQL only')
process.env.NODE_ENV = 'test'

function assertRedacted(value: unknown): void {
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    assert.ok(!['passwordHash', 'tokenVersion', 'passwordResetTokens'].includes(key), `Sensitive field exposed: ${key}`)
    assertRedacted(child)
  }
}

async function main() {
  const [{ app }, { prisma }] = await Promise.all([import('../src/server'), import('../src/lib/prisma')])
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const baseUrl = `http://127.0.0.1:${address.port}/api/platform-admin`
  let businessId: string | undefined
  try {
    const now = new Date()
    const end = new Date(now.getTime() + 30 * 86400000)
    const business = await prisma.business.create({ data: { name: `Redaction QA ${Date.now()}` } })
    businessId = business.id
    const subscription = await prisma.subscription.create({ data: {
      businessId, planCode: 'COMPLETE', status: 'TRIALING', trialStartedAt: now,
      trialEndsAt: end, trialConsumedAt: now, accessExpiresAt: end,
    } })
    const admin = await prisma.user.create({ data: {
      businessId, name: 'Redaction Admin', email: `${businessId}-admin@example.com`,
      passwordHash: 'sensitive-admin-hash', tokenVersion: 7, role: 'OWNER', platformRole: 'SUPER_ADMIN',
    } })
    const technician = await prisma.user.create({ data: {
      businessId, name: 'Redaction Technician', email: `${businessId}-tech@example.com`,
      passwordHash: 'sensitive-technician-hash', tokenVersion: 9, role: 'TECHNICIAN',
    } })
    const tokenFor = (user: typeof admin) => jwt.sign({
      userId: user.id, businessId, role: user.role, platformRole: user.platformRole, tokenVersion: user.tokenVersion,
    }, process.env.JWT_SECRET!, { expiresIn: '5m' })
    const get = async (path: string, token = tokenFor(admin)) => {
      const response = await fetch(`${baseUrl}${path}`, { headers: { authorization: `Bearer ${token}` } })
      return { status: response.status, body: await response.json() }
    }

    // D: Authorization must still reject an authenticated non-superadmin.
    assert.equal((await get(`/subscriptions/${subscription.id}`, tokenFor(technician))).status, 403)
    // A/B/C: Exercise the real HTTP serializer and Prisma projection, with two users.
    const detail = await get(`/subscriptions/${subscription.id}`)
    assert.equal(detail.status, 200)
    assert.equal(detail.body.business.id, businessId)
    assert.equal(detail.body.business.users.length, 2)
    assert.equal(detail.body.business.users.find((user: { role: string }) => user.role === 'OWNER')?.email, admin.email)
    assertRedacted(detail.body)

    // E: Other user-bearing panel responses keep their visible data and remain redacted.
    const businesses = await get(`/businesses?search=${encodeURIComponent(business.name)}`)
    assert.equal(businesses.status, 200)
    assert.equal(businesses.body.items.find((item: { id: string }) => item.id === businessId)?.users[0].email, admin.email)
    const businessDetail = await get(`/businesses/${businessId}`)
    assert.equal(businessDetail.status, 200)
    assert.equal(businessDetail.body.users.find((user: { id: string }) => user.id === technician.id)?.name, technician.name)
    const subscriptions = await get(`/subscriptions?search=${encodeURIComponent(business.name)}`)
    assert.equal(subscriptions.status, 200)
    assert.equal(subscriptions.body.find((item: { id: string }) => item.id === subscription.id)?.business.users[0].email, admin.email)
    for (const result of [businesses, businessDetail, subscriptions]) assertRedacted(result.body)
    console.log('platform-admin user redaction: A/B/C/D/E passed (real local PostgreSQL + HTTP)')
  } finally {
    if (businessId) await prisma.$transaction([
      prisma.subscription.deleteMany({ where: { businessId } }),
      prisma.user.deleteMany({ where: { businessId } }),
      prisma.business.deleteMany({ where: { id: businessId } }),
    ])
    await prisma.$disconnect()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
