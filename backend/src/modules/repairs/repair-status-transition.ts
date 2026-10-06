import type { Prisma, Repair, RepairStatus } from '@prisma/client'
import { assertStatusChange, deliveryDates, statusError } from './repair-status'

type RepairStatusSnapshot = Pick<Repair, 'id' | 'businessId' | 'status' | 'deliveredAt' | 'warrantyEnabled' | 'warrantyDurationDays' | 'warrantyStartedAt' | 'warrantyExpiresAt' | 'trackingExpiresAt'>

/** Called within the transaction that reads the tenant-scoped repair. */
export async function claimRepairStatusTransition(
  tx: Prisma.TransactionClient,
  current: RepairStatusSnapshot,
  target: RepairStatus,
  messages: { publicMessage?: string; internalNote?: string },
  userId: string,
) {
  assertStatusChange(current.status, target)
  if (current.status === target) return
  const dates = deliveryDates(current, target)
  // PostgreSQL sólo concede la transición si el snapshot sigue vigente.
  const claimed = await tx.repair.updateMany({
    where: { id: current.id, businessId: current.businessId, status: current.status },
    data: { status: target, ...dates },
  })
  if (claimed.count !== 1) throw statusError(409, 'El estado de la reparación cambió mientras se procesaba la solicitud. Actualizá la reparación e intentá nuevamente.', 'STATUS_CONFLICT')
  // Historial y estado comparten la transacción: un fallo aquí revierte también el update.
  await tx.repairStatusHistory.create({ data: { repairId: current.id, previousStatus: current.status, newStatus: target, publicMessage: messages.publicMessage || null, internalNote: messages.internalNote || null, changedByUserId: userId } })
}
