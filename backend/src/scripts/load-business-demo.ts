import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import { PrismaClient, PaymentMethod, type RepairStatus } from '@prisma/client'
import { allocateRepairNumber } from '../lib/repair-number'

const prisma = new PrismaClient()
const marker = 'demo-cellufix-v2'
const legacyMarker = 'demo-cellufix-v1'
const names = ['Juan Pérez', 'Camila Gómez', 'Lucas Fernández', 'Sofía Rodríguez', 'Nicolás Martínez', 'Valentina López', 'Matías Sánchez', 'Martina Romero', 'Franco Díaz', 'Agustina Torres', 'Tomás Herrera', 'Julieta Castro', 'Bruno Acosta', 'Malena Ríos', 'Joaquín Medina', 'Emilia Suárez', 'Santino Molina', 'Delfina Cabrera']
const phones = [['Apple', 'iPhone 11'], ['Apple', 'iPhone 13'], ['Samsung', 'A14'], ['Samsung', 'A54'], ['Motorola', 'Moto G32'], ['Motorola', 'Edge 30'], ['Xiaomi', 'Redmi Note 11'], ['Xiaomi', 'Poco X5']]
const issues = ['Cambio de módulo', 'Cambio de batería', 'Cambio de pin de carga', 'No enciende', 'Pantalla sin imagen', 'Problema de táctil', 'Daño por humedad', 'Falla de cámara']
const flow: RepairStatus[] = ['RECEIVED', 'REVIEW', 'BUDGET', 'APPROVED', 'WAITING_PART', 'REPAIRING', 'TESTING', 'READY', 'DELIVERED']
const fullStatuses: RepairStatus[] = ['RECEIVED', 'RECEIVED', 'REVIEW', 'REVIEW', 'REVIEW', 'BUDGET', 'BUDGET', 'APPROVED', 'APPROVED', 'WAITING_PART', 'WAITING_PART', 'REPAIRING', 'REPAIRING', 'REPAIRING', 'REPAIRING', 'TESTING', 'TESTING', 'TESTING', 'READY', 'READY', 'READY', 'DELIVERED', 'DELIVERED', 'DELIVERED', 'WARRANTY']
const smallStatuses: RepairStatus[] = ['RECEIVED', 'REVIEW', 'REPAIRING', 'READY', 'DELIVERED', 'WARRANTY']
const cancellations = [
  { label: 'cancel-refund-review', paid: 40000, reviewFee: 15000, reviewPaid: 0 },
  { label: 'cancel-covered-review', paid: 20000, reviewFee: 20000, reviewPaid: 0 },
  { label: 'cancel-pending-review', paid: 10000, reviewFee: 20000, reviewPaid: 0 },
  { label: 'cancel-full-refund', paid: 40000, reviewFee: 0, reviewPaid: 0 },
  { label: 'cancel-review-collected', paid: 10000, reviewFee: 20000, reviewPaid: 10000 },
  { label: 'cancel-free', paid: 0, reviewFee: 0, reviewPaid: 0 },
]
const methods = [PaymentMethod.CASH, PaymentMethod.TRANSFER, PaymentMethod.CARD, PaymentMethod.OTHER]

