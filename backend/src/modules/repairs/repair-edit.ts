import { PaymentMethod, type Prisma } from '@prisma/client'
import { z } from 'zod'
import type { AuthData } from '../../middlewares/auth'
import { canViewRepairFinancials } from './repair-response'
import { advanceCorrectionNote, correctInitialRepairAdvance, correctInitialRepairCost, initialCostCorrectionNote, repairMoney, RepairFinanceError, validPaymentsTotal } from './repair-finance'

export const editRepairSchema = z.object({
  clientId: z.string().min(1).optional(),
  deviceBrand: z.string().trim().min(1).optional(), deviceModel: z.string().trim().min(1).optional(),
  imei: z.string().trim().nullable().optional(), color: z.string().trim().nullable().optional(),
  issue: z.string().trim().min(2).optional(), diagnosis: z.string().trim().nullable().optional(), notes: z.string().trim().nullable().optional(),
  estimatedDeliveryDate: z.coerce.date().nullable().optional(),
  partsCost: repairMoney.optional(), partsCostMethod: z.nativeEnum(PaymentMethod).optional(),
  laborCharge: repairMoney.optional(), total: repairMoney.optional(),
  advanceAmount: repairMoney.optional(), advanceMethod: z.nativeEnum(PaymentMethod).optional(),
}).strict()

export type EditRepairInput = z.infer<typeof editRepairSchema>
const privateFields = ['partsCost', 'partsCostMethod', 'laborCharge', 'advanceAmount', 'advanceMethod'] as const

/** Called once inside the HTTP transaction. Every financial writer shares this Repair row lock. */
export async function editRepairInTransaction(tx: Prisma.TransactionClient, auth: AuthData, repairId: string, input: EditRepairInput) {
  if (!canViewRepairFinancials(auth) && privateFields.some(key => input[key] !== undefined)) {
    throw new RepairFinanceError(403, 'No tenés permisos para modificar costos, mano de obra o adelantos')
  }
  await tx.$queryRaw`SELECT "id" FROM "Repair" WHERE "id" = ${repairId} AND "businessId" = ${auth.businessId} FOR UPDATE`
  const current = await tx.repair.findFirst({ where: { id: repairId, businessId: auth.businessId }, include: { client: true, payments: true } })
  if (!current) throw new RepairFinanceError(404, 'Reparación no encontrada')
  const clientId = input.clientId ?? current.clientId
  const client = clientId === current.clientId ? current.client : await tx.client.findFirst({ where: { id: clientId, businessId: auth.businessId, deletedAt: null } })
  if (!client) throw new RepairFinanceError(400, 'El cliente seleccionado fue eliminado o no está disponible.')
  const total = input.total ?? current.total
  const advances = current.payments.filter(payment => payment.isAdvance && !payment.cancellationReview)
  if (input.advanceAmount !== undefined && advances.length > 1) throw new RepairFinanceError(409, 'Esta reparación tiene más de un adelanto registrado. Revisá los pagos antes de corregirlo.')
  const advance = advances[0]
  const advanceAmount = input.advanceAmount ?? advance?.amount ?? 0
  const advanceChanged = input.advanceAmount !== undefined && advanceAmount !== (advance?.amount ?? 0)
    || input.advanceMethod !== undefined && advanceAmount > 0 && input.advanceMethod !== advance?.method
  const costChanged = input.partsCost !== undefined && input.partsCost !== current.partsCost || input.partsCostMethod !== undefined
  if (current.status === 'CANCELLED' && (costChanged || advanceChanged || total !== current.total || input.laborCharge !== undefined && input.laborCharge !== current.laborCharge)) {
    throw new RepairFinanceError(409, 'Una reparación cancelada no admite cambios financieros: su liquidación tiene su propio flujo.')
  }
  const resultingPaid = advanceChanged
    ? validPaymentsTotal(current.payments.filter(payment => !payment.isAdvance)) + advanceAmount
    : Math.max(current.paid, validPaymentsTotal(current.payments))
  if (total < resultingPaid) throw new RepairFinanceError(400, 'El total al cliente no puede ser menor que el importe ya pagado.')
  const advanceMethod = input.advanceMethod ?? advance?.method
  if (advanceChanged && advanceAmount > 0 && !advanceMethod) throw new RepairFinanceError(400, 'Seleccioná el medio de pago del adelanto')
  if (input.partsCostMethod !== undefined && input.partsCost === undefined) throw new RepairFinanceError(400, 'Indicá el costo/gasto para cambiar su medio de pago')
  if (input.advanceMethod !== undefined && input.advanceAmount === undefined) throw new RepairFinanceError(400, 'Indicá el adelanto para cambiar su medio de pago')

  // Send only actual changes, including explicit null to clear optional fields. Historical laborCost stays intact.
  const data: Prisma.RepairUncheckedUpdateInput = {}
  const editable = ['clientId', 'deviceBrand', 'deviceModel', 'issue', 'laborCharge', 'total'] as const
  for (const key of editable) if (input[key] !== undefined && input[key] !== current[key]) Object.assign(data, { [key]: input[key] })
  for (const key of ['imei', 'color', 'diagnosis', 'notes'] as const) {
    if (input[key] === undefined) continue
    const value = key === 'imei' ? input[key]?.replace(/[\s-]/g, '') || null : input[key] || null
    if (value !== current[key]) data[key] = value
  }
  if (input.estimatedDeliveryDate !== undefined && (input.estimatedDeliveryDate?.getTime() ?? null) !== (current.estimatedDeliveryDate?.getTime() ?? null)) data.estimatedDeliveryDate = input.estimatedDeliveryDate
  if (Object.keys(data).length) await tx.repair.update({ where: { id: repairId, businessId: auth.businessId }, data })
  const note = (internalNote: string) => tx.repairStatusHistory.create({ data: { repairId, previousStatus: current.status, newStatus: current.status, changedByUserId: auth.userId, internalNote } })
  if (costChanged) {
    const { previousAmount } = await correctInitialRepairCost(tx, current, client.name, { amount: input.partsCost ?? current.partsCost, method: input.partsCostMethod })
    if (previousAmount !== input.partsCost) await note(initialCostCorrectionNote(previousAmount, input.partsCost!))
  }
  if (advanceChanged) {
    const { previousAmount } = await correctInitialRepairAdvance(tx, { ...current, clientId, total }, client.name, { amount: advanceAmount, method: advanceMethod })
    if (previousAmount !== advanceAmount) await note(advanceCorrectionNote(previousAmount, advanceAmount))
  }
}
