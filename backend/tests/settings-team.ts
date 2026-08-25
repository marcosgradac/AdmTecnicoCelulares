import 'dotenv/config'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
process.env.TURNSTILE_SECRET_KEY = 'test-only-secret'
process.env.RATE_LIMIT_REGISTER_MAX = '10'
const nativeFetch = globalThis.fetch
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
  String(input).includes('challenges.cloudflare.com/turnstile')
    ? Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }))
    : nativeFetch(input, init)) as typeof fetch

async function main() {
  const [{ app }, { prisma }] = await Promise.all([import('../src/server'), import('../src/lib/prisma')])
  const server = app.listen(0)
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address(); assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}/api`, suffix = Date.now().toString(), businessIds: string[] = []
  let passed = 0
  const check = (condition: unknown, label: string) => { assert.ok(condition, label); console.log(`OK ${++passed}: ${label}`) }
  const request = async (method: string, path: string, body?: object, token?: string) => {
    const response = await fetch(`${base}${path}`, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
    const text = await response.text()
    return { status: response.status, body: text ? JSON.parse(text) as Record<string, any> : {} }
  }
  const requestLogo = async (body: Buffer, contentType: string, token: string) => {
    const response = await fetch(`${base}/settings/business/logo`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': contentType }, body })
    const text = await response.text()
    return { status: response.status, body: text ? JSON.parse(text) as Record<string, any> : {} }
  }
  const register = async (label: string) => {
    const response = await request('POST', '/auth/register', { firstName: label, lastName: 'Owner', phone: '+54 3571 555555', email: `${label.toLowerCase()}-${suffix}@example.com`, password: 'PruebaSegura123', businessName: `${label} ${suffix}`, businessPhone: '+54 3571 555555', termsAccepted: true, termsVersion: '1.0', privacyAccepted: true, privacyVersion: '1.0', turnstileToken: 'test-token' })
    assert.equal(response.status, 201); businessIds.push(response.body.user.business.id); return response
  }
  try {
    const first = await register('SettingsA'), second = await register('SettingsB')
    const ownerToken = String(first.body.token), otherOwnerToken = String(second.body.token)
    for (const value of ['San Martín 123', '  Av. Libertad 456, Río Tercero  ', '']) {
      const saved = await request('PATCH', '/settings/business', { name: 'Servicio QA', phone: '', address: value }, ownerToken)
      check(saved.status === 200 && saved.body.address === (value.trim() || null), `guarda dirección ${value ? 'con formato válido' : 'vacía como null'}`)
    }
    check((await request('PATCH', '/settings/business', { name: 'Servicio QA', phone: '', address: 'A'.repeat(181) }, ownerToken)).status === 400, 'rechaza dirección demasiado extensa')
    check((await request('PATCH', '/settings/business', { name: 'Servicio QA', phone: '', address: 'Calle 1', logoUrl: 'unexpected' }, ownerToken)).status === 400, 'rechaza campos no editables')
    const pngLogo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
    const uploadedLogo = await requestLogo(pngLogo, 'image/png', ownerToken)
    check(uploadedLogo.status === 200 && String(uploadedLogo.body.logoUrl).includes('/api/business-logo/'), 'propietario sube un logo PNG válido')
    const publicLogo = await fetch(new URL(String(uploadedLogo.body.logoUrl), `${base}/`).toString())
    check(publicLogo.status === 200 && publicLogo.headers.get('content-type') === 'image/png' && publicLogo.headers.get('cross-origin-resource-policy') === 'cross-origin', 'logo actual se obtiene como imagen pública compatible con el frontend')
    check((await requestLogo(Buffer.from('not-an-image'), 'image/png', ownerToken)).status === 400, 'rechaza contenido que no coincide con una imagen válida')

    const created = await request('POST', '/team', { firstName: 'Técnico', lastName: 'Prueba', email: `tech-${suffix}@example.com`, phone: '+54 3571 444444', password: 'TecnicoSeguro123', role: 'TECHNICIAN', permissions: ['settings.access', 'team.view'] }, ownerToken)
    check(created.status === 201, 'propietario crea empleado')
    const employeeId = String(created.body.id)
    const login = await request('POST', '/auth/login', { email: `tech-${suffix}@example.com`, password: 'TecnicoSeguro123' })
    check(login.status === 200, 'empleado activo inicia sesión')
    const employeeToken = String(login.body.token)
    check((await requestLogo(pngLogo, 'image/png', employeeToken)).status === 403, 'técnico sin permiso no puede reemplazar el logo')
    check((await request('PATCH', `/team/${employeeId}`, { phone: '+54 3571 333333' }, ownerToken)).status === 200, 'propietario edita empleado')
    check((await request('DELETE', `/team/${employeeId}`, undefined, employeeToken)).status === 403, 'técnico no puede eliminar usuarios')

    const otherEmployee = await request('POST', '/team', { firstName: 'Otro', lastName: 'Negocio', email: `other-tech-${suffix}@example.com`, password: 'TecnicoSeguro123', role: 'TECHNICIAN' }, otherOwnerToken)
    check(otherEmployee.status === 201 && (await request('DELETE', `/team/${otherEmployee.body.id}`, undefined, ownerToken)).status === 404, 'un propietario no accede a empleados de otro negocio')

    check((await request('DELETE', `/team/${employeeId}`, undefined, ownerToken)).status === 200, 'propietario elimina empleado')
    const row = await prisma.user.findUniqueOrThrow({ where: { id: employeeId } })
    check(Boolean(row.deletedAt) && !row.isActive && row.name === 'Técnico Prueba', 'baja lógica conserva identidad histórica')
    check((await request('GET', '/team', undefined, ownerToken)).body.users.every((user: { id: string }) => user.id !== employeeId), 'empleado eliminado desaparece de la lista')
    check((await request('GET', '/settings', undefined, employeeToken)).status === 401, 'sesión anterior del eliminado queda invalidada')
    check((await request('POST', '/auth/login', { email: `tech-${suffix}@example.com`, password: 'TecnicoSeguro123' })).status === 403, 'empleado eliminado no vuelve a iniciar sesión')
    check((await request('DELETE', `/team/${employeeId}`, undefined, ownerToken)).status === 404, 'segunda eliminación es segura e idempotente')
    check((await request('DELETE', `/team/${first.body.user.id}`, undefined, ownerToken)).status === 400, 'propietario no puede eliminar su propia cuenta')
    check((await request('DELETE', '/settings/business/logo', undefined, ownerToken)).status === 200, 'propietario elimina el logo')
    check((await request('GET', '/settings/business/logo', undefined, ownerToken)).body.logoUrl === null, 'fallback queda activo después de eliminar el logo')
    const audit = await prisma.subscriptionAuditLog.findFirst({ where: { businessId: businessIds[0], action: 'TEAM_MEMBER_DELETED' } })
    check(Boolean(audit), 'eliminación queda auditada')
    console.log(`SETTINGS/TEAM TESTS PASSED: ${passed}`)
  } finally {
    for (const businessId of businessIds.reverse()) await prisma.$transaction([
      prisma.subscriptionAuditLog.deleteMany({ where: { businessId } }),
      prisma.passwordResetToken.deleteMany({ where: { user: { businessId } } }),
      prisma.subscription.deleteMany({ where: { businessId } }),
      prisma.user.deleteMany({ where: { businessId } }),
      prisma.business.deleteMany({ where: { id: businessId } }),
    ])
    await prisma.$disconnect()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
