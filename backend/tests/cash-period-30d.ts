import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { validRegistrationPayload } from './helpers/registration'
import { cashPeriodRange, type CashPeriod } from '../src/modules/cash/cash-period'

process.env.NODE_ENV = 'test'
process.env.RATE_LIMIT_AUTH_WRITES_MAX = '300'
process.env.TURNSTILE_SECRET_KEY = 'test-only-secret'
const nativeFetch = globalThis.fetch
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
  String(input).includes('challenges.cloudflare.com/turnstile')
    ? Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }))
    : nativeFetch(input, init)) as typeof fetch

const NativeDate = globalThis.Date

/**
 * Reloj congelado en el 01/10/2026 al mediodía argentino.
 *
 * Reproduce el defecto reportado: con un backend que no conocía `30D`, ese valor caía en la
 * lista cerrada de períodos y se respondía como TODAY, así que "30 días" mostraba menos
 * movimientos que "15 días". Con el reloj fijo los límites son deterministas y se puede exigir
 * que todo período más ancho contenga al anterior.
 */
const FIXTURE_NOW = new Date('2026-10-01T18:00:00.000Z')

/** Congela el reloj global en `instant` y devuelve la función que lo restaura. */
const installFixedNow = (instant: Date) => {
  const fixedTime = instant.getTime()
  class FixedDate extends NativeDate {
    constructor(...args: any[]) {
      super(...(args.length ? args : [fixedTime]))
    }

    static now() {
      return fixedTime
    }
  }
  globalThis.Date = FixedDate as DateConstructor
  return () => { globalThis.Date = NativeDate }
}

