import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { app } from '../src/server'
import { prisma } from '../src/lib/prisma'
import { validRegistrationPayload } from './helpers/registration'

async function main() {
  const server = app.listen(0); await new Promise<void>(resolve => server.once('listening', resolve)); const address = server.address(); assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${(address as any).port}/api`, suffix = Date.now(), businesses: string[] = []
  const request = async (method: string, path: string, body?: object, token?: string) => { const response = await fetch(`${base}${path}`, { method, headers: { ...(body ? { 'content-type':'application/json' } : {}), ...(token ? { authorization:`Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); const text = await response.text(); return { status:response.status, body:text ? JSON.parse(text) : null } }
  const register = async (label: string) => { const password = `Qa-${randomBytes(12).toString('base64url')}9!`; const result = await request('POST','/auth/register',validRegistrationPayload({firstName:'Cancel',lastName:label,email:`cancel-${label}-${suffix}@example.com`,password,businessName:`Cancel ${label}`})); assert.equal(result.status,201); businesses.push(result.body.user.business.id); return { token:result.body.token as string, businessId:result.body.user.business.id as string } }
  const clientIds = new Map<string,string>()
  const clientFor = async (token: string) => { if (!clientIds.has(token)) { const created = await request('POST','/clients',{name:'Cliente cancelación',phone:`30${String(Math.floor(Math.random()*1e8)).padStart(8,'0')}`},token); assert.equal(created.status,201); clientIds.set(token, created.body.id) } return clientIds.get(token)! }
  const createRepair = async (token: string, total: number) => { const repair = await request('POST','/repairs',{deviceBrand:'Nokia',deviceModel:'Test',issue:'Falla para cancelar',total,clientId:await clientFor(token)},token); assert.equal(repair.status,201); return repair.body as { id:string; number:number; status:string; paid:number; total:number; trackingEnabled:boolean } }
  const pay = async (token: string, repairId: string, amount: number) => { const result = await request('POST',`/repairs/${repairId}/payments`,{amount,method:'CASH'},token); assert.equal(result.status,201); return result.body }
  const movementsOf = (repairId: string) => prisma.cashMovement.findMany({ where: { repairId }, orderBy: { createdAt: 'asc' } })
  const balanceOf = (movements: Array<{ type: string; amount: number }>) => movements.reduce((sum, movement) => sum + (movement.type === 'INCOME' ? movement.amount : -movement.amount), 0)

  try {
    const owner = await register('A')
    const worker = await register('B')
    const owner2 = await register('C')
    // 1) paid = 0: se cancela sin movimientos de Caja
    const free = await createRepair(owner.token, 70000)
    const freeCancel = await request('POST',`/repairs/${free.id}/cancel`,{reviewFee:0},owner.token)
    assert.equal(freeCancel.status,200)
    const freeDb = await prisma.repair.findUnique({ where: { id: free.id } })
    assert.equal(freeDb?.status,'CANCELLED')
    assert.ok(freeDb?.cancelledAt)
    assert.equal(freeDb?.cancellationPaidAmount,0)
    assert.equal(freeDb?.cancellationReviewFee,0)
    assert.equal(freeDb?.cancellationRefundAmount,0)
    assert.equal(await movementsOf(free.id).then(rows => rows.length),0)
    assert.equal(await prisma.payment.count({ where: { repairId: free.id } }),0)

    // 2) paid = 50000, reviewFee = 0: devolución completa
    const full = await createRepair(owner.token, 70000)
    await pay(owner.token, full.id, 50000)
    const fullCancel = await request('POST',`/repairs/${full.id}/cancel`,{reviewFee:0,refundMethod:'TRANSFER'},owner.token)
    assert.equal(fullCancel.status,200)
    const fullDb = await prisma.repair.findUnique({ where: { id: full.id } })
    assert.equal(fullDb?.status,'CANCELLED')
    assert.equal(fullDb?.paid,50000,'paid no debe reducirse')
    assert.equal(fullDb?.cancellationPaidAmount,50000)
    assert.equal(fullDb?.cancellationReviewFee,0)
    assert.equal(fullDb?.cancellationRefundAmount,50000)
    assert.equal(fullDb?.cancellationRefundMethod,'TRANSFER')
    const fullMovements = await movementsOf(full.id)
    assert.equal(fullMovements.filter(m => m.type === 'INCOME').length,1)
    const fullRefunds = fullMovements.filter(m => m.type === 'EXPENSE')
    assert.equal(fullRefunds.length,1)
    assert.equal(fullRefunds[0].amount,50000)
    assert.equal(fullRefunds[0].method,'TRANSFER')
    assert.equal(fullDb?.cancellationRefundMovementId,fullRefunds[0].id)
    assert.equal(balanceOf(fullMovements),0,'+50000 / -50000 = 0')

    // 3) paid = 50000, reviewFee = 20000: neto 20000
    const review = await createRepair(owner.token, 70000)
    await pay(owner.token, review.id, 50000)
    const reviewCancel = await request('POST',`/repairs/${review.id}/cancel`,{reviewFee:20000,refundMethod:'CASH'},owner.token)
    assert.equal(reviewCancel.status,200)
    const reviewDb = await prisma.repair.findUnique({ where: { id: review.id } })
    assert.equal(reviewDb?.paid,50000)
    assert.equal(reviewDb?.cancellationPaidAmount,50000)
    assert.equal(reviewDb?.cancellationReviewFee,20000)
    assert.equal(reviewDb?.cancellationRefundAmount,30000)
    const reviewMovements = await movementsOf(review.id)
    assert.equal(reviewMovements.filter(m => m.type === 'EXPENSE').length,1)
    assert.equal(reviewMovements.find(m => m.type === 'EXPENSE')?.amount,30000)
    assert.equal(balanceOf(reviewMovements),20000,'+50000 / -30000 = 20000')

    // 4) paid = 50000, reviewFee = 50000: sin devolución y sin medio requerido
    const keep = await createRepair(owner.token, 70000)
    await pay(owner.token, keep.id, 50000)
    const keepCancel = await request('POST',`/repairs/${keep.id}/cancel`,{reviewFee:50000},owner.token)
    assert.equal(keepCancel.status,200)
    const keepDb = await prisma.repair.findUnique({ where: { id: keep.id } })
    assert.equal(keepDb?.cancellationReviewFee,50000)
    assert.equal(keepDb?.cancellationRefundAmount,0)
    assert.equal(keepDb?.cancellationRefundMethod,null)
    assert.equal(keepDb?.cancellationRefundMovementId,null)
    assert.equal(await movementsOf(keep.id).then(rows => rows.filter(m => m.type === 'EXPENSE').length),0,'no se crea egreso de monto 0')
    assert.equal(balanceOf(await movementsOf(keep.id)),50000)
    // 5) reviewFee negativo
    const negative = await createRepair(owner2.token, 70000)
    await pay(owner2.token, negative.id, 50000)
    assert.equal((await request('POST',`/repairs/${negative.id}/cancel`,{reviewFee:-1000,refundMethod:'CASH'},owner2.token)).status,400)
    assert.notEqual((await prisma.repair.findUnique({ where: { id: negative.id } }))?.status,'CANCELLED')
    assert.equal(await movementsOf(negative.id).then(rows => rows.filter(m => m.type === 'EXPENSE').length),0)

    // 6) reviewFee > paid ahora está permitido: queda saldo por cobrar, no devolución
    const owe = await createRepair(worker.token, 70000)
    await pay(worker.token, owe.id, 10000)
    const oweCancel = await request('POST',`/repairs/${owe.id}/cancel`,{reviewFee:20000},worker.token)
    assert.equal(oweCancel.status,200)
    const oweDb = await prisma.repair.findUnique({ where: { id: owe.id } })
    assert.equal(oweDb?.status,'CANCELLED')
    assert.equal(oweDb?.cancellationPaidAmount,10000)
    assert.equal(oweDb?.cancellationReviewFee,20000)
    assert.equal(oweDb?.cancellationRefundAmount,0,'con saldo de revisión no hay devolución')
    assert.equal(oweDb?.cancellationRefundMethod,null)
    assert.equal(oweDb?.cancellationReviewPaid,0)
    assert.equal(await movementsOf(owe.id).then(rows => rows.filter(m => m.type === 'EXPENSE').length),0)
    assert.equal(balanceOf(await movementsOf(owe.id)),10000,'la caja sólo cuenta lo cobrado')

    // 7) refund > 0 sin refundMethod
    assert.equal((await request('POST',`/repairs/${negative.id}/cancel`,{reviewFee:20000},owner2.token)).status,400)
    assert.notEqual((await prisma.repair.findUnique({ where: { id: negative.id } }))?.status,'CANCELLED')
    assert.equal(await movementsOf(negative.id).then(rows => rows.filter(m => m.type === 'EXPENSE').length),0)
    assert.equal(await prisma.payment.count({ where: { repairId: negative.id } }),1)

    // 8) doble request: no duplica la devolución
    const twice = await createRepair(owner2.token, 70000)
    await pay(owner2.token, twice.id, 50000)
    const firstCancel = await request('POST',`/repairs/${twice.id}/cancel`,{reviewFee:20000,refundMethod:'CASH'},owner2.token)
    const secondCancel = await request('POST',`/repairs/${twice.id}/cancel`,{reviewFee:20000,refundMethod:'CASH'},owner2.token)
    assert.equal(firstCancel.status,200)
    assert.equal(secondCancel.status,409)
    assert.equal((await movementsOf(twice.id)).filter(m => m.type === 'EXPENSE').length,1)
    const twiceDb = await prisma.repair.findUnique({ where: { id: twice.id } })
    assert.equal(twiceDb?.paid,50000)
    assert.equal(twiceDb?.cancellationReviewFee,20000)
    assert.equal(twiceDb?.cancellationRefundAmount,30000)
    const race = await createRepair(owner2.token, 70000)
    await pay(owner2.token, race.id, 50000)
    const [raceA, raceB] = await Promise.all([
      request('POST',`/repairs/${race.id}/cancel`,{reviewFee:20000,refundMethod:'CASH'},owner2.token),
      request('POST',`/repairs/${race.id}/cancel`,{reviewFee:0,refundMethod:'TRANSFER'},owner2.token),
    ])
    assert.ok([raceA.status, raceB.status].includes(200),'una request concurrente debe concretar la cancelación')
    assert.ok([raceA.status, raceB.status].every(status => status === 200 || status === 409),`estados inesperados: ${raceA.status}/${raceB.status}`)
    assert.equal((await movementsOf(race.id)).filter(m => m.type === 'EXPENSE').length,1,'las requests concurrentes no pueden duplicar el egreso')
    assert.equal(balanceOf(await movementsOf(race.id)),20000)

    // 9) reparación de otro businessId no accesible
    const foreign = await createRepair(owner2.token, 70000)
    await pay(owner2.token, foreign.id, 50000)
    assert.equal((await request('POST',`/repairs/${foreign.id}/cancel`,{reviewFee:0,refundMethod:'CASH'},worker.token)).status,404)
    assert.notEqual((await prisma.repair.findUnique({ where: { id: foreign.id } }))?.status,'CANCELLED')
    assert.equal(await movementsOf(foreign.id).then(rows => rows.filter(m => m.type === 'EXPENSE').length),0)
    // 10) Payment original permanece
    const payments = await prisma.payment.findMany({ where: { repairId: review.id } })
    assert.equal(payments.length,1)
    assert.equal(payments[0].amount,50000)

    // 11) CashMovement INCOME original permanece
    const incomes = (await movementsOf(review.id)).filter(m => m.type === 'INCOME')
    assert.equal(incomes.length,1)
    assert.equal(incomes[0].amount,50000)
    assert.equal(incomes[0].type,'INCOME')

    // 12) refund crea un solo EXPENSE
    assert.equal((await movementsOf(review.id)).filter(m => m.type === 'EXPENSE').length,1)

    // 13) origin = REPAIR
    assert.equal((await movementsOf(review.id)).find(m => m.type === 'EXPENSE')?.origin,'REPAIR')

    // 14) repairId correcto
    const expense = (await movementsOf(review.id)).find(m => m.type === 'EXPENSE')
    assert.equal(expense?.repairId,review.id)
    assert.equal(expense?.description,`Devolución por cancelación reparación #${review.number}`)

    // 15) tracking deshabilitado
    assert.equal((await prisma.repair.findUnique({ where: { id: review.id } }))?.trackingEnabled,false)

    // 16) no permite pagos después de CANCELLED
    assert.equal((await request('POST',`/repairs/${review.id}/payments`,{amount:1000,method:'CASH'},owner.token)).status,409)
    assert.equal(await prisma.payment.count({ where: { repairId: review.id } }),1)

    // 17) el endpoint genérico no permite bypass a CANCELLED
    const bypass = await createRepair(owner2.token, 30000)
    const blocked = await request('PATCH',`/repairs/${bypass.id}/status`,{status:'CANCELLED'},owner2.token)
    assert.ok(blocked.status >= 400 && blocked.status < 500)
    assert.notEqual((await prisma.repair.findUnique({ where: { id: bypass.id } }))?.status,'CANCELLED')
    assert.equal(await movementsOf(bypass.id).then(rows => rows.length),0)
    // los demás estados siguen funcionando
    assert.equal((await request('PATCH',`/repairs/${bypass.id}/status`,{status:'REVIEW'},owner2.token)).status,200)
    assert.equal((await prisma.repair.findUnique({ where: { id: bypass.id } }))?.status,'REVIEW')

    // historial de estado de la cancelación
    const history = await prisma.repairStatusHistory.findMany({ where: { repairId: review.id } })
    assert.equal(history.filter(row => row.newStatus === 'CANCELLED').length,1)

    // paid = 0 con revisión: queda debt completo, sin devolución
    const fromZero = await createRepair(worker.token, 50000)
    assert.equal((await request('POST',`/repairs/${fromZero.id}/cancel`,{reviewFee:20000},worker.token)).status,200)
    const zeroDb = await prisma.repair.findUnique({ where: { id: fromZero.id } })
    assert.equal(zeroDb?.cancellationRefundAmount,0)
    assert.equal(zeroDb?.cancellationReviewFee,20000)
    assert.equal(await movementsOf(fromZero.id).then(rows => rows.length),0,'sin pagos no entra ni sale dinero')

    // guards del cobro de revisión: se validan con el saldo todavía pendiente (10000)
    assert.equal((await request('POST',`/repairs/${owe.id}/cancellation-payment`,{amount:0,method:'CASH'},worker.token)).status,400)
    assert.equal((await request('POST',`/repairs/${owe.id}/cancellation-payment`,{amount:-500,method:'CASH'},worker.token)).status,400)
    assert.equal((await request('POST',`/repairs/${owe.id}/cancellation-payment`,{amount:10001,method:'CASH'},worker.token)).status,400,'no se puede cobrar más que el saldo pendiente')
    assert.equal((await prisma.repair.findUnique({ where: { id: owe.id } }))?.cancellationReviewPaid,0,'los intentos fallidos no mueven el saldo')
    assert.equal(balanceOf(await movementsOf(owe.id)),10000,'caja real = 10000, todavía falta cobrar')

    // se cobra la diferencia (ejemplo C): el adelanto ya cubría 10000 de los 20000
    assert.equal((await request('POST',`/repairs/${owe.id}/cancellation-payment`,{amount:10000,method:'TRANSFER'},worker.token)).status,200)
    const chargedDb = await prisma.repair.findUnique({ where: { id: owe.id } })
    assert.equal(chargedDb?.cancellationReviewPaid,10000)
    assert.equal(chargedDb?.paid,10000,'el adelanto original no se modifica')
    const chargeMovements = await movementsOf(owe.id)
    const chargeIncome = chargeMovements.filter(m => m.type === 'INCOME')
    assert.equal(chargeIncome.length,2)
    assert.equal(chargeIncome[1].description,`Cobro revisión reparación #${owe.number}`)
    assert.equal(chargeIncome[1].amount,10000)
    assert.equal(chargeIncome[1].origin,'REPAIR')
    assert.equal(chargeIncome[1].repairId,owe.id)
    assert.equal(balanceOf(chargeMovements),20000,'caja real = 20000 cuando la revisión queda cubierta')
    assert.equal(await prisma.payment.count({ where: { repairId: owe.id, cancellationReview: true } }),1)
    // la revisión ya liquidada no admite más cobros
    assert.equal((await request('POST',`/repairs/${owe.id}/cancellation-payment`,{amount:100,method:'CASH'},worker.token)).status,409)
    // una reparación no cancelada no usa este flujo
    const notCancelled = await createRepair(worker.token, 10000)
    assert.equal((await request('POST',`/repairs/${notCancelled.id}/cancellation-payment`,{amount:100,method:'CASH'},worker.token)).status,409)

    // cobro concurrente del mismo saldo: sólo uno prospera
    const raceReview = await createRepair(worker.token, 50000)
    assert.equal((await request('POST',`/repairs/${raceReview.id}/cancel`,{reviewFee:20000},worker.token)).status,200)
    const [chargeA, chargeB] = await Promise.all([
      request('POST',`/repairs/${raceReview.id}/cancellation-payment`,{amount:20000,method:'CASH'},worker.token),
      request('POST',`/repairs/${raceReview.id}/cancellation-payment`,{amount:20000,method:'CASH'},worker.token),
    ])
    assert.equal([chargeA.status, chargeB.status].filter(status => status === 200).length,1,'un solo cobro concurrente prospera')
    assert.equal((await prisma.repair.findUnique({ where: { id: raceReview.id } }))?.cancellationReviewPaid,20000)
    assert.equal(balanceOf(await movementsOf(raceReview.id)),20000,'el doble click no duplica el ingreso')

    // ELIMINACIÓN: sólo reparaciones realmente limpias
    const clean = await createRepair(owner2.token, 12000)
    assert.equal((await request('DELETE',`/repairs/${clean.id}`,undefined,owner2.token)).status,200)
    assert.equal(await prisma.repair.findUnique({ where: { id: clean.id } }),null)

    const withPayment = await createRepair(owner2.token, 12000)
    await pay(owner2.token, withPayment.id, 5000)
    assert.equal((await request('DELETE',`/repairs/${withPayment.id}`,undefined,owner2.token)).status,409)
    assert.ok(await prisma.repair.findUnique({ where: { id: withPayment.id } }))

    const withCash = await createRepair(owner2.token, 12000)
    await prisma.cashMovement.create({ data: { businessId: owner2.businessId, type: 'INCOME', origin: 'REPAIR', description: 'Movimiento suelto', amount: 1000, repairId: withCash.id } })
    assert.equal((await request('DELETE',`/repairs/${withCash.id}`,undefined,owner2.token)).status,409)
    assert.ok(await prisma.repair.findUnique({ where: { id: withCash.id } }))

    const withPart = await createRepair(owner2.token, 12000)
    const stock = await prisma.stockItem.create({ data: { businessId: owner2.businessId, name: 'Pantalla', category: 'Repuestos', quantity: 3, cost: 1000, salePrice: 2000 } })
    await prisma.repairPart.create({ data: { repairId: withPart.id, stockItemId: stock.id, quantity: 1, unitCost: 1000, unitPrice: 2000, itemNameSnapshot: 'Pantalla' } })
    assert.equal((await request('DELETE',`/repairs/${withPart.id}`,undefined,owner2.token)).status,409,'el repuesto usado bloquea el borrado')
    assert.ok(await prisma.repair.findUnique({ where: { id: withPart.id } }))

    // de otro negocio no es accesible ni eliminable
    assert.equal((await request('DELETE',`/repairs/${review.id}`,undefined,worker.token)).status,404)
    assert.ok(await prisma.repair.findUnique({ where: { id: review.id } }))

    // CAJA: una reparación normal + una cancelada liquidada dan el neto real
    const netOk = await createRepair(owner.token, 20000)
    await pay(owner.token, netOk.id, 20000)
    const netCancelled = await createRepair(owner.token, 30000)
    await pay(owner.token, netCancelled.id, 30000)
    assert.equal((await request('POST',`/repairs/${netCancelled.id}/cancel`,{reviewFee:15000,refundMethod:'CASH'},owner.token)).status,200)
    const netTotal = [...await movementsOf(netOk.id), ...await movementsOf(netCancelled.id)]
    assert.equal(netTotal.filter(m => m.type === 'INCOME').reduce((sum, m) => sum + m.amount, 0), 50000)
    assert.equal(netTotal.filter(m => m.type === 'EXPENSE').reduce((sum, m) => sum + m.amount, 0), 15000)
    assert.equal(balanceOf(netTotal),35000,'caja neta de reparaciones = 35000, no 50000')

    console.log('REPAIR CANCELLATION TEST PASSED: liquidación, eliminación, saldo de revisión, idempotencia, Caja e historial')
  } finally {
    for (const businessId of businesses) await prisma.$transaction([prisma.payment.deleteMany({where:{businessId}}),prisma.cashMovement.deleteMany({where:{businessId}}),prisma.repairPart.deleteMany({where:{repair:{businessId}}}),prisma.inventoryMovement.deleteMany({where:{businessId}}),prisma.repair.deleteMany({where:{businessId}}),prisma.stockItem.deleteMany({where:{businessId}}),prisma.device.deleteMany({where:{businessId}}),prisma.client.deleteMany({where:{businessId}}),prisma.passwordResetToken.deleteMany({where:{user:{businessId}}}),prisma.subscription.deleteMany({where:{businessId}}),prisma.user.deleteMany({where:{businessId}}),prisma.business.deleteMany({where:{id:businessId}})])
    await prisma.$disconnect(); await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))
  }
}
main().catch(error=>{ console.error(error); process.exitCode=1 })
