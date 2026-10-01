import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { validRegistrationPayload } from './helpers/registration'
import { CASH_PERIODS, cashPeriodRange, isCashPeriod, DEFAULT_CASH_PERIOD } from '../src/modules/cash/cash-period'
import { getArgentinaDayBounds } from '../src/lib/argentina-day'

process.env.NODE_ENV = 'test'
process.env.RATE_LIMIT_AUTH_WRITES_MAX = '300'
process.env.TURNSTILE_SECRET_KEY = 'test-only-secret'
const nativeFetch = globalThis.fetch
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
  String(input).includes('challenges.cloudflare.com/turnstile')
    ? Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }))
    : nativeFetch(input, init)) as typeof fetch

const DAY = 86_400_000
/** Move whole calendar days from a reference instant, keeping the same wall-clock time. */
const shiftDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY)

/**
 * Instante de referencia del escenario: mitad de mes, a media tarde argentina.
 *
 * El reloj queda fijo durante toda la prueba porque los períodos se comparan contra el mes y
 * la semana CIVILES. Con el reloj real, un día 1 de mes los fixtures de "hace 3 días" caen
 * del mes anterior y la prueba falla según el día en que se ejecuta.
 */
const FIXTURE_NOW = new Date('2026-09-15T18:00:00.000Z')
const NativeDate = globalThis.Date

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
    const result = await request('POST', '/auth/register', validRegistrationPayload({ firstName: 'Periodo', lastName: label, email: `period-${label}-${suffix}@example.com`, password, businessName: `Periodo ${label}` }))
    assert.equal(result.status, 201); businesses.push(result.body.user.business.id)
    return { token: result.body.token as string, businessId: result.body.user.business.id as string }
  }
  const clean = async () => {
    const stale = await prisma.business.findMany({ where: { users: { some: { email: { contains: 'period-' } } } }, select: { id: true } })
    for (const business of stale) {
      await prisma.$transaction([
        prisma.warrantyClaimExpense.deleteMany({ where: { businessId: business.id } }),
        prisma.warrantyClaim.deleteMany({ where: { businessId: business.id } }),
        prisma.repairStatusHistory.deleteMany({ where: { repair: { businessId: business.id } } }),
        prisma.repairPhoto.deleteMany({ where: { repair: { businessId: business.id } } }),
        prisma.payment.deleteMany({ where: { businessId: business.id } }),
        prisma.repair.updateMany({ where: { businessId: business.id }, data: { initialCostMovementId: null } }),
        prisma.cashMovement.deleteMany({ where: { businessId: business.id } }),
        prisma.repair.deleteMany({ where: { businessId: business.id } }),
        prisma.device.deleteMany({ where: { businessId: business.id } }),
        prisma.commerceSale.deleteMany({ where: { businessId: business.id } }),
        prisma.commerceProduct.deleteMany({ where: { businessId: business.id } }),
        prisma.resaleDevice.deleteMany({ where: { businessId: business.id } }),
        prisma.client.deleteMany({ where: { businessId: business.id } }),
        prisma.passwordResetToken.deleteMany({ where: { user: { businessId: business.id } } }),
        prisma.subscription.deleteMany({ where: { businessId: business.id } }),
        prisma.user.deleteMany({ where: { businessId: business.id } }),
        prisma.business.delete({ where: { id: business.id } }),
      ])
    }
  }
  /** Crea un movimiento con una fecha concreta: es lo que permite probar los rangos. */
  const movement = async (businessId: string, input: { type: 'INCOME' | 'EXPENSE'; amount: number; origin?: string; repairId?: string | null; createdAt: Date; description: string }) =>
    prisma.cashMovement.create({ data: { businessId, type: input.type, amount: input.amount, origin: input.origin ?? 'GENERAL', repairId: input.repairId ?? null, createdAt: input.createdAt, description: input.description, method: 'CASH' } })
  const cash = async (token: string, query: string) => (await request('GET', `/cash/movements?pageSize=100&${query}`, undefined, token)).body
  const groups = async (token: string, period: string) => (await request('GET', `/cash/movements?origin=REPAIR&groupByRepair=true&pageSize=100&period=${period}`, undefined, token)).body
  const findGroup = (body: any, repairId: string) => (body.items as any[]).find(group => group.repairId === repairId)

  const restoreClock = installFixedNow(FIXTURE_NOW)
  try {
    // 14. Un parámetro inválido cae en TODAY en lugar de romper la pantalla.
    assert.equal(DEFAULT_CASH_PERIOD, 'TODAY')
    assert.ok(!isCashPeriod('999D') && !isCashPeriod(undefined) && isCashPeriod('15D'))

    const owner = await register('A')
    const other = await register('B')
    const { businessId } = owner
    const now = FIXTURE_NOW
    const today = getArgentinaDayBounds(now)

    // 1/2/3/4. Los límites se calculan sobre días calendario de Argentina, no restando horas.
    const ranges = Object.fromEntries(CASH_PERIODS.map(period => [period, cashPeriodRange(period, now)]))
    assert.equal(ranges.TODAY.start.getTime(), today.start.getTime(), 'HOY arranca a la medianoche de hoy')
    assert.equal(ranges.TODAY.end.getTime(), today.end.getTime(), 'HOY cierra con el día de hoy')
    assert.equal(ranges.MONTH.start.getTime(), getArgentinaDayBounds(new Date(now.getFullYear(), now.getMonth(), 1)).start.getTime(), 'MES arranca el día 1')
    assert.equal(Math.round((ranges.TODAY.end.getTime() - ranges.TODAY.start.getTime()) / DAY), 1, 'HOY es un día exacto')
    for (const [period, days] of [['7D', 7], ['15D', 15], ['30D', 30]] as const) {
      const range = ranges[period]
      const expected = getArgentinaDayBounds(shiftDays(now, -(days - 1))).start
      assert.equal(range.start.getTime(), expected.getTime(), `${period} empieza ${days} días calendario antes`)
      assert.equal(range.end.getTime(), today.end.getTime(), `${period} cierra con el día de hoy`)
      assert.equal(Math.round((range.end.getTime() - range.start.getTime()) / DAY), days, `${period} abarca ${days} días exactos`)
    }

    // 5/6. Ingresos, egresos y balance responden al período elegido.
    await movement(businessId, { type: 'INCOME', amount: 1000, createdAt: new Date(now.getTime() - 60_000), description: 'Ingreso de hoy' })
    await movement(businessId, { type: 'EXPENSE', amount: 400, createdAt: new Date(now.getTime() - 120_000), description: 'Egreso de hoy' })
    await movement(businessId, { type: 'INCOME', amount: 5000, createdAt: shiftDays(now, -3), description: 'Ingreso de hace 3 días' })
    await movement(businessId, { type: 'EXPENSE', amount: 2500, createdAt: shiftDays(now, -10), description: 'Egreso de hace 10 días' })
    await movement(businessId, { type: 'INCOME', amount: 9000, createdAt: shiftDays(now, -40), description: 'Ingreso del mes anterior' })

    const todayBox = await cash(owner.token, 'origin=GENERAL&period=TODAY')
    assert.equal(todayBox.summary.income, 1000, 'HOY: sólo el ingreso de hoy')
    assert.equal(todayBox.summary.expense, 400, 'HOY: sólo el egreso de hoy')
    assert.equal(todayBox.summary.balance, 600, 'balance = ingresos - egresos del período')
    assert.equal(todayBox.summary.totalMovements, 2, 'HOY cuenta sólo los movimientos de hoy')
    // Estos movimientos no tienen entidad: van a la tabla de otros, pero el período también los acota.
    assert.equal(todayBox.total, 0, 'la tabla principal sólo muestra lo vinculado al módulo')
    assert.equal(todayBox.loose.movementCount, 2, 'HOY acota también la tabla de otros movimientos')
    assert.equal(todayBox.summary.totalMovements, todayBox.total + todayBox.loose.movementCount, 'el resumen cuenta las dos tablas')

    const sevenBox = await cash(owner.token, 'origin=GENERAL&period=7D')
    assert.equal(sevenBox.summary.income, 6000, '7D incluye hoy y los 3 días previos')
    assert.equal(sevenBox.summary.expense, 400, '7D no alcanza el egreso de hace 10 días')
    assert.equal(sevenBox.summary.totalMovements, 3)
    assert.equal(sevenBox.loose.movementCount, 3, 'con 7D la tabla de otros suma el ingreso de hace 3 días')

    const fifteenBox = await cash(owner.token, 'origin=GENERAL&period=15D')
    assert.equal(fifteenBox.summary.income, 6000, '15D: mismos ingresos que 7D')
    assert.equal(fifteenBox.summary.expense, 2900, '15D suma el egreso de hace 10 días')
    assert.equal(fifteenBox.summary.balance, 3100, 'balance del período')
    assert.equal(fifteenBox.loose.movementCount, 4)

    const monthBox = await cash(owner.token, 'origin=GENERAL&period=MONTH')
    assert.equal(monthBox.summary.income, 6000, 'MES no trae el movimiento del mes pasado')
    assert.equal((monthBox.loose.movements as any[]).some(item => item.description === 'Ingreso del mes anterior'), false, 'un movimiento fuera del período no aparece en ninguna tabla')
    assert.equal(monthBox.loose.movementCount, 4, 'MES trae los cuatro del mes en la tabla de otros')

    // 30D: entra lo que está a 20 días y sigue afuera lo de hace 40. El filtro alcanza las dos
    // tablas, los totales y la paginación por igual.
    await movement(businessId, { type: 'INCOME', amount: 700, createdAt: shiftDays(now, -20), description: 'Ingreso de hace 20 días' })
    const thirtyBox = await cash(owner.token, 'origin=GENERAL&period=30D')
    assert.equal(thirtyBox.period, '30D', 'el backend reconoce el período de 30 días')
    assert.equal(thirtyBox.summary.income, 6700, '30D suma el ingreso de hace 20 días')
    assert.equal(thirtyBox.summary.totalMovements, 5, 'y cuenta los cinco movimientos del período')
    assert.equal(thirtyBox.loose.movementCount, 5, 'la tabla de otros también suma el nuevo movimiento')
    assert.equal((thirtyBox.loose.movements as any[]).some(item => item.description === 'Ingreso del mes anterior'), false, 'pero deja afuera lo de hace 40 días')

    const invalidBox = await cash(owner.token, 'origin=GENERAL&period=999D')
    assert.equal(invalidBox.period, 'TODAY', 'un período inválido se responde como TODAY')
    assert.equal(invalidBox.summary.totalMovements, 2, 'y trae los datos de hoy')
    assert.equal((await cash(owner.token, 'origin=GENERAL')).summary.totalMovements, 2, 'sin período también es TODAY')
    // 7/8. Reparaciones: sigue siendo UN grupo, con los movimientos y totales del período.
    const client = (await request('POST', '/clients', { name: 'Cliente Período', phone: '1111111113' }, owner.token)).body
    const repair = (await request('POST', '/repairs', { clientId: client.id, deviceBrand: 'Samsung', deviceModel: 'A14', issue: 'Pantalla', total: 60000 }, owner.token)).body
    await movement(businessId, { type: 'INCOME', amount: 30000, origin: 'REPAIR', repairId: repair.id, createdAt: new Date(now.getTime() - 60_000), description: 'Adelanto de hoy' })
    await movement(businessId, { type: 'EXPENSE', amount: 20000, origin: 'REPAIR', repairId: repair.id, createdAt: new Date(now.getTime() - 90_000), description: 'Costo de hoy' })
    await movement(businessId, { type: 'INCOME', amount: 15000, origin: 'REPAIR', repairId: repair.id, createdAt: shiftDays(now, -5), description: 'Pago de hace 5 dias' })

    const groupToday = findGroup(await groups(owner.token, 'TODAY'), repair.id)
    assert.ok(groupToday, 'la reparación aparece como grupo en HOY')
    assert.equal(groupToday.movementCount, 2, 'el grupo trae sólo los movimientos del período')
    assert.equal(groupToday.income, 30000)
    assert.equal(groupToday.expense, 20000)
    assert.equal(groupToday.net, 10000, 'los totales del grupo son los del período')
    assert.equal(groupToday.movements.some((item: any) => item.description.includes('hace 5')), false, 'el movimiento anterior no aparece en el detalle')

    const groupFifteen = findGroup(await groups(owner.token, '15D'), repair.id)
    assert.equal(groupFifteen.movementCount, 3, 'con 15D el grupo suma el pago de hace 5 días')
    assert.equal(groupFifteen.income, 45000, 'y los ingresos suben con el período')
    assert.equal(groupFifteen.net, 25000)

    // El filtro de 30 días también alcanza a la caja de reparaciones y a su tabla de otros.
    const groupThirty = await groups(owner.token, '30D')
    assert.equal(groupThirty.period, '30D', 'el agrupado de reparaciones acepta 30D')
    const foundThirty = findGroup(groupThirty, repair.id)
    assert.ok(foundThirty, 'y sigue trayendo el grupo de la reparación')
    assert.equal(foundThirty.movementCount, 3, 'con los mismos movimientos que 15D')

    // 9. La paginación sigue siendo por reparación, también con filtro.
    const p1 = (await request('GET', '/cash/movements?origin=REPAIR&groupByRepair=true&pageSize=1&period=15D&page=1', undefined, owner.token)).body
    const p2 = (await request('GET', '/cash/movements?origin=REPAIR&groupByRepair=true&pageSize=1&period=15D&page=2', undefined, owner.token)).body
    const ids = [...(p1.items as any[]), ...(p2.items as any[])].map(group => group.repairId)
    assert.equal(new Set(ids).size, ids.length, 'ninguna reparación se repite entre páginas con filtro')
    assert.equal(p1.items.length, 1, 'cada página trae un grupo completo')

    // 10. Reventa: respeta el período sin cambiar sus reglas financieras.
    const device = (await request('POST', '/equipment-sales', { brand: 'Samsung', model: 'A54', purchasePrice: 40000, estimatedSalePrice: 70000 }, owner.token)).body
    // `createdAt` lo pone la base con su propio reloj, así que se alinea con el instante fijo
    // del escenario: de lo contrario la venta caería fuera del período y el resumen no la vería.
    await prisma.resaleDevice.update({ where: { id: device.id }, data: { createdAt: new Date(now.getTime() - 7200_000) } })
    await movement(businessId, { type: 'EXPENSE', amount: 40000, origin: 'EQUIPMENT', createdAt: new Date(now.getTime() - 3600_000), description: 'Compra de equipo' })
    await prisma.cashMovement.updateMany({ where: { businessId, description: 'Compra de equipo' }, data: { resaleDeviceId: device.id, resaleKind: 'PURCHASE' } })
    await prisma.resaleDevice.update({ where: { id: device.id }, data: { status: 'SOLD', actualSalePrice: 70000, saleCostBasis: 40000, soldAt: new Date(now.getTime() - 1800_000) } })
    const equipment = async (period: string) => (await cash(owner.token, `origin=EQUIPMENT&period=${period}`)).equipmentSummary
    assert.equal((await equipment('TODAY')).salesCount, 1, 'la venta de hoy cuenta')
    assert.equal((await equipment('TODAY')).realizedProfit, 30000, 'ganancia real = precio de venta - costo base')
    // Una venta de hace 40 días no debe entrar ni en Hoy ni en Mes.
    await prisma.resaleDevice.update({ where: { id: device.id }, data: { soldAt: shiftDays(now, -40), createdAt: shiftDays(now, -45) } })
    assert.equal((await equipment('TODAY')).salesCount, 0, 'HOY excluye la venta antigua')
    assert.equal((await equipment('MONTH')).salesCount, 0, 'MES también la excluye')
    await prisma.resaleDevice.update({ where: { id: device.id }, data: { soldAt: new Date(now.getTime() - 1800_000) } })

    // 11. Comercio: la caja filtra por período y una venta cancelada sigue excluida.
    await movement(businessId, { type: 'INCOME', amount: 70000, origin: 'COMMERCE', createdAt: new Date(now.getTime() - 600_000), description: 'Venta de hoy' })
    await movement(businessId, { type: 'INCOME', amount: 30000, origin: 'COMMERCE', createdAt: shiftDays(now, -40), description: 'Venta vieja' })
    const commerceToday = await cash(owner.token, 'origin=COMMERCE&period=TODAY')
    assert.equal(commerceToday.summary.income, 70000, 'Comercio HOY sólo ve la venta de hoy')
    assert.equal(commerceToday.summary.totalMovements, 1)
    assert.equal((await cash(owner.token, 'origin=COMMERCE&period=15D')).summary.income, 70000, '15D no suma la venta de hace 40 días')
    assert.equal((await cash(owner.token, 'origin=COMMERCE&period=MONTH')).summary.income, 70000, 'MES tampoco')

    // 12/13. General sigue correcto y el aislamiento por negocio se mantiene con filtro.
    assert.equal((await cash(owner.token, 'origin=GENERAL&period=15D')).summary.income, 6000, 'Caja General por 15D')
    const foreignBox = await request('GET', '/cash/movements?pageSize=100&origin=REPAIR&groupByRepair=true&period=15D', undefined, other.token)
    assert.equal(foreignBox.status, 200)
    assert.equal(foreignBox.body.total, 0, 'el otro negocio no ve estos grupos')
    assert.ok(!(foreignBox.body.items as any[]).some(item => item.repairId === repair.id), 'ni los movimientos ajenos')

    console.log('CASH PERIOD PASSED: límites por días calendario, movimientos e ingresos/egresos/balance por período, grupos de reparación acotados, paginación por grupo, reventa y comercio por período, aislamiento por negocio y período inválido -> TODAY')
  } finally {
    restoreClock()
    await clean()
    await prisma.$disconnect()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })