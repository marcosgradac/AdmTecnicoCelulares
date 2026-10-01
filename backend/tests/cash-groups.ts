import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { validRegistrationPayload } from './helpers/registration'

process.env.NODE_ENV = 'test'
process.env.RATE_LIMIT_AUTH_WRITES_MAX = '300'
process.env.TURNSTILE_SECRET_KEY = 'test-only-secret'
const nativeFetch = globalThis.fetch
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
  String(input).includes('challenges.cloudflare.com/turnstile')
    ? Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }))
    : nativeFetch(input, init)) as typeof fetch

interface Group { repairId: string; repairNumber: number; clientName: string; income: number; expense: number; net: number; movementCount: number; movements: any[] }
const groupsOf = (body: any) => body.items as Group[]
const findGroup = (body: any, repairId: string) => groupsOf(body).find(group => group.repairId === repairId)

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
    const result = await request('POST', '/auth/register', validRegistrationPayload({ firstName: 'Caja', lastName: label, email: `cash-${label}-${suffix}@example.com`, password, businessName: `Caja ${label}` }))
    assert.equal(result.status, 201); businesses.push(result.body.user.business.id)
    return { token: result.body.token as string, businessId: result.body.user.business.id as string }
  }
  const clean = async () => {
    const stale = await prisma.business.findMany({ where: { users: { some: { email: { contains: 'cash-' } } } }, select: { id: true } })
    for (const business of stale) {
      await prisma.$transaction([
        prisma.warrantyClaimExpense.deleteMany({ where: { businessId: business.id } }),
        prisma.warrantyClaim.deleteMany({ where: { businessId: business.id } }),
        prisma.repairStatusHistory.deleteMany({ where: { repair: { businessId: business.id } } }),
        prisma.repairPhoto.deleteMany({ where: { repair: { businessId: business.id } } }),
        prisma.payment.deleteMany({ where: { businessId: business.id } }),
        prisma.repair.updateMany({ where: { businessId: business.id }, data: { initialCostMovementId: null } }),
        prisma.cashMovement.updateMany({ where: { businessId: business.id }, data: { commerceSaleId: null, relatedCommerceSaleId: null, resaleDeviceId: null } }),
        prisma.cashMovement.deleteMany({ where: { businessId: business.id } }),
        prisma.repair.deleteMany({ where: { businessId: business.id } }),
        prisma.device.deleteMany({ where: { businessId: business.id } }),
        prisma.commerceSale.deleteMany({ where: { businessId: business.id } }),
        prisma.commerceProduct.deleteMany({ where: { businessId: business.id } }),
        prisma.commerceCategory.deleteMany({ where: { businessId: business.id } }),
        prisma.resaleDevice.deleteMany({ where: { businessId: business.id } }),
        prisma.client.deleteMany({ where: { businessId: business.id } }),
        prisma.passwordResetToken.deleteMany({ where: { user: { businessId: business.id } } }),
        prisma.subscription.deleteMany({ where: { businessId: business.id } }),
        prisma.user.deleteMany({ where: { businessId: business.id } }),
        prisma.business.delete({ where: { id: business.id } }),
      ])
    }
  }
  const create = async (clientId: string, token: string, input: object) => {
    const result = await request('POST', '/repairs', { clientId, deviceBrand: 'Samsung', deviceModel: 'A14', issue: 'Pantalla', ...input }, token)
    assert.equal(result.status, 201, JSON.stringify(result.body))
    return result.body
  }
  // 15D cubre los fixtures de este archivo, que incluyen un movimiento de hace 10 días
  // para comprobar el orden por última actividad. El filtro de período se prueba aparte,
  // en tests/cash-period.ts.
  const groups = async (token: string, extra = '') => (await request('GET', `/cash/movements?origin=REPAIR&groupByRepair=true&pageSize=10&period=15D${extra}`, undefined, token)).body
  const movementsOf = (repairId: string) => prisma.cashMovement.count({ where: { repairId, origin: 'REPAIR' } })
  try {
    const ownerA = await register('A')
    const ownerB = await register('B')
    const clientA = (await request('POST', '/clients', { name: 'Bruno Acosta', phone: '1111111111' }, ownerA.token)).body
    const clientB = (await request('POST', '/clients', { name: 'Bruno Acosta', phone: '3333333333' }, ownerB.token)).body
    // Reparación con costo inicial y adelanto: dos movimientos de la misma orden.
    const r1 = await create(clientA.id, ownerA.token, { total: 60000, partsCost: 30000, advanceAmount: 30000, advanceMethod: 'TRANSFER' })
    const r2 = await create(clientA.id, ownerA.token, { total: 40000, partsCost: 20000, advanceAmount: 20000, advanceMethod: 'CASH' })
    assert.equal((await request('POST', `/repairs/${r2.id}/payments`, { amount: 10000, method: 'CARD' }, ownerA.token)).status, 201)

    // 1. Los dos movimientos de la misma reparación quedan en un único grupo.
    const all = await groups(ownerA.token)
    const g1 = findGroup(all, r1.id)
    assert.ok(g1, 'la reparación con costo y adelanto aparece como grupo')
    assert.equal(g1.movementCount, 2, 'los dos movimientos están en un solo grupo')
    assert.equal(g1.movements.length, 2, 'el grupo trae sus dos movimientos')

    // 2. Reparaciones distintas son grupos distintos aunque compartan cliente.
    const g2 = findGroup(all, r2.id)
    assert.ok(g2, 'la segunda reparación también es un grupo')
    assert.notEqual(g1.repairId, g2.repairId, 'son grupos independientes')
    assert.equal(g1.clientName, 'Bruno Acosta')
    assert.equal(g2.clientName, 'Bruno Acosta', 'el mismo cliente puede tener varios grupos')

    // 3. Ingresos, egresos y neto.
    assert.equal(g1.income, 30000, 'ingresos = adelanto')
    assert.equal(g1.expense, 30000, 'egresos = costo inicial')
    assert.equal(g1.net, 0, 'neto = ingresos - egresos')
    assert.equal(g2.income, 30000, 'segunda reparación: adelanto + pago posterior')
    assert.equal(g2.expense, 20000, 'segunda reparación: costo inicial')
    assert.equal(g2.net, 10000, 'neto de la segunda reparación')

    // 4. Una reparación con varios pagos sigue siendo un único grupo.
    assert.equal(g2.movementCount, 3, 'adelanto, pago posterior y costo en el mismo grupo')
    assert.equal(g2.movements.length, 3, 'el grupo lista los tres movimientos')
    assert.equal(new Set(g2.movements.map(movement => movement.id)).size, 3, 'no hay movimientos repetidos')

    // 5/6. La paginación es por reparación y ninguna queda partida.
    const extra = []
    for (let index = 0; index < 4; index++) extra.push(await create(clientA.id, ownerA.token, { total: 10000, advanceAmount: 5000, advanceMethod: 'CASH' }))
    const page1 = await groups(ownerA.token)
    const page2 = await groups(ownerA.token, '&page=2')
    assert.equal(page1.total, 6, 'el total cuenta reparaciones, no movimientos')
    assert.equal(page1.items.length, 6, 'con pageSize 10 entran los 6 grupos')
    assert.equal(new Set([...page1.items.map(g => g.repairId), ...page2.items.map(g => g.repairId)]).size, 6, 'no se repite ninguna reparación entre páginas')
    for (const group of groupsOf(page1)) assert.equal(group.movementCount, await movementsOf(group.repairId), 'el grupo trae TODOS sus movimientos')
    // Con una página chica, cada grupo sigue completo.
    const small1 = await request('GET', '/cash/movements?origin=REPAIR&groupByRepair=true&pageSize=2&page=1&period=15D', undefined, ownerA.token)
    const small2 = await request('GET', '/cash/movements?origin=REPAIR&groupByRepair=true&pageSize=2&page=2&period=15D', undefined, ownerA.token)
    assert.equal(small1.body.items.length, 2, 'página 1 trae 2 grupos')
    assert.equal(small2.body.items.length, 2, 'página 2 trae 2 grupos')
    for (const page of [small1, small2]) {
      for (const group of groupsOf(page.body)) assert.equal(group.movementCount, await movementsOf(group.repairId), 'ninguna reparación queda partida entre páginas')
    }
    // 7. Orden por última actividad.
    const oldest = extra[0]
    const before = await groups(ownerA.token)
    assert.ok(before.items.some((g: Group) => g.repairId === oldest.id), 'la reparación antigua está en la lista')
    await prisma.cashMovement.updateMany({ where: { repairId: oldest.id }, data: { createdAt: new Date(Date.now() - 10 * 86_400_000) } })
    const after = await groups(ownerA.token)
    assert.equal(after.items.at(-1).repairId, oldest.id, 'la reparación más antigua queda al final')
    // La primera debe ser la que tiene el movimiento más reciente de toda la caja.
    const newest = await prisma.cashMovement.findFirst({
      where: { businessId: ownerA.businessId, origin: 'REPAIR', repairId: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { repairId: true },
    })
    assert.equal(after.items[0].repairId, newest!.repairId, 'la reparación con la actividad más reciente va primera')
    assert.equal(newest!.repairId, extra[3].id, 'y es la creada al final')
    // Un movimiento nuevo la devuelve arriba conservando todos sus movimientos.
    await prisma.cashMovement.create({ data: { businessId: ownerA.businessId, repairId: oldest.id, type: 'INCOME', origin: 'REPAIR', description: 'Pago tardío', amount: 1000, method: 'CASH' } })
    const resumed = await groups(ownerA.token)
    assert.equal(resumed.items[0].repairId, oldest.id, 'la reparación retomada vuelve arriba')
    assert.equal(findGroup(resumed, oldest.id).movementCount, 2, 'y conserva juntos sus movimientos anteriores y el nuevo')

    // 8. Aislamiento por negocio.
    const foreign = await create(clientB.id, ownerB.token, { total: 20000, advanceAmount: 20000, advanceMethod: 'CASH' })
    const bGroups = await groups(ownerB.token)
    assert.equal(bGroups.total, 1, 'cada negocio cuenta sólo sus reparaciones')
    assert.equal(bGroups.items[0].repairId, foreign.id, 'el grupo ajeno no se filtra')
    assert.ok(!bGroups.items.some((g: Group) => g.repairId === r1.id), 'nada del otro negocio aparece')
    assert.ok(!(await groups(ownerA.token)).items.some((g: Group) => g.repairId === foreign.id), 'y viceversa')

    // 9. Movimientos REPAIR sin repairId: no desaparecen ni se cuelgan de una reparación.
    await prisma.cashMovement.create({ data: { businessId: ownerA.businessId, type: 'INCOME', origin: 'REPAIR', description: 'Ajuste manual sin orden', amount: 7000, method: 'CASH' } })
    await prisma.cashMovement.create({ data: { businessId: ownerA.businessId, type: 'EXPENSE', origin: 'REPAIR', description: 'Gasto manual sin orden', amount: 2000, method: 'CASH' } })
    const withLoose = await groups(ownerA.token)
    assert.ok(withLoose.loose, 'los movimientos sueltos llegan en su propio bloque')
    assert.equal(withLoose.loose.movementCount, 2, 'no se pierde ninguno')
    assert.equal(withLoose.loose.income, 7000)
    assert.equal(withLoose.loose.expense, 2000)
    assert.equal(withLoose.loose.net, 5000, 'neto propio del bloque')
    assert.ok(!groupsOf(withLoose).some((g: Group) => g.movements.some(movement => movement.description.includes('sin orden'))), 'nunca se asignan a una reparación')
    assert.equal((await groups(ownerB.token)).loose.movementCount, 0, 'el bloque suelto tampoco cruza negocios')

    // 10. La separación es la misma en todas las cajas: la tabla principal muestra lo vinculado
    // al módulo y los manuales van a su propia tabla, sin dejar de contar en el resumen.
    await prisma.cashMovement.create({ data: { businessId: ownerA.businessId, type: 'INCOME', origin: 'GENERAL', description: 'Ingreso general', amount: 5000, method: 'CASH' } })
    const general = await request('GET', '/cash/movements?origin=GENERAL&pageSize=10', undefined, ownerA.token)
    assert.equal(general.status, 200, 'Caja General responde')
    assert.equal(general.body.items.length, 0, 'un movimiento sin entidad no aparece en la tabla principal')
    assert.equal(general.body.total, 0, 'ni cuenta en su paginación')
    assert.equal(general.body.loose.movementCount, 1, 'aparece en la tabla de otros movimientos')
    assert.equal(general.body.loose.movements[0].description, 'Ingreso general', 'con su descripción intacta')
    assert.equal(general.body.summary.totalMovements, 1, 'pero sigue contando en el resumen de la caja')
    assert.equal(general.body.summary.income, 5000, 'y en los ingresos')
    const allOrigins = await request('GET', '/cash/movements?pageSize=50', undefined, ownerA.token)
    assert.ok(allOrigins.body.items.some((item: any) => item.origin === 'REPAIR'), 'la vista global conserva los movimientos de reparaciones')
    const manuals = ['Ajuste manual sin orden', 'Gasto manual sin orden', 'Ingreso general']
    assert.ok(!allOrigins.body.items.some((item: any) => manuals.includes(item.description)), 'y saca de la tabla principal los movimientos manuales')
    assert.equal(allOrigins.body.loose.movementCount, 3, 'los tres manuales van juntos en su propia tabla')
    assert.equal(allOrigins.body.summary.totalMovements, allOrigins.body.total + allOrigins.body.loose.movementCount, 'el resumen sigue contando las dos tablas')
    assert.equal((await request('GET', '/cash/movements?origin=GENERAL&groupByRepair=true', undefined, ownerA.token)).status, 400, 'no se agrupa la caja General')

    // 11. Reventa: los movimientos con equipo van a la tabla principal y el manual a "Otros".
    // Crear el equipo ya deja su compra registrada y vinculada: sirve de caso real.
    const device = (await request('POST', '/equipment-sales', { brand: 'Samsung', model: 'A54', purchasePrice: 40000, estimatedSalePrice: 70000 }, ownerA.token)).body
    assert.ok(device?.id, 'se crea el equipo de reventa')
    await prisma.cashMovement.create({ data: { businessId: ownerA.businessId, type: 'INCOME', origin: 'EQUIPMENT', description: 'Ajuste manual de reventa', amount: 3000, method: 'CASH' } })
    const equipment = await request('GET', '/cash/movements?origin=EQUIPMENT&pageSize=10', undefined, ownerA.token)
    assert.equal(equipment.status, 200, 'la caja de reventa responde')
    assert.ok(equipment.body.items.length >= 1, 'la compra con equipo aparece en la tabla principal')
    for (const item of equipment.body.items as any[]) assert.ok(item.resaleDeviceId, 'todo lo listado está vinculado a un equipo')
    assert.equal(equipment.body.total, equipment.body.items.length, 'y es lo único que pagina')
    assert.equal(equipment.body.loose.movementCount, 1, 'el ingreso sin equipo va a otros movimientos')
    assert.equal(equipment.body.loose.movements[0].description, 'Ajuste manual de reventa')
    assert.equal(equipment.body.summary.income, 3000, 'el manual sigue contando en los ingresos')
    assert.equal(equipment.body.summary.expense, 40000, 'y el vinculado en los egresos')
    assert.equal(equipment.body.summary.totalMovements, 2, 'el resumen suma las dos tablas')

    // 12. Comercio: la venta va a la tabla principal y el ingreso sin venta a su propia tabla.
    const category = (await request('POST', '/commerce/categories', { name: 'Caja accesorio' }, ownerA.token)).body
    const product = (await request('POST', '/commerce/products', { name: 'Cable caja', category: category.name, purchaseCost: 1000, salePrice: 2500, currentStock: 5 }, ownerA.token)).body
    const sale = await request('POST', '/commerce/sales', { lines: [{ productId: product.id, quantity: 1, expectedUnitPrice: 2500 }], expectedTotal: 2500, idempotencyKey: randomUUID(), paymentMethod: 'CASH' }, ownerA.token)
    assert.equal(sale.status, 201, 'la venta de comercio se registra: ' + JSON.stringify(sale.body))
    await prisma.cashMovement.create({ data: { businessId: ownerA.businessId, type: 'INCOME', origin: 'COMMERCE', description: 'Ingreso manual de comercio', amount: 1500, method: 'CASH' } })
    const commerce = await request('GET', '/cash/movements?origin=COMMERCE&pageSize=10', undefined, ownerA.token)
    assert.equal(commerce.body.items.length, 1, 'sólo la venta aparece en la tabla principal')
    assert.equal(commerce.body.items[0].commerceSaleId, sale.body.id, 'y está vinculada a su venta')
    assert.equal(commerce.body.loose.movementCount, 1, 'el ingreso sin venta va a otros movimientos')
    assert.equal(commerce.body.loose.movements[0].description, 'Ingreso manual de comercio')
    assert.equal(commerce.body.summary.totalMovements, 2, 'sin perder ningún movimiento')

    // 13. La tabla de otros movimientos NO pagina: llega entera en la misma respuesta y, por
    // tanto, no desplaza ni parte las reparaciones de la tabla principal.
    await prisma.cashMovement.createMany({ data: Array.from({ length: 25 }, (_, index) => ({ businessId: ownerA.businessId, type: 'INCOME' as const, origin: 'REPAIR' as const, description: `Manual ${index + 1}`, amount: 100, method: 'CASH' as const })) })
    const withManyManuals = await groups(ownerA.token)
    assert.equal(withManyManuals.loose.movementCount, 27, 'los 25 manuales nuevos llegan enteros, sin paginar')
    assert.equal(withManyManuals.items.length, 6, 'y la página de reparaciones sigue mostrando los mismos 6 grupos')
    assert.equal(withManyManuals.total, 6, 'sin que los manuales alteren el total de reparaciones')
    for (const group of groupsOf(withManyManuals)) assert.equal(group.movementCount, await movementsOf(group.repairId), 'ninguna reparación se partió ni ganó movimientos')
    const smallWithManuals = await request('GET', '/cash/movements?origin=REPAIR&groupByRepair=true&pageSize=2&page=1&period=15D', undefined, ownerA.token)
    assert.equal(smallWithManuals.body.items.length, 2, 'con pageSize chico la paginación sigue siendo por grupo')
    assert.equal(smallWithManuals.body.loose.movementCount, 27, 'y la tabla de otros no se ve afectada por la página')
    // Ningún movimiento aparece dos veces: juntas, las dos tablas son la caja completa.
    const looseIds: string[] = withManyManuals.loose.movements.map((movement: any) => movement.id)
    const groupIds: string[] = groupsOf(withManyManuals).flatMap((group: Group) => group.movements.map(movement => movement.id))
    assert.equal(new Set([...looseIds, ...groupIds]).size, looseIds.length + groupIds.length, 'ningún movimiento se duplica entre las dos tablas')
    assert.equal(withManyManuals.summary.totalMovements, looseIds.length + groupIds.length, 'el resumen sigue reflejando la caja completa')

    // 14. Sin movimientos manuales la tabla de otros sigue existiendo, vacía y con totales en cero.
    const emptyClient = (await request('POST', '/clients', { name: 'Sin movimientos' }, ownerB.token)).body
    const emptyRepair = await create(emptyClient.id, ownerB.token, { total: 10000, advanceAmount: 10000, advanceMethod: 'CASH' })
    const bBox = await groups(ownerB.token)
    assert.equal(bBox.loose.movementCount, 0, 'sin manuales el bloque viene vacío')
    assert.equal(bBox.loose.income, 0)
    assert.equal(bBox.loose.expense, 0)
    assert.equal(bBox.loose.net, 0)
    assert.deepEqual(bBox.loose.movements, [], 'y sin movimientos que listar')
    assert.ok(bBox.items.some((g: Group) => g.repairId === emptyRepair.id), 'la tabla principal de reparaciones sigue intacta')

    await clean()
    console.log('CASH GROUPS PASSED: grouping by repair, distinct groups, income/expense/net, several payments in one group, pagination by group, no split repair, last-activity order, tenant isolation, loose REPAIR movements kept apart, General/Reventa/Commerce cash unchanged, "Otros movimientos" unpaginated and never duplicated, and its empty state present with zero totals')
  } finally {
    await clean()
    await prisma.$disconnect()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })