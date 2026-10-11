import { PaymentMethod, type Prisma } from '@prisma/client'
import { z } from 'zod'

// Amounts use the same whole-peso Int representation as Repair and Payment.
export const repairMoney = z.number().int().min(0).max(2_147_483_647)
export const repairInitialCostSchema = z.object({ amount: repairMoney, method: z.nativeEnum(PaymentMethod).optional() })
export const initialRepairFinanceSchema = z.object({
  partsCost: repairMoney.default(0),
  initialExpenseAmount: repairMoney.default(0),
  initialExpenseMethod: z.nativeEnum(PaymentMethod).optional(),
  expenseConfirmed: z.boolean().default(false),
  // El gasto inicial y el adelanto son dos movimientos distintos de Caja: cada uno tiene su
  // propio medio de pago. Un costo sin método informado se guarda con `method` en NULL y Caja
  // lo muestra como "Sin medio informado": nunca se inventa cómo se pagó.
  partsCostMethod: z.nativeEnum(PaymentMethod).optional(),
  laborCharge: repairMoney.default(0),
  total: repairMoney.default(0),
  advanceAmount: repairMoney.default(0),
  advanceMethod: z.nativeEnum(PaymentMethod).optional(),
})

/** Corrección del adelanto inicial: mismos límites que al crearlo, sin método cuando el monto es 0. */
export const repairAdvanceSchema = z.object({
  amount: repairMoney,
  method: z.nativeEnum(PaymentMethod).optional(),
}).superRefine((value, context) => {
  if (value.amount > 0 && !value.method) {
    context.addIssue({ code: 'custom', path: ['method'], message: 'Seleccioná el medio de pago del adelanto' })
  }
})

/** Must run in the transaction creating Repair. Cash cost is a mirror, not a second cost. */
export async function recordInitialRepairFinance(
  tx: Prisma.TransactionClient,
  repair: { id: string; businessId: string; number: number; clientId: string; partsCost: number; createdAt: Date },
  clientName: string,
  input: Pick<z.infer<typeof initialRepairFinanceSchema>, 'advanceAmount' | 'advanceMethod' | 'partsCostMethod'> & Partial<Pick<z.infer<typeof initialRepairFinanceSchema>, 'initialExpenseAmount' | 'initialExpenseMethod' | 'expenseConfirmed'>>,
  performedByUserId?: string,
) {
  const { id: repairId, businessId, number, clientId, createdAt } = repair
  let initialCostMovementId: string | undefined
  if ((input.initialExpenseAmount ?? 0) > 0) {
    if (!input.expenseConfirmed || !input.initialExpenseMethod) throw new RepairFinanceError(400, 'Confirmá la compra real y su medio de pago')
    // El gasto inicial guarda su propio medio de pago, independiente del adelanto. Sin método
    // informado el movimiento queda con `method` en NULL y Caja muestra "Sin medio informado".
    const movement = await tx.cashMovement.create({ data: {
      businessId, repairId, clientName, type: 'EXPENSE', origin: 'REPAIR',
      description: `Compra real repuestos reparación #${number}`, amount: input.initialExpenseAmount!, method: input.initialExpenseMethod, createdAt,
      repairFinanceKind: 'PURCHASE', performedByUserId,
    } })
    initialCostMovementId = movement.id
  }
  if (input.advanceAmount > 0) {
    if (!input.advanceMethod) throw new Error('El medio de pago del adelanto es obligatorio')
    // El ingreso se crea primero para poder vincularlo por ID: el pago y su movimiento de
    // caja quedan unidos desde el origen, sin depender del texto de la descripción.
    const movement = await tx.cashMovement.create({ data: {
      businessId, repairId, clientName, type: 'INCOME', origin: 'REPAIR',
      description: advanceDescription(number), amount: input.advanceAmount, method: input.advanceMethod, createdAt, repairFinanceKind: 'ADVANCE', performedByUserId,
    } })
    await tx.payment.create({ data: {
      businessId, repairId, clientId, amount: input.advanceAmount, method: input.advanceMethod,
      isAdvance: true, note: advanceDescription(number), createdAt, cashMovementId: movement.id,
    } })
  }
  if (initialCostMovementId || input.advanceAmount > 0) {
    await tx.repair.update({ where: { id: repairId, businessId }, data: { initialCostMovementId, paid: input.advanceAmount } })
  }
}

export class RepairFinanceError extends Error {
  constructor(public statusCode: number, message: string) { super(message) }
}

const advanceDescription = (number: number) => `Adelanto reparación #${number}`

/** Importes del historial interno: "Adelanto corregido de $20.000 a $30.000". */
export const advanceCorrectionNote = (previousAmount: number, amount: number) => {
  const pesos = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
  return `Adelanto corregido de $${pesos.format(previousAmount)} a $${pesos.format(amount)}`
}

export const initialCostCorrectionNote = (previousAmount: number, amount: number) => {
  const pesos = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
  return `Costo/gasto corregido de $${pesos.format(previousAmount)} a $${pesos.format(amount)}`
}

