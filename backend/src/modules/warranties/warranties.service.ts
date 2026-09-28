import { Prisma, type PaymentMethod, type WarrantyClaimStatus } from '@prisma/client'
import { prisma } from '../../lib/prisma'

export class WarrantyError extends Error {
  constructor(public statusCode: number, message: string) { super(message) }
}
export const claimInclude = { expenses: { orderBy: { createdAt: 'asc' as const }, include: { cashMovement: true } } }
const day = 86_400_000

// All claim mutations take the parent repair's lock first, including delivery and expenses.
// Retrying the complete transaction also handles concurrent idempotency keys safely.
async function transaction<T>(action: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await prisma.$transaction(action, { isolationLevel: 'Serializable', timeout: 15000 }) }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2002'].includes(error.code)) {
        if (attempt < 3) continue
        throw new WarrantyError(409, 'El reclamo cambió mientras guardabas. Actualizá e intentá nuevamente.')
      }
      throw error
    }
  }
}
async function lockRepair(tx: Prisma.TransactionClient, businessId: string, id: string) {
  const updated = await tx.repair.updateMany({ where: { id, businessId }, data: { updatedAt: new Date() } })
  if (!updated.count) throw new WarrantyError(404, 'Garantía no encontrada')
  return tx.repair.findFirstOrThrow({ where: { id, businessId }, include: { client: true } })
}
async function lockedClaim(tx: Prisma.TransactionClient, businessId: string, id: string) {
  const found = await tx.warrantyClaim.findFirst({ where: { id, businessId } })
  if (!found) throw new WarrantyError(404, 'Reclamo no encontrado')
  const repair = await lockRepair(tx, businessId, found.repairId)
  const claim = await tx.warrantyClaim.findFirstOrThrow({ where: { id, businessId }, include: claimInclude })
  return { claim, repair }
}
export function createClaim(businessId: string, repairId: string, description: string) {
  return transaction(async tx => {
    const repair = await lockRepair(tx, businessId, repairId)
    if (!repair.warrantyEnabled || repair.warrantyDeletedAt) throw new WarrantyError(404, 'Garantía no encontrada')
    if (!repair.warrantyStartedAt || !repair.warrantyExpiresAt) throw new WarrantyError(409, 'La garantía comienza cuando la reparación se entrega')
    if (repair.warrantyExpiresAt < new Date()) throw new WarrantyError(409, 'La garantía está vencida')
    return tx.warrantyClaim.create({ data: {
      businessId, repairId, description,
      coveredWarrantyStartedAt: repair.warrantyStartedAt, coveredWarrantyExpiresAt: repair.warrantyExpiresAt,
      coveredWarrantyDurationDays: repair.warrantyDurationDays, coveredWarrantyConditions: repair.warrantyConditions,
    }, include: claimInclude })
  })
}
export function updateClaim(businessId: string, id: string, input: { status: WarrantyClaimStatus; resolution?: string }) {
  return transaction(async tx => {
    const { claim } = await lockedClaim(tx, businessId, id)
    if (claim.deliveredAt) {
      if (input.status === claim.status && (input.resolution === undefined || input.resolution === claim.resolution)) return claim
      throw new WarrantyError(409, 'El reclamo ya fue entregado; su resolución forma parte del historial.')
    }
    const closed = input.status === 'RESOLVED' || input.status === 'REJECTED'
    return tx.warrantyClaim.update({ where: { id }, data: {
      status: input.status, ...(input.resolution !== undefined && { resolution: input.resolution || null }),
      resolvedAt: closed ? claim.resolvedAt ?? new Date() : null,
    }, include: claimInclude })
  })
}
export function addClaimExpense(businessId: string, id: string, input: { concept: string; amount: number; method: PaymentMethod; idempotencyKey: string }) {
  return transaction(async tx => {
    const { claim, repair } = await lockedClaim(tx, businessId, id)
    const previous = await tx.warrantyClaimExpense.findUnique({ where: { businessId_idempotencyKey: { businessId, idempotencyKey: input.idempotencyKey } }, include: { cashMovement: true } })
    if (previous) {
      if (previous.claimId !== id || previous.concept !== input.concept || previous.cashMovement.amount !== input.amount || previous.cashMovement.method !== input.method) {
        throw new WarrantyError(409, 'Esta operación ya fue registrada con otros datos.')
      }
      return previous
    }
    if (claim.status === 'REJECTED' || claim.deliveredAt || repair.cancelledAt) throw new WarrantyError(409, 'No se pueden agregar gastos a este reclamo.')
    const cashMovement = await tx.cashMovement.create({ data: {
      businessId, repairId: repair.id, type: 'EXPENSE', origin: 'REPAIR', amount: input.amount, method: input.method,
      description: `Garantía reparación #${repair.number} · ${input.concept}`, clientName: repair.client.name,
    } })
    return tx.warrantyClaimExpense.create({ data: { businessId, claimId: id, concept: input.concept, idempotencyKey: input.idempotencyKey, cashMovementId: cashMovement.id }, include: { cashMovement: true } })
  })
}
export function deliverClaim(businessId: string, id: string, durationDays: number) {
  return transaction(async tx => {
    const { claim, repair } = await lockedClaim(tx, businessId, id)
    if (claim.deliveredAt) {
      if (claim.newWarrantyDurationDays !== durationDays) throw new WarrantyError(409, 'La entrega ya se registró con otra duración.')
      return claim
    }
    if (claim.status !== 'RESOLVED' || repair.cancelledAt || repair.warrantyDeletedAt) throw new WarrantyError(409, 'Resolvé el reclamo antes de registrar una nueva entrega.')
    if (claim.coveredWarrantyStartedAt?.getTime() !== repair.warrantyStartedAt?.getTime()) throw new WarrantyError(409, 'Este reclamo pertenece a una garantía anterior. Ya existe una nueva entrega.')
    const deliveredAt = new Date()
    const startedAt = durationDays > 0 ? deliveredAt : null
    const expiresAt = durationDays > 0 ? new Date(deliveredAt.getTime() + durationDays * day) : null
    const delivered = await tx.warrantyClaim.update({ where: { id }, data: {
      deliveredAt, newWarrantyDurationDays: durationDays, newWarrantyStartedAt: startedAt, newWarrantyExpiresAt: expiresAt,
    }, include: claimInclude })
    // Repair exposes the current coverage; each claim preserves the coverage it claimed against.
    // Keep the original repair delivery date and all customer payments unchanged.
    await tx.repair.update({ where: { id: repair.id }, data: {
      warrantyEnabled: durationDays > 0, warrantyDurationDays: durationDays || null,
      warrantyStartedAt: startedAt, warrantyExpiresAt: expiresAt,
    } })
    return delivered
  })
}

export function editWarranty(businessId: string, id: string, input: { durationDays: number; conditions?: string }) {
  return transaction(async tx => {
    const repair = await lockRepair(tx, businessId, id)
    if (!repair.warrantyEnabled || repair.warrantyDeletedAt) throw new WarrantyError(404, 'Garantía no encontrada')
    return tx.repair.update({ where: { id }, data: {
      warrantyDurationDays: input.durationDays, warrantyConditions: input.conditions || null,
      warrantyExpiresAt: repair.warrantyStartedAt ? new Date(repair.warrantyStartedAt.getTime() + input.durationDays * day) : null,
    } })
  })
}
export function removeWarranty(businessId: string, id: string) {
  return transaction(async tx => {
    const repair = await lockRepair(tx, businessId, id)
    if (repair.warrantyDeletedAt) throw new WarrantyError(404, 'Garantía no encontrada')
    await tx.repair.update({ where: { id }, data: { warrantyEnabled: false, warrantyDeletedAt: new Date() } })
    return { success: true }
  })
}
