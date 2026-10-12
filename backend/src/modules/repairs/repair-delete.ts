import type { Prisma } from '@prisma/client'
const deleteError = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode })

/** Existing finance writers lock/update this same row before committing money. */
export async function deleteRepairInTransaction(tx: Prisma.TransactionClient, businessId: string, repairId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Repair" WHERE "id" = ${repairId} AND "businessId" = ${businessId} FOR UPDATE`
  const repair = await tx.repair.findFirst({ where: { id: repairId, businessId }, include: { payments: true, parts: { include: { stockItem: true } }, inventoryMovements: { include: { stockItem: true } }, warrantyClaims: { include: { expenses: true } } } })
  if (!repair) throw deleteError(404, 'Reparación no encontrada')
  const conflict = () => deleteError(409, 'Hay relaciones compartidas o inconsistentes. No se eliminó ningún dato de la reparación.')
  if (repair.payments.some(row => row.businessId !== businessId)
    || repair.parts.some(row => row.stockItem.businessId !== businessId)
    || repair.inventoryMovements.some(row => row.businessId !== businessId || row.stockItem.businessId !== businessId)
    || repair.warrantyClaims.some(row => row.businessId !== businessId || row.expenses.some(expense => expense.businessId !== businessId))) throw conflict()

  // Older receipts and warranty expenses may link a cash row without repairId.
  const explicitIds = [repair.initialCostMovementId, repair.cancellationRefundMovementId,
    ...repair.payments.map(row => row.cashMovementId), ...repair.warrantyClaims.flatMap(row => row.expenses.map(expense => expense.cashMovementId))].filter((id): id is string => Boolean(id))
  const rows = await tx.cashMovement.findMany({ where: { OR: [{ repairId }, { id: { in: explicitIds } }] } })
  const ids = new Set(rows.map(row => row.id))
  if (explicitIds.some(id => !ids.has(id))) throw conflict()
  if (rows.some(row => row.businessId !== businessId || row.repairId && row.repairId !== repairId || row.origin === 'COMMERCE' || row.origin === 'EQUIPMENT' || row.commerceSaleId || row.relatedCommerceSaleId || row.resaleDeviceId)) throw conflict()
  const cashIds = [...ids]
  const shared = await Promise.all([
    tx.payment.count({ where: { cashMovementId: { in: cashIds }, repairId: { not: repairId } } }),
    tx.repair.count({ where: { initialCostMovementId: { in: cashIds }, id: { not: repairId } } }),
    tx.repair.count({ where: { cancellationRefundMovementId: { in: cashIds }, id: { not: repairId } } }),
    tx.warrantyClaimExpense.count({ where: { cashMovementId: { in: cashIds }, claim: { repairId: { not: repairId } } } }),
  ])
  if (shared.some(Boolean)) throw conflict()

  // Remove exclusive legacy inventory links without restoring stock or updating
  // shared StockItem rows. Commerce inventory is independent of repair deletion.
  // RESTRICT links are removed child first, entirely inside the same transaction.
  await tx.warrantyClaimExpense.deleteMany({ where: { businessId, claim: { repairId, businessId } } })
  await tx.warrantyClaim.deleteMany({ where: { repairId, businessId } })
  await tx.payment.deleteMany({ where: { repairId, businessId } })
  await tx.inventoryMovement.deleteMany({ where: { repairId, businessId } })
  await tx.repairPart.deleteMany({ where: { repairId, repair: { businessId } } })
  await tx.repairStatusHistory.deleteMany({ where: { repairId, repair: { businessId } } })
  await tx.repair.delete({ where: { id: repairId, businessId } })
  // Existing schema associates refunds/compensations by repairId or explicit links.
  // All cash summaries aggregate these rows; no reversal or compensation is created.
  await tx.cashMovement.deleteMany({ where: { id: { in: cashIds }, businessId } })
}
