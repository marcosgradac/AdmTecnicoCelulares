import 'dotenv/config'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
process.env.MAIL_MODE = 'fake'
process.env.NODE_ENV = 'test'
process.env.TURNSTILE_SECRET_KEY = 'test-only-secret'
process.env.RATE_LIMIT_PASSWORD_CODE_USER_MAX = '20'
process.env.RATE_LIMIT_PASSWORD_VERIFY_MAX = '30'
const nativeFetch = globalThis.fetch
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => String(input).includes('challenges.cloudflare.com/turnstile') ? Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 })) : nativeFetch(input, init)) as typeof fetch
async function main() {
const [{ app }, { prisma }, mail] = await Promise.all([import('../src/server'), import('../src/lib/prisma'), import('../src/services/email/email.service')])
const server = app.listen(0); await new Promise<void>(resolve => server.once('listening', resolve)); const address = server.address(); assert.ok(address && typeof address === 'object'); const base = `http://127.0.0.1:${address.port}/api`; const suffix = Date.now().toString(); let passed = 0
const check = (value: unknown, label: string) => { assert.ok(value, label); console.log(`OK ${++passed}: ${label}`) }
const request = async (path: string, body?: object, token?: string) => { const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body ?? {}) }); return { status: response.status, body: await response.json() as Record<string, any> } }
try {
  const registered = await request('/auth/register', { firstName: 'Código', lastName: 'QA', phone: '+54 11 5555-1111', email: `code-${suffix}@example.com`, password: 'Anterior123A', businessName: `Code ${suffix}`, businessPhone: '+54 11 4444-2222', termsAccepted: true, termsVersion: '1.0', privacyAccepted: true, privacyVersion: '1.0', turnstileToken: 'test-token' }); check(registered.status === 201, 'crea usuario de prueba'); const authToken = String(registered.body.token); const userId = String(registered.body.user.id)
  mail.clearFakeOutbox(); const sent = await request('/auth/password-change/request', {}, authToken); check(sent.status === 200 && mail.getFakeOutbox().length === 1, 'solicitud aceptada por transporte simulado'); const code = mail.getFakeOutbox()[0].code!; check(/^\d{6}$/.test(code), 'código criptográfico de seis dígitos')
  const stored = await prisma.passwordResetToken.findUnique({ where: { tokenHash: createHash('sha256').update(`${userId}:${code}`).digest('hex') } }); check(Boolean(stored) && stored?.tokenHash !== code && stored?.attempts === 0, 'guarda hash y contador, no texto plano'); const ttl = stored!.expiresAt.getTime() - stored!.createdAt.getTime(); check(ttl >= 595_000 && ttl <= 600_000, 'vence en diez minutos')
  check((await request('/auth/password-change/request', {}, authToken)).status === 429, 'cooldown backend bloquea reenvío inmediato')
  await prisma.passwordResetToken.update({ where: { id: stored!.id }, data: { expiresAt: new Date(Date.now() - 1000) } }); check((await request('/auth/password-change/verify', { code }, authToken)).status === 410, 'rechaza código vencido'); await prisma.passwordResetToken.update({ where: { id: stored!.id }, data: { usedAt: new Date() } })
  await request('/auth/password-change/request', {}, authToken); const limitedCode = mail.getFakeOutbox().at(-1)!.code!; for (let i = 0; i < 5; i++) await request('/auth/password-change/verify', { code: `9${i}9999` }, authToken); const limited = await prisma.passwordResetToken.findUnique({ where: { tokenHash: createHash('sha256').update(`${userId}:${limitedCode}`).digest('hex') } }); check(limited?.attempts === 5 && Boolean(limited.usedAt), 'cinco intentos invalidan el código')
  await request('/auth/password-change/request', {}, authToken); const validCode = mail.getFakeOutbox().at(-1)!.code!; const verified = await request('/auth/password-change/verify', { code: validCode }, authToken); check(verified.status === 200 && Boolean(verified.body.verificationToken), 'verificación entrega autorización temporal'); check((await request('/auth/password-change/confirm', { verificationToken: verified.body.verificationToken, newPassword: 'NuevaClave456', confirmPassword: 'distinta' }, authToken)).status === 400, 'rechaza confirmación distinta'); const changed = await request('/auth/password-change/confirm', { verificationToken: verified.body.verificationToken, newPassword: 'NuevaClave456', confirmPassword: 'NuevaClave456' }, authToken); check(changed.status === 200, 'cambia contraseña con autorización válida'); check((await request('/auth/login', { email: `code-${suffix}@example.com`, password: 'NuevaClave456' })).status === 200, 'nueva contraseña permite iniciar sesión'); check((await request('/auth/password-change/confirm', { verificationToken: verified.body.verificationToken, newPassword: 'OtraClave789', confirmPassword: 'OtraClave789' }, authToken)).status === 401, 'autorización no puede reutilizarse')
  console.log(`PASSWORD CHANGE TESTS PASSED: ${passed}`)
} finally { await prisma.$disconnect(); await new Promise<void>(resolve => server.close(() => resolve())) }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
