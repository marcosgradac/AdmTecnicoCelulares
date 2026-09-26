import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { validRegistrationPayload } from './helpers/registration'

// Refuse remote or non-test databases before importing the app/Prisma.
const database = new URL(process.env.DATABASE_URL ?? '')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(database.hostname), 'Use a local test database')
assert.ok(database.pathname.endsWith('_test'), 'Use a dedicated database ending in _test')
assert.notEqual(process.env.NODE_ENV, 'production')
process.env.NODE_ENV = 'test'
process.env.TURNSTILE_SECRET_KEY = 'test-only-secret'
process.env.RATE_LIMIT_GLOBAL_MAX = '1000'
process.env.RATE_LIMIT_AUTH_WRITES_MAX = '1000'
const nativeFetch = globalThis.fetch
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
  String(input).includes('challenges.cloudflare.com/turnstile')
    ? Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }))
    : nativeFetch(input, init)) as typeof fetch

async function main() {
  const [{ app }, { prisma }, { DEFAULT_TECHNICIAN_PERMISSIONS }] = await Promise.all([
    import('../src/server'), import('../src/lib/prisma'), import('../src/config/permissions'),
  ])
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address(); assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}/api`
  const suffix = randomUUID(), businesses: string[] = []
  let checks = 0
  const check = (condition: unknown, message: string) => { assert.ok(condition, message); console.log(`OK ${++checks}: ${message}`) }
  const request = async (method: string, path: string, token?: string, body?: object) => {
    const response = await fetch(`${base}${path}`, {
      method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await response.text()
    return { status: response.status, body: text && response.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text }
  }
  const register = async (label: string) => {
    const result = await request('POST', '/auth/register', undefined, validRegistrationPayload({
      firstName: 'Soft', lastName: label, email: `soft-${label}-${suffix}@example.com`, password: 'LocalTest123!', businessName: `Soft delete ${label} ${suffix}`,
    }))
    assert.equal(result.status, 201, JSON.stringify(result.body))
    businesses.push(result.body.user.business.id)
    return { token: result.body.token as string, businessId: result.body.user.business.id as string }
  }
  const createClient = async (token: string, name: string, phone: string) => {
    const result = await request('POST', '/clients', token, { name, phone })
    assert.equal(result.status, 201)
    return result.body as { id: string; name: string; phone: string }
  }
  const repairInput = { deviceBrand: 'Nokia', deviceModel: 'QA', issue: 'Falla de prueba', total: 10000 }
  try {
    const owner = await register('A'), foreign = await register('B')
    const client = await createClient(owner.token, 'Cliente histórico', '1155500100')
    const empty = await createClient(owner.token, 'Cliente sin reparaciones', '1155500101')
    const untouched = await createClient(owner.token, 'Cliente activo', '1155500102')
    const created = await request('POST', '/repairs', owner.token, { ...repairInput, clientId: client.id, status: 'DELIVERED', warrantyEnabled: true, warrantyDurationDays: 90 })
    assert.equal(created.status, 201, JSON.stringify(created.body))
    const repairId = created.body.id as string
    assert.equal((await request('POST', `/repairs/${repairId}/payments`, owner.token, { amount: 5000, method: 'CASH' })).status, 201)
    const device = await prisma.device.create({ data: { businessId: owner.businessId, clientId: client.id, brand: 'Nokia', model: 'QA' } })
    await prisma.repair.update({ where: { id: repairId }, data: { deviceId: device.id } })
    assert.equal((await request('PATCH', `/repairs/${repairId}/status`, owner.token, { status: 'WARRANTY' })).status, 200)
    await prisma.warrantyClaim.create({ data: { businessId: owner.businessId, repairId, description: 'Garantía histórica' } })
    const history = async () => ({
      repairs: await prisma.repair.findMany({ where: { businessId: owner.businessId, clientId: client.id } }),
      payments: await prisma.payment.findMany({ where: { businessId: owner.businessId, clientId: client.id } }),
      cash: await prisma.cashMovement.findMany({ where: { businessId: owner.businessId } }),
      devices: await prisma.device.findMany({ where: { businessId: owner.businessId, clientId: client.id } }),
      warranties: await prisma.warrantyClaim.findMany({ where: { businessId: owner.businessId } }),
      states: await prisma.repairStatusHistory.findMany({ where: { repair: { businessId: owner.businessId } } }),
    })
    const before = await history()
    assert.ok(Object.values(before).every(rows => rows.length > 0), 'The historical fixture must include every relation')
    const cashBefore = await request('GET', '/cash/movements?page=1&pageSize=10', owner.token)

    check((await request('DELETE', `/clients/${client.id}`, owner.token)).status === 200, 'OWNER puede eliminar')
    const stored = await prisma.client.findUniqueOrThrow({ where: { id: client.id } })
    check(Boolean(stored.deletedAt), 'la fila Client permanece con deletedAt')
    assert.equal(stored.name, client.name); assert.equal(stored.phone, client.phone)
    const after = await history()
    for (const key of Object.keys(before) as Array<keyof typeof before>) {
      assert.deepEqual(after[key], before[key], `${key}: filas, importes, timestamps y relaciones intactos`)
      check(true, `historial ${key} intacto`)
    }
    assert.deepEqual((await request('GET', '/cash/movements?page=1&pageSize=10', owner.token)).body, cashBefore.body)
    check(true, 'Caja conserva snapshots, movimientos, totales y saldo')
    for (const path of ['/clients', '/clients/options']) {
      const list = await request('GET', path, owner.token)
      assert.equal(list.status, 200)
      check(list.body.length === 2 && !list.body.some((row: { id: string }) => row.id === client.id), `${path} contiene sólo activos`)
    }
    const page = await request('GET', '/clients?paginated=true&page=1&pageSize=1', owner.token)
    check(page.body.total === 2 && page.body.totalPages === 2 && page.body.items.every((row: { id: string }) => row.id !== client.id), 'paginación cuenta sólo activos')
    const search = await request('GET', '/clients?paginated=true&search=histórico', owner.token)
    check(search.body.total === 0, 'búsqueda no revive eliminados')
    const detail = await request('GET', `/clients/${client.id}`, owner.token)
    check(detail.status === 200 && detail.body.deletedAt && detail.body.repairs[0].id === repairId, 'detalle eliminado conserva reparaciones')
    check((await request('GET', `/repairs/${repairId}`, owner.token)).status === 200, 'reparación histórica sigue abriendo')
    const refusedCreate = await request('POST', '/repairs', owner.token, { ...repairInput, clientId: client.id })
    check(refusedCreate.status === 404 && refusedCreate.body.message === 'El cliente seleccionado fue eliminado o no está disponible.', 'no permite crear reparación con ID eliminado')
    const activeRepair = await request('POST', '/repairs', owner.token, { ...repairInput, clientId: untouched.id })
    assert.equal(activeRepair.status, 201)
    const refusedUpdate = await request('PATCH', `/repairs/${activeRepair.body.id}`, owner.token, { ...repairInput, clientId: client.id })
    check(refusedUpdate.status === 400 && refusedUpdate.body.message === refusedCreate.body.message, 'no permite reasignar reparación a eliminado')
    assert.equal((await prisma.repair.findUniqueOrThrow({ where: { id: activeRepair.body.id } })).clientId, untouched.id)
    check((await request('PATCH', `/clients/${client.id}`, owner.token, { name: 'No debe cambiar', phone: '1155500999' })).status === 404, 'no permite editar cliente eliminado')
    check((await request('DELETE', `/clients/${untouched.id}`, foreign.token)).status === 404, 'otro negocio no puede eliminar un cliente activo ajeno')
    assert.equal((await prisma.client.findUniqueOrThrow({ where: { id: untouched.id } })).deletedAt, null)
    check((await request('DELETE', `/clients/${client.id}`, foreign.token)).status === 404, 'otro negocio tampoco accede al eliminado')
    check((await request('GET', `/clients/${client.id}`, foreign.token)).status === 404, 'detalle histórico mantiene aislamiento')
    check((await request('DELETE', '/clients/no-existe', owner.token)).status === 404, 'ID inexistente devuelve 404')
    check((await request('DELETE', `/clients/${client.id}`, owner.token)).status === 200, 'segundo DELETE es idempotente')
    assert.deepEqual(await prisma.client.findUniqueOrThrow({ where: { id: client.id } }), stored, 'segundo DELETE no cambia timestamps')
    assert.deepEqual(await history(), before, 'segundo DELETE conserva todas las relaciones')

    const replacement = await createClient(owner.token, 'Cliente nuevo mismo teléfono', client.phone)
    check(replacement.id !== client.id, 'mismo teléfono genera un cliente nuevo, sin restaurar el anterior')
    check((await request('POST', '/clients', owner.token, { name: 'Duplicado activo', phone: client.phone })).status === 409, 'teléfono activo sigue protegido contra duplicados')
    assert.equal((await prisma.repair.findUniqueOrThrow({ where: { id: repairId } })).clientId, client.id)
    assert.equal((await prisma.payment.findFirstOrThrow({ where: { repairId } })).clientId, client.id)
    check(true, 'Repair.clientId y Payment.clientId conservan el ID histórico')

    const workerEmail = `soft-tech-${suffix}@example.com`
    const worker = await request('POST', '/team', owner.token, { firstName: 'Técnico', lastName: 'Prueba', email: workerEmail, password: 'LocalTest123!', role: 'TECHNICIAN' })
    assert.equal(worker.status, 201)
    const login = await request('POST', '/auth/login', undefined, { email: workerEmail, password: 'LocalTest123!' })
    assert.equal(login.status, 200)
    check(!worker.body.permissions.includes('clients.delete') && !(DEFAULT_TECHNICIAN_PERMISSIONS as readonly string[]).includes('clients.delete'), 'técnico sin permiso de eliminación por defecto')
    check((await request('DELETE', `/clients/${empty.id}`, login.body.token)).status === 403, 'técnico sin clients.delete recibe 403')
    const permissions = [...worker.body.permissions, 'clients.delete']
    assert.equal((await request('PATCH', `/team/${worker.body.id}`, owner.token, { permissions })).status, 200)
    check((await request('DELETE', `/clients/${empty.id}`, login.body.token)).status === 200, 'técnico con permiso asignado elimina cliente sin reparaciones')
    check((await prisma.client.findUniqueOrThrow({ where: { id: empty.id } })).deletedAt !== null, 'cliente sin historial también permanece físicamente')
    check((await request('PATCH', `/repairs/${repairId}`, owner.token, { ...repairInput, notes: 'Seguimiento histórico' })).status === 200, 'permite mantener una reparación histórica sin reasignar cliente')
    assert.equal((await prisma.repair.findUniqueOrThrow({ where: { id: repairId } })).clientId, client.id)

    const migration = '20260926030000_add_client_soft_delete/migration.sql'
    await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe('CREATE TEMP TABLE "Client" ("id" TEXT PRIMARY KEY, "name" TEXT) ON COMMIT DROP')
      await tx.$executeRawUnsafe(`INSERT INTO "Client" VALUES ('existing', 'Anterior')`)
      await tx.$executeRawUnsafe(readFileSync(resolve(__dirname, '../prisma/migrations', migration), 'utf8'))
      assert.deepEqual(await tx.$queryRawUnsafe('SELECT * FROM "Client"'), [{ id: 'existing', name: 'Anterior', deletedAt: null }])
    })
    const sqlite = new DatabaseSync(':memory:')
    try {
      const root = resolve(__dirname, '../prisma/migrations-sqlite')
      sqlite.exec('PRAGMA foreign_keys = ON')
      for (const directory of readdirSync(root).sort()) {
        const file = resolve(root, directory, 'migration.sql')
        if (!existsSync(file)) continue
        if (directory === migration.split('/')[0]) {
          sqlite.exec(`INSERT INTO "Business" ("id", "name", "updatedAt") VALUES ('test-only', 'QA', CURRENT_TIMESTAMP)`)
          sqlite.exec(`INSERT INTO "Client" ("id", "name", "businessId") VALUES ('existing', 'Anterior', 'test-only')`)
        }
        sqlite.exec(readFileSync(file, 'utf8'))
      }
      assert.equal(sqlite.prepare('SELECT "deletedAt" FROM "Client" WHERE "id" = ?').get('existing')!.deletedAt, null)
      sqlite.exec(`UPDATE "Client" SET "deletedAt" = CURRENT_TIMESTAMP WHERE "id" = 'existing'`)
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM "Client"').get()!.count, 1)
      assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(), [])
    } finally { sqlite.close() }
    check(true, 'migraciones PostgreSQL y SQLite conservan clientes anteriores activos')
    const source = readFileSync(resolve(__dirname, '../src/server.ts'), 'utf8')
    assert.doesNotMatch(source, /\b(?:prisma|tx)\.client\.delete(?:Many)?\s*\(/)
    check(true, 'flujo de producción no usa delete físico de Client')
    console.log(`CLIENT SOFT DELETE TESTS PASSED: ${checks}`)
  } finally {
    // Only IDs returned by this test's successful registrations are ever cleaned.
    try {
      for (const businessId of businesses) await prisma.$transaction([
        prisma.warrantyClaim.deleteMany({ where: { businessId } }),
        prisma.repairStatusHistory.deleteMany({ where: { repair: { businessId } } }),
        prisma.payment.deleteMany({ where: { businessId } }),
        prisma.cashMovement.deleteMany({ where: { businessId } }),
        prisma.repair.deleteMany({ where: { businessId } }),
        prisma.device.deleteMany({ where: { businessId } }),
        prisma.client.deleteMany({ where: { businessId } }),
        prisma.subscriptionAuditLog.deleteMany({ where: { businessId } }),
        prisma.passwordResetToken.deleteMany({ where: { user: { businessId } } }),
        prisma.subscription.deleteMany({ where: { businessId } }),
        prisma.user.deleteMany({ where: { businessId } }),
        prisma.business.deleteMany({ where: { id: businessId } }),
      ])
    } finally {
      await prisma.$disconnect()
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
