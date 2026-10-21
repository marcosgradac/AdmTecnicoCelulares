// Invoked by the existing isolated PostgreSQL harness; no production database allowed.
import assert from 'node:assert/strict'
import { validateRegistration } from '../../frontend/src/components/auth/registerValidation'
const database = new URL(process.env.DATABASE_URL || '')
assert.equal(database.hostname, '127.0.0.1')
assert.equal(database.pathname, '/repair_finance_test')
process.env.NODE_ENV = 'test'
process.env.RATE_LIMIT_SIGNUP_MAX = '35'
process.env.MAIL_MODE = 'fake'
process.env.TURNSTILE_SECRET_KEY = 'local-registration-only'
const nativeFetch = globalThis.fetch
let verification: 'valid' | 'invalid' | 'unavailable' = 'valid'
let verificationCalls = 0
globalThis.fetch = (async (input, init) => {
  const url = new URL(String(input))
  if (url.hostname === 'challenges.cloudflare.com') {
    verificationCalls++
    if (verification === 'unavailable') throw new Error('Synthetic unavailability')
    return new Response(JSON.stringify({ success: verification === 'valid' }))
  }
  assert.equal(url.hostname, '127.0.0.1', 'No external HTTP')
  return nativeFetch(input, init)
}) as typeof fetch
async function main() {
  const [{ app }, { prisma }, { validRegistrationPayload }] = await Promise.all([import('../src/server'), import('../src/lib/prisma'), import('./helpers/registration')])
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>(done => server.once('listening', done))
  const address = server.address(); assert(address && typeof address !== 'string')
  const base = `http://127.0.0.1:${address.port}/api/auth/register`
  const email = `registration-${Date.now()}@example.invalid`
  const payload = validRegistrationPayload({ firstName: 'marina', lastName: 'demo', phone: '0000000001', businessPhone: '0000000002', email, password: 'Registro123', businessName: 'Taller ficticio' })
  const frontendErrors = (password: string) => validateRegistration({ firstName: 'marina', lastName: 'demo', phone: '0000000001', businessPhone: '0000000002', email, password, repeatPassword: password, businessName: 'Taller ficticio', terms: true })
  let passed = 0
  const send = async (overrides: Record<string, unknown> = {}) => {
    const r = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, ...overrides }) })
    return { status: r.status, body: await r.json() as any }
  }
  try {
    for (const password of ['abcdef12!', 'ABCDEF12!', 'Abcdefgh!', 'Abc123', 'Aa1' + 'x'.repeat(126)]) {
      assert(frontendErrors(password).password, 'Frontend must reject the same invalid password')
      const before = verificationCalls
      assert.equal((await send({ password })).status, 400)
      assert.equal(verificationCalls, before, 'Validation runs before Turnstile or writes'); passed++
    }
    for (const overrides of [{ firstName: '' }, { lastName: '' }, { businessName: 'A' }, { phone: 'abc' }, { businessPhone: '123' }, { email: 'not-an-email' }, { termsAccepted: false }, { privacyAccepted: false }, { termsVersion: 'obsolete' }, { privacyVersion: 'obsolete' }, { turnstileToken: '' }]) {
      assert.equal((await send(overrides)).status, 400); passed++
    }
    assert.equal(await prisma.user.count({ where: { email } }), 0)
    verification = 'invalid'; assert.equal((await send()).status, 403); passed++
    verification = 'unavailable'; assert.equal((await send()).status, 503); passed++
    assert.equal(await prisma.user.count({ where: { email } }), 0)
    verification = 'valid'; assert(!Object.values(frontendErrors('Registro123')).some(Boolean)); const registered = await send(); assert.equal(registered.status, 201)
    assert.equal(registered.body.user.firstName, 'marina'); assert.equal(registered.body.user.lastName, 'demo')
    assert(!('passwordHash' in registered.body.user)); passed++
    const saved = await prisma.user.findUniqueOrThrow({ where: { email } })
    assert.equal(saved.termsVersion, payload.termsVersion); assert.equal(saved.privacyVersion, payload.privacyVersion)
    assert(saved.termsAcceptedAt && saved.privacyAcceptedAt); passed++
    const duplicate = await send(); assert.equal(duplicate.status, 409); assert.equal(duplicate.body.message, 'No pudimos crear la cuenta con esos datos.'); passed++
    assert(!Object.values(frontendErrors('Aa1' + 'x'.repeat(125))).some(Boolean))
    assert.equal((await send({ password: 'Aa1' + 'x'.repeat(125), email: 'boundary-' + email })).status, 201); passed++
    assert(!Object.values(frontendErrors('Abcdef12')).some(Boolean))
    assert.equal((await send({ password: 'Abcdef12', email: 'minimum-' + email })).status, 201); passed++
    let limited = false
    for (let i = 0; i < 40; i++) if ((await send()).status === 429) { limited = true; break }
    assert(limited, 'Signup rate limit remains active'); passed++
    console.log(`PASS ${passed} backend registration/security contracts on isolated PostgreSQL`)
  } finally { await new Promise<void>(done => server.close(() => done())); await prisma.$disconnect(); globalThis.fetch = nativeFetch }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