/** Día civil argentino a las 12:00, para que cada fixture caiga de lleno dentro de su día. */
const argentinaNoon = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day, 15))
async function main() {
  const [{ app }, { prisma }] = await Promise.all([import('../src/server'), import('../src/lib/prisma')])
  const server = app.listen(0); await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address(); assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}/api`, suffix = Date.now(), businesses: string[] = []
  const request = async (method: string, path: string, body?: object, token?: string) => {
    const response = await fetch(`${base}${path}`, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
    const text = await response.text()
    return { status: response.status, body: text ? JSON.parse(text) as any : null }
  }
  const register = async (label: string) => {
    const password = `Qa-${randomBytes(12).toString('base64url')}9!`
    const result = await request('POST', '/auth/register', validRegistrationPayload({ firstName: 'Periodo', lastName: label, email: `period30-${label}-${suffix}@example.com`, password, businessName: `Periodo 30 ${label}` }))
    assert.equal(result.status, 201); businesses.push(result.body.user.business.id)
    return { token: result.body.token as string, businessId: result.body.user.business.id as string }
  }
  const clean = async () => {
    const stale = await prisma.business.findMany({ where: { users: { some: { email: { contains: 'period30-' } } } }, select: { id: true } })
    for (const business of stale) {
      await prisma.$transaction([
        prisma.warrantyClaimExpense.deleteMany({ where: { businessId: business.id } }),
        prisma.warrantyClaim.deleteMany({ where: { businessId: business.id } }),
        prisma.repairStatusHistory.deleteMany({ where: { repair: { businessId: business.id } } }),
        prisma.repairPhoto.deleteMany({ where: { repair: { businessId: business.id } } }),
        prisma.payment.deleteMany({ where: { businessId: business.id } }),
        prisma.repair.updateMany({ where: { businessId: business.id }, data: { initialCostMovementId: null } }),
        prisma.cashMovement.updateMany({ where: { businessId: business.id }, data: { commerceSaleId: null, resaleDeviceId: null } }),
        prisma.cashMovement.deleteMany({ where: { businessId: business.id } }),
        prisma.commerceSale.deleteMany({ where: { businessId: business.id } }),
        prisma.commerceProduct.deleteMany({ where: { businessId: business.id } }),
        prisma.commerceCategory.deleteMany({ where: { businessId: business.id } }),
        prisma.resaleDevice.deleteMany({ where: { businessId: business.id } }),
        prisma.device.deleteMany({ where: { businessId: business.id } }),
        prisma.repair.deleteMany({ where: { businessId: business.id } }),
        prisma.client.deleteMany({ where: { businessId: business.id } }),
        prisma.passwordResetToken.deleteMany({ where: { user: { businessId: business.id } } }),
        prisma.subscription.deleteMany({ where: { businessId: business.id } }),
        prisma.user.deleteMany({ where: { businessId: business.id } }),
        prisma.business.deleteMany({ where: { id: business.id } }),
      ])
    }
  }

  const restoreClock = installFixedNow(FIXTURE_NOW)
  try {
    const owner = await register('A')
    const other = await register('B')
    const { businessId } = owner

    // Fechas que barrenen el escenario: del primer día del período de 30 días hasta hoy.
    const DATES = {
      sep02: argentinaNoon(2026, 9, 2), sep10: argentinaNoon(2026, 9, 10), sep17: argentinaNoon(2026, 9, 17),
      sep27: argentinaNoon(2026, 9, 27), sep29: argentinaNoon(2026, 9, 29), sep30: argentinaNoon(2026, 9, 30),
      oct01: argentinaNoon(2026, 10, 1),
    }
    const LABEL: Record<keyof typeof DATES, string> = {
      sep02: 'Movimiento 02/09', sep10: 'Movimiento 10/09', sep17: 'Movimiento 17/09',
      sep27: 'Movimiento 27/09', sep29: 'Movimiento 29/09', sep30: 'Movimiento 30/09', oct01: 'Movimiento 01/10',
    }
    // Movimientos manuales de General: sin entidad, van a la tabla de "Otros movimientos".
    for (const [key, createdAt] of Object.entries(DATES)) {
      await prisma.cashMovement.create({ data: { businessId, type: 'INCOME', origin: 'GENERAL', description: LABEL[key as keyof typeof DATES], amount: 1000, method: 'CASH', createdAt } })
    }
    // Una reparación por fecha: los grupos paginan por grupo, no por movimiento.
    const client = (await request('POST', '/clients', { name: 'Cliente 30D', phone: '1111111130' }, owner.token)).body
    const repairs: Record<string, string> = {}
    for (const [key, createdAt] of Object.entries(DATES)) {
      const repair = (await request('POST', '/repairs', { clientId: client.id, deviceBrand: 'Samsung', deviceModel: 'A14', issue: 'Pantalla', total: 50000 }, owner.token)).body
      repairs[key] = repair.id
      await prisma.cashMovement.create({ data: { businessId, type: 'INCOME', origin: 'REPAIR', repairId: repair.id, description: `Cobro ${key}`, amount: 5000, method: 'CASH', createdAt } })
    }
    // Un manual de REPAIR, para la tabla de otros también en la caja de reparaciones.
    await prisma.cashMovement.create({ data: { businessId, type: 'EXPENSE', origin: 'REPAIR', description: 'Gasto manual sin orden', amount: 300, method: 'CASH', createdAt: DATES.sep27 } })

    const cash = async (token: string, query: string) => (await request('GET', `/cash/movements?pageSize=100&${query}`, undefined, token)).body
    const groups = async (token: string, period: string) => (await request('GET', `/cash/movements?origin=REPAIR&groupByRepair=true&pageSize=100&period=${period}`, undefined, token)).body
    const groupIds = (body: any) => (body.items as any[]).map(group => group.repairId)
    const looseLabels = (body: any) => (body.loose.movements as any[]).map(item => item.description).sort()
    const PERIODS = ['TODAY', '7D', '15D', '30D', 'MONTH'] as const
    // Fechas que cada período debe traer, en las dos tablas.
    const EXPECTED: Record<string, string[]> = {
      TODAY: ['Movimiento 01/10'],
      '7D': ['Movimiento 01/10', 'Movimiento 27/09', 'Movimiento 29/09', 'Movimiento 30/09'],
      '15D': ['Movimiento 01/10', 'Movimiento 17/09', 'Movimiento 27/09', 'Movimiento 29/09', 'Movimiento 30/09'],
      '30D': ['Movimiento 02/09', 'Movimiento 10/09', 'Movimiento 01/10', 'Movimiento 17/09', 'Movimiento 27/09', 'Movimiento 29/09', 'Movimiento 30/09'],
      MONTH: ['Movimiento 01/10'],
    }
    // 1. El backend RECONOCE cada período y lo devuelve en la respuesta. Con un backend que no
    // conocía 30D, ese valor caía en TODAY: la respuesta delata con qué período se calculó.
    for (const period of PERIODS) {
      const box = await cash(owner.token, `origin=GENERAL&period=${period}`)
      assert.equal(box.period, period, `el backend reconoce el período ${period}`)
    }

    // 2. Cada período trae exactamente las fechas que le corresponden, en las dos tablas.
    for (const period of PERIODS) {
      const box = await cash(owner.token, `origin=GENERAL&period=${period}`)
      const expected = EXPECTED[period].slice().sort()
      // En General la tabla principal no lista movimientos sin entidad: van todos a "Otros".
      assert.equal(box.total, 0, `${period}: la tabla principal sólo muestra lo vinculado`)
      assert.deepEqual(looseLabels(box), expected, `${period}: "Otros movimientos" trae exactamente las fechas del período`)
      assert.equal(box.summary.totalMovements, expected.length, `${period}: el resumen cuenta los ${expected.length} movimientos`)
      assert.equal(box.summary.income, expected.length * 1000, `${period}: los ingresos suman todos los movimientos, manuales incluidos`)
    }

    // 3. LA REGLA QUE SE ROMPIÓ: todo período más ancho contiene al anterior. Es la definición
    // de "más días": 30D no puede mostrar menos que 15D, ni 15D menos que 7D.
    const seen: Record<string, Set<string>> = {}
    for (const period of PERIODS) seen[period] = new Set(looseLabels(await cash(owner.token, `origin=GENERAL&period=${period}`)))
    for (const [narrower, wider] of [['TODAY', '7D'], ['7D', '15D'], ['15D', '30D']] as const) {
      for (const label of seen[narrower]) assert.ok(seen[wider].has(label), `todo movimiento de ${narrower} aparece también en ${wider} (falta ${label})`)
    }
    // MONTH no se compara: arranca el día 1 del mes y por diseño es más corto que 30 días.

    // 4. Lo mismo en los GRUPOS de reparación, que paginan por grupo y no por movimiento.
    const groupSeen: Record<string, Set<string>> = {}
    for (const period of PERIODS) {
      const box = await groups(owner.token, period)
      groupSeen[period] = new Set(groupIds(box))
      assert.equal(box.items.length, EXPECTED[period].length, `${period}: la caja de reparaciones muestra ${EXPECTED[period].length} grupos`)
      assert.equal(box.total, EXPECTED[period].length, `${period}: y la paginación cuenta los mismos grupos`)
    }
    for (const [narrower, wider] of [['TODAY', '7D'], ['7D', '15D'], ['15D', '30D']] as const) {
      for (const id of groupSeen[narrower]) assert.ok(groupSeen[wider].has(id), `la reparación visible en ${narrower} sigue apareciendo en ${wider}`)
    }
    // Con hoy 01/10, MONTH no muestra reparaciones cuya única actividad fue en septiembre.
    assert.ok(!groupSeen.MONTH.has(repairs.sep27), 'MES no muestra una reparación que sólo se movió en septiembre')
    assert.ok(groupSeen.MONTH.has(repairs.oct01), 'pero sí la de hoy')

    // 5. La tabla de "Otros movimientos" de reparaciones también respeta el período.
    for (const period of PERIODS) {
      const box = await groups(owner.token, period)
      const inside = period === 'TODAY' || period === 'MONTH' ? 0 : 1
      assert.equal(box.loose.movementCount, inside, `${period}: la tabla de otros de reparaciones respeta el período`)
      if (inside) assert.deepEqual(looseLabels(box), ['Gasto manual sin orden'], `${period}: y muestra el manual correcto`)
      assert.equal(box.summary.totalMovements, EXPECTED[period].length + inside, `${period}: el resumen de reparaciones cuenta grupos y manuales`)
    }

    // 6. Reventa y Comercio usan EL MISMO rango que las demás cajas. En vez de codificar a mano
    // qué período incluye qué fecha, se consulta el rango real: si el backend usara un criterio
    // distinto para reventa o comercio, esta comprobación lo delataría.
    const covers = (period: string, date: Date) => {
      const { start, end } = cashPeriodRange(period as CashPeriod, FIXTURE_NOW)
      return date >= start && date < end
    }
    const device = (await request('POST', '/equipment-sales', { brand: 'Samsung', model: 'A54', purchasePrice: 40000, estimatedSalePrice: 70000 }, owner.token)).body
    assert.ok(device?.id, 'se crea el equipo de reventa')
    await prisma.resaleDevice.update({ where: { id: device.id }, data: { createdAt: DATES.sep17 } })
    // Crear el equipo ya deja su compra registrada; se la lleva al 17/09 para que el fixture sea
    // determinista y el período de hoy no arrastre nada.
    await prisma.cashMovement.updateMany({ where: { businessId, resaleDeviceId: device.id }, data: { createdAt: DATES.sep17 } })
    await prisma.cashMovement.create({ data: { businessId, type: 'EXPENSE', origin: 'EQUIPMENT', resaleDeviceId: device.id, resaleKind: 'PURCHASE', description: 'Compra equipo', amount: 40000, method: 'CASH', createdAt: DATES.sep17 } })
    await prisma.cashMovement.create({ data: { businessId, type: 'INCOME', origin: 'EQUIPMENT', description: 'Ajuste manual de reventa', amount: 700, method: 'CASH', createdAt: DATES.sep17 } })
    const seenEquipment: Record<string, Set<string>> = {}
    for (const period of PERIODS) {
      const inside = covers(period, DATES.sep17)
      const box = await cash(owner.token, `origin=EQUIPMENT&period=${period}`)
      assert.equal(box.period, period, `reventa reconoce ${period}`)
      seenEquipment[period] = new Set(looseLabels(box))
      // La compra del equipo va a la tabla principal; el ajuste manual, a su propia tabla.
      assert.equal(box.total, inside ? 2 : 0, `reventa ${period}: la principal sólo lista lo que tiene equipo`)
      assert.equal(box.loose.movementCount, inside ? 1 : 0, `reventa ${period}: el manual va a su propia tabla`)
      assert.equal(box.summary.expense, inside ? 80000 : 0, `reventa ${period}: los egresos suman las dos tablas`)
    }
    assert.ok(seenEquipment['15D'].has('Ajuste manual de reventa') && seenEquipment['30D'].has('Ajuste manual de reventa'), 'el manual de reventa aparece en 15D y en 30D')

    const category = (await request('POST', '/commerce/categories', { name: 'Accesorios 30D' }, owner.token)).body
    const product = (await request('POST', '/commerce/products', { name: 'Cable 30D', category: category.name, purchaseCost: 1000, salePrice: 2500, currentStock: 5 }, owner.token)).body
    const sale = await request('POST', '/commerce/sales', { lines: [{ productId: product.id, quantity: 1, expectedUnitPrice: 2500 }], expectedTotal: 2500, idempotencyKey: randomUUID(), paymentMethod: 'CASH' }, owner.token)
    assert.equal(sale.status, 201, 'la venta de comercio se registra: ' + JSON.stringify(sale.body))
    const saleCash = await prisma.cashMovement.findFirstOrThrow({ where: { commerceSaleId: sale.body.id } })
    await prisma.cashMovement.update({ where: { id: saleCash.id }, data: { createdAt: DATES.sep10 } })
    await prisma.cashMovement.create({ data: { businessId, type: 'INCOME', origin: 'COMMERCE', description: 'Ingreso manual de comercio', amount: 900, method: 'CASH', createdAt: DATES.sep10 } })
    const seenCommerce: Record<string, Set<string>> = {}
    for (const period of PERIODS) {
      // La venta y el ingreso manual están el 10/09: fuera de 15D, dentro de 30D.
      const inside = covers(period, DATES.sep10)
      const box = await cash(owner.token, `origin=COMMERCE&period=${period}`)
      assert.equal(box.period, period, `comercio reconoce ${period}`)
      seenCommerce[period] = new Set(looseLabels(box))
      assert.equal(box.total, inside ? 1 : 0, `comercio ${period}: la principal sólo lista la venta`)
      assert.equal(box.loose.movementCount, inside ? 1 : 0, `comercio ${period}: el ingreso manual va a su propia tabla`)
    }
    assert.ok(seenCommerce['30D'].has('Ingreso manual de comercio'), 'el manual de comercio aparece en 30D')
    assert.ok(!seenCommerce['15D'].has('Ingreso manual de comercio'), 'y no en 15D, porque es del 10/09')

    // 7. Aislamiento entre negocios con el período más ancho.
    const foreign = await groups(other.token, '30D')
    assert.equal(foreign.total, 0, 'el otro negocio no ve estos grupos con 30D')
    assert.equal(foreign.loose.movementCount, 0, 'ni sus movimientos manuales')
    assert.equal((await cash(other.token, 'origin=GENERAL&period=30D')).summary.totalMovements, 0, 'ni sus movimientos generales')

    await clean()
    console.log('CASH PERIOD 30D PASSED: reloj fijo en 01/10, los cinco períodos reconocen su valor, 30D va del 02/09 a hoy y contiene todo lo de 15D/7D/TODAY en movimientos, grupos, tabla de otros y summaries, igual en General, Reventa y Comercio, con aislamiento entre negocios')
  } finally {
    restoreClock()
    await clean()
    await prisma.$disconnect()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