async function main() {
  const email = process.env.DEMO_USER_EMAIL?.trim().toLowerCase()
  if (!email) throw new Error('DEMO_USER_EMAIL es obligatorio')
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '')
  // A remote connection also requires opt-in even if NODE_ENV was omitted.
  const production = process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1', '[::1]'].includes(databaseUrl.hostname)
  if (production && process.env.DEMO_ALLOW_PRODUCTION !== 'true') {
    throw new Error('Carga demo bloqueada: producción/conexión remota requiere DEMO_ALLOW_PRODUCTION=true durante esta ejecución')
  }
  const profile = process.env.DEMO_PROFILE ?? (production ? 'small' : 'full')
  if (profile !== 'full' && profile !== 'small') throw new Error('DEMO_PROFILE debe ser full o small')
  const statuses = profile === 'small' ? smallStatuses : fullStatuses
  const clientCount = profile === 'small' ? 6 : 18
  const deviceCount = profile === 'small' ? 8 : 25
  const now = Date.now()
  const day = 86_400_000

  const result = await prisma.$transaction(async tx => {
    const user = await tx.user.findUnique({ where: { email } })
    if (!user) throw new Error('Usuario inexistente: registrá la cuenta antes de cargar el demo')
    if (!user.isActive || user.deletedAt || user.role !== 'OWNER') throw new Error('El demo requiere un propietario activo')
    const businessId = user.businessId
    // The lock serializes repeat/concurrent runs, including the existence check.
    await tx.$queryRaw`SELECT "id" FROM "Business" WHERE "id" = ${businessId} FOR UPDATE`
    const business = await tx.business.findUniqueOrThrow({ where: { id: businessId } })
    if (!business.isActive) throw new Error('El negocio está inactivo')
    for (const existingMarker of [legacyMarker, marker]) {
      const clients = await tx.client.count({ where: { businessId, notes: { contains: existingMarker } } })
      const repairs = await tx.repair.count({ where: { businessId, notes: { contains: existingMarker } } })
      const movements = await tx.cashMovement.count({ where: { businessId, description: { contains: existingMarker } } })
      if (clients || repairs || movements) return {
        mode: existingMarker === legacyMarker ? 'legacy-existing' : 'existing', businessId,
        marker: existingMarker, clients, repairs, movements,
        message: 'No se modificaron registros ni correlativos. Los demos existentes no se reparan, amplían ni borran automáticamente.',
      }
    }

    const clients = []
    for (let i = 0; i < clientCount; i++) {
      clients.push(await tx.client.create({ data: {
        businessId, name: `${names[i]} (DEMO)`, phone: `54911000${String(i).padStart(4, '0')}`,
        // No WhatsApp value: these are fictional numbers, not messaging targets.
        email: `demo-${i}@example.invalid`, notes: marker, createdAt: new Date(now - (100 - i) * day),
      } }))
    }
    const devices = []
    for (let i = 0; i < deviceCount; i++) {
      const [brand, model] = phones[i % phones.length]
      devices.push(await tx.device.create({ data: {
        businessId, clientId: clients[i % clients.length].id, brand, model,
        color: ['Negro', 'Azul', 'Blanco'][i % 3], storage: i % 2 ? '128 GB' : '256 GB',
        imei: i % 3 ? `9900000000${String(i).padStart(5, '0')}` : null,
        createdAt: new Date(now - 80 * day),
      } }))
    }
    const scenarios = [
      ...statuses.map(status => ({ status, cancellation: undefined as (typeof cancellations)[number] | undefined })),
      ...cancellations.map(cancellation => ({ status: 'CANCELLED' as RepairStatus, cancellation })),
    ]
    let payments = 0, history = 0, cashMovements = 0, activeTrackingLinks = 0
    for (let i = 0; i < scenarios.length; i++) {
      const { status, cancellation } = scenarios[i]
      const device = devices[i % devices.length]
      const client = clients.find(row => row.id === device.clientId)!
      const createdAt = new Date(now - (15 + (scenarios.length - i) * 2) * day)
      const at = (hours: number) => new Date(+createdAt + hours * 3_600_000)
      const delivered = status === 'DELIVERED' || status === 'WARRANTY'
      const total = cancellation ? 50000 : 35000 + (i % 6) * 35000
      const paid = cancellation ? cancellation.paid : delivered ? total : i % 4 === 0 ? 0 : Math.floor(total * (i % 2 ? 0.4 : 0.65))
      const trackingEnabled = !cancellation && !delivered
      const notes = `${marker}:${cancellation?.label ?? status.toLowerCase()}`
      const repair = await tx.repair.create({ data: {
        businessId, number: await allocateRepairNumber(tx, businessId), clientId: client.id, deviceId: device.id,
        deviceBrand: device.brand, deviceModel: device.model, imei: device.imei, color: device.color,
        issue: issues[i % issues.length], diagnosis: status === 'RECEIVED' ? null : `Diagnóstico de prueba: ${issues[i % issues.length].toLowerCase()}.`,
        physicalCondition: i % 4 ? 'Buen estado general' : 'Marcas leves de uso', accessories: 'Sin accesorios', notes,
        status, total, paid, partsCost: cancellation ? 0 : Math.floor(total * 0.42), laborCost: cancellation ? 0 : Math.floor(total * 0.28),
        trackingToken: trackingEnabled ? randomBytes(32).toString('hex') : null,
        trackingEnabled, trackingCreatedAt: trackingEnabled ? createdAt : null, createdAt,
        estimatedDeliveryDate: new Date(+createdAt + 7 * day), deliveredAt: delivered ? at(8 * 12) : null,
        warrantyEnabled: delivered, warrantyDurationDays: delivered ? 90 : null,
        warrantyStartedAt: delivered ? at(8 * 12) : null, warrantyExpiresAt: delivered ? new Date(+at(8 * 12) + 90 * day) : null,
      } })
      if (trackingEnabled) activeTrackingLinks++
      const recordPayment = async (amount: number, cancellationReview: boolean, createdAt: Date) => {
        const method = methods[payments % methods.length]
        const description = cancellationReview ? `Cobro revisión reparación #${repair.number}` : `Pago reparación #${repair.number}`
        await tx.payment.create({ data: { businessId, repairId: repair.id, clientId: client.id, amount, method,
          note: `${notes} · ${description}`, cancellationReview, createdAt } })
        await tx.cashMovement.create({ data: { businessId, type: 'INCOME', origin: 'REPAIR',
          description: `${notes} · ${description}`, amount, method, repairId: repair.id, clientName: client.name, createdAt } })
        payments++; cashMovements++
      }
      if (paid > 0) {
        const installments = !cancellation && i % 5 === 0 ? [Math.floor(paid / 2), paid - Math.floor(paid / 2)] : [paid]
        for (let index = 0; index < installments.length; index++) await recordPayment(installments[index], false, at(6 + index * 6))
      }
      const states = cancellation ? ['RECEIVED', 'REVIEW', 'CANCELLED'] as RepairStatus[]
        : status === 'WARRANTY' ? [...flow, 'WARRANTY'] as RepairStatus[] : flow.slice(0, flow.indexOf(status) + 1)
      for (let index = 0; index < states.length; index++) {
        await tx.repairStatusHistory.create({ data: { repairId: repair.id, previousStatus: index ? states[index - 1] : null,
          newStatus: states[index], changedByUserId: user.id, createdAt: at(index * 12),
          internalNote: notes, publicMessage: states[index] === 'CANCELLED' ? null : 'Estado de demostración actualizado.',
        } })
        history++
      }
      if (status === 'WARRANTY') await tx.warrantyClaim.create({ data: {
        businessId, repairId: repair.id, description: `${notes} · Revisión de garantía: falla intermitente`, createdAt: at(9 * 12),
      } })
      if (cancellation) {
        const refund = Math.max(0, cancellation.paid - cancellation.reviewFee)
        let refundMovementId: string | null = null
        if (refund > 0) {
          const movement = await tx.cashMovement.create({ data: { businessId, type: 'EXPENSE', origin: 'REPAIR',
            description: `${notes} · Devolución por cancelación reparación #${repair.number}`, amount: refund,
            method: 'TRANSFER', repairId: repair.id, clientName: client.name, createdAt: at(24),
          } })
          refundMovementId = movement.id; cashMovements++
        }
        await tx.repair.update({ where: { id: repair.id }, data: {
          cancelledAt: at(24), cancellationPaidAmount: paid, cancellationReviewFee: cancellation.reviewFee,
          cancellationRefundAmount: refund, cancellationRefundMethod: refund > 0 ? 'TRANSFER' : null,
          cancellationRefundMovementId: refundMovementId, cancellationReviewPaid: cancellation.reviewPaid,
        } })
        // Later review payments do not change the original Repair.paid snapshot.
        if (cancellation.reviewPaid > 0) await recordPayment(cancellation.reviewPaid, true, at(48))
      }
    }
    return { mode: 'created', businessId, marker, profile, clients: clients.length, devices: devices.length,
      repairs: scenarios.length, cancellations: cancellations.length, payments, cashMovements, history, activeTrackingLinks, warrantyClaims: 1 }
  }, { timeout: 120_000, maxWait: 120_000 })
  console.log(JSON.stringify(result, null, 2))
}

main().catch(error => {
  // Prisma errors can embed connection details; only show our own validation messages.
  console.error(error instanceof Error && error.name === 'Error' ? error.message : 'No se pudo cargar el demo; la transacción fue revertida.')
  process.exitCode = 1
}).finally(() => prisma.$disconnect())
