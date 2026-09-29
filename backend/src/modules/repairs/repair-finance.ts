import { PaymentMethod, type Prisma } from '@prisma/client'
import { z } from 'zod'

// Amounts use the same whole-peso Int representation as Repair and Payment.
export const repairMoney = z.number().int().min(0).max(2_147_483_647)
export const initialRepairFinanceSchema = z.object({
  partsCost: repairMoney.default(0),
  laborCharge: repairMoney.default(0),
  total: repairMoney.default(0),
  advanceAmount: repairMoney.default(0),
  advanceMethod: z.nativeEnum(PaymentMethod).optional(),
})

/** Must run in the transaction creating Repair. Cash cost is a mirror, not a second cost. */
export async function recordInitialRepairFinance(
  tx: Prisma.TransactionClient,
  repair: { id: string; businessId: string; number: number; clientId: string; partsCost: number; createdAt: Date },
  clientName: string,
  input: Pick<z.infer<typeof initialRepairFinanceSchema>, 'advanceAmount' | 'advanceMethod'>,
) {
  const { id: repairId, businessId, number, clientId, createdAt } = repair
  let initialCostMovementId: string | undefined
  if (repair.partsCost > 0) {
    const movement = await tx.cashMovement.create({ data: {
      businessId, repairId, clientName, type: 'EXPENSE', origin: 'REPAIR',
      description: `Costo inicial reparación #${number}`, amount: repair.partsCost, createdAt,
    } })
    initialCostMovementId = movement.id
  }
  if (input.advanceAmount > 0) {
    if (!input.advanceMethod) throw new Error('El medio de pago del adelanto es obligatorio')
    await tx.payment.create({ data: {
      businessId, repairId, clientId, amount: input.advanceAmount, method: input.advanceMethod,
      isAdvance: true, note: `Adelanto reparación #${number}`, createdAt,
    } })
    await tx.cashMovement.create({ data: {
      businessId, repairId, clientName, type: 'INCOME', origin: 'REPAIR',
      description: `Adelanto reparación #${number}`, amount: input.advanceAmount, method: input.advanceMethod, createdAt,
    } })
  }
  if (initialCostMovementId || input.advanceAmount > 0) {
    await tx.repair.update({ where: { id: repairId, businessId }, data: { initialCostMovementId, paid: input.advanceAmount } })
  }
}