/**
 * Suma real de todos los pagos válidos de la reparación.
 *
 * `cancellationReview` queda fuera a propósito: esos cobros pertenecen a una reparación
 * cancelada y se contabilizan en su propia liquidación, nunca en el saldo de la orden.
 */
export const validPaymentsTotal = (payments: Array<{ amount: number; cancellationReview: boolean }>) =>
  payments.filter(payment => !payment.cancellationReview).reduce((sum, payment) => sum + payment.amount, 0)

/**
 * Localiza el CashMovement INCOME que corresponde al adelanto.
 *
 * Camino normal: el vínculo directo `Payment.cashMovementId`, que no depende de ningún texto.
 * Fallback: sólo para adelantos históricos creados antes de existir la relación. Busca por
 * descripción y, si encuentra más de un candidato, NO adivina: devuelve null y quien llama
 * avisa que hay que revisarlo a mano. Jamás borra ni modifica una caja que no pueda atribuir
 * con certeza al adelanto.
 */
async function findAdvanceMovement(
  tx: Prisma.TransactionClient,
  businessId: string,
  repairId: string,
  number: number,
  payment: { cashMovementId: string | null } | null,
) {
  if (payment?.cashMovementId) {
    const linked = await tx.cashMovement.findFirst({ where: { id: payment.cashMovementId, businessId } })
    if (linked) return { movement: linked, ambiguous: false }
  }
  const candidates = await tx.cashMovement.findMany({
    where: { businessId, repairId, type: 'INCOME', origin: 'REPAIR', description: advanceDescription(number) },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  if (candidates.length > 1) return { movement: null, ambiguous: true }
  return { movement: candidates[0] ?? null, ambiguous: false }
}

/** Registra un primer adelanto explícito; nunca modifica ni reconstruye cobros existentes. */
export async function correctInitialRepairAdvance(
  tx: Prisma.TransactionClient,
  repair: { id: string; businessId: string; number: number; clientId: string; total: number },
  clientName: string,
  input: { amount: number; method?: PaymentMethod },
  performedByUserId?: string,
) {
  const { id: repairId, businessId, number, clientId, total } = repair
  if (input.amount > total) throw new RepairFinanceError(400, 'El adelanto no puede superar el total al cliente')

  const payments = await tx.payment.findMany({ where: { repairId, businessId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
  const recorded = await tx.repair.findFirstOrThrow({ where: { id: repairId, businessId }, select: { paid: true } })
  if (recorded.paid !== validPaymentsTotal(payments)) throw new RepairFinanceError(409, 'Los pagos históricos necesitan conciliación explícita; no se modifica el saldo registrado.')
  const advances = payments.filter(payment => payment.isAdvance)
  if (advances.length > 1) throw new RepairFinanceError(409, 'Esta reparación tiene más de un adelanto registrado. Revisá los pagos antes de corregirlo.')
  const currentAdvance = advances[0] ?? null
  const previousAmount = currentAdvance?.amount ?? 0

  // Los pagos que no son adelanto no se tocan: la corrección sólo mueve el adelanto inicial.
  const otherTotal = validPaymentsTotal(payments.filter(payment => !payment.isAdvance))
  if (otherTotal + input.amount > total) {
    throw new RepairFinanceError(400, `El total pagado no puede superar el total de la reparación. Hay ${otherTotal} en otros pagos y el total es ${total}.`)
  }

  const description = advanceDescription(number)
  const { movement, ambiguous } = await findAdvanceMovement(tx, businessId, repairId, number, currentAdvance)
  // Con más de un ingreso homónimo no se puede saber cuál es el del adelanto: se frena.
  if (ambiguous) throw new RepairFinanceError(409, 'Esta reparación tiene varios ingresos de Caja que no se pueden distinguir del adelanto. Revisá la Caja antes de corregirlo.')

  if (currentAdvance || movement) throw new RepairFinanceError(409, 'Los pagos y sus movimientos se conservan. Usá la liquidación explícita; no se modifica ni reconstruye un cobro histórico.')
  if (input.amount > 0) {
    if (!input.method) throw new RepairFinanceError(400, 'Indicá el medio del cobro real')
    const created = await tx.cashMovement.create({ data: { businessId, repairId, clientName, type: 'INCOME', origin: 'REPAIR', description, amount: input.amount, method: input.method, repairFinanceKind: 'ADVANCE', performedByUserId } })
    await tx.payment.create({ data: { businessId, repairId, clientId, amount: input.amount, method: input.method, isAdvance: true, note: description, cashMovementId: created.id } })
  }

  const settled = await tx.payment.findMany({ where: { repairId, businessId } })
  const paid = validPaymentsTotal(settled)
  if (paid > total) throw new RepairFinanceError(400, 'El total pagado no puede superar el total de la reparación')
  await tx.repair.update({ where: { id: repairId, businessId }, data: { paid } })
  return { previousAmount, paid }
}
