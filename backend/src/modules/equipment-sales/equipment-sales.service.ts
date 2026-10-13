import { Prisma, type CashMovement, type EquipmentCashKind, type PaymentMethod, type ResaleDevice, type ResaleDeviceStatus } from '@prisma/client'
import { prisma } from '../../lib/prisma'

export class EquipmentSalesError extends Error {
  constructor(public readonly status: number, message: string) { super(message) }
}

export interface DeviceInput {
  brand: string
  model: string
  purchasePrice: number
  repairExpenses: number
  estimatedSalePrice: number
}
export interface DeviceCreateInput extends DeviceInput {
  status?: Exclude<ResaleDeviceStatus, 'SOLD'>
}
export interface DeviceEditInput extends DeviceInput {
  expectedVersion: number
  status: Exclude<ResaleDeviceStatus, 'SOLD'>
}
export interface DeviceSaleInput {
  expectedVersion: number
  actualSalePrice: number
  salePaymentMethod: PaymentMethod
  soldAt?: Date
}

export const serializeDevice = (device: ResaleDevice) => ({
  ...device,
  totalCost: device.purchasePrice + device.repairExpenses,
  estimatedProfit: device.estimatedSalePrice - device.purchasePrice - device.repairExpenses,
  realizedProfit: device.actualSalePrice !== null && device.saleCostBasis !== null ? device.actualSalePrice - device.saleCostBasis : null,
})

function validateCost(input: DeviceInput) {
  if (input.purchasePrice + input.repairExpenses > 2147483647) throw new EquipmentSalesError(400, 'El costo total supera el máximo permitido.')
}

// A cash entry records the delta at a particular device version. Previous entries are immutable.
async function recordCost(tx: Prisma.TransactionClient, device: ResaleDevice, amount: number, kind: EquipmentCashKind) {
  if (!amount) return
  const label = kind === 'PURCHASE' ? 'Compra' : kind === 'REPAIR' ? 'Gastos de reparación' : kind === 'PURCHASE_ADJUSTMENT' ? 'Ajuste de compra' : 'Ajuste de gastos de reparación'
  await tx.cashMovement.create({ data: {
    businessId: device.businessId, origin: 'EQUIPMENT', type: amount > 0 ? 'EXPENSE' : 'INCOME', amount: Math.abs(amount),
    description: `${label}${amount < 0 ? ' (compensación)' : ''} · ${device.brand} ${device.model}`,
    resaleDeviceId: device.id, resaleKind: kind, resaleVersion: device.version,
  } })
}

async function transaction<T>(action: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  try { return await prisma.$transaction(action, { timeout: 15000 }) }
  catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2002'].includes(error.code)) {
      throw new EquipmentSalesError(409, 'El equipo cambió mientras guardabas. Actualizá el listado antes de continuar.')
    }
    throw error
  }
}

// Removal holds the same row lock that edit/sale compare-and-swap updates acquire.
// This also blocks new cash foreign keys while permanent removal is in progress.
async function lockDevice(tx: Prisma.TransactionClient, businessId: string, id: string) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "ResaleDevice" WHERE "id" = ${id} AND "businessId" = ${businessId} FOR UPDATE`)
  const device = await tx.resaleDevice.findFirst({ where: { id, businessId } })
  if (!device) throw new EquipmentSalesError(404, 'Equipo no encontrado.')
  return device
}

const unsafeHistory = () => new EquipmentSalesError(409, 'El historial de caja del equipo es inconsistente. No se puede completar la operación.')

async function validateEquipmentMovements(tx: Prisma.TransactionClient, device: ResaleDevice, movements: CashMovement[]) {
  if (movements.some(row => row.businessId !== device.businessId || row.origin !== 'EQUIPMENT' || row.repairId !== null || row.commerceSaleId !== null || row.relatedCommerceSaleId !== null)) throw unsafeHistory()
  const ids = movements.map(row => row.id)
  if (!ids.length) return
  const [payments, repairs, warrantyExpenses] = await Promise.all([
    tx.payment.count({ where: { cashMovementId: { in: ids } } }),
    tx.repair.count({ where: { initialCostMovementId: { in: ids } } }),
    tx.warrantyClaimExpense.count({ where: { cashMovementId: { in: ids } } }),
  ])
  if (payments || repairs || warrantyExpenses) throw unsafeHistory()
}

export async function getDeviceDetails(businessId: string, id: string) {
  return prisma.$transaction(async tx => {
    const device = await tx.resaleDevice.findFirst({ where: { id, businessId } })
    if (!device) throw new EquipmentSalesError(404, 'Equipo no encontrado.')
    // Deliberately inspect every linked row: filtering by tenant would hide corrupt links.
    const movements = await tx.cashMovement.findMany({ where: { resaleDeviceId: id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
    await validateEquipmentMovements(tx, device, movements)
    return { device: serializeDevice(device), movements: movements.map(row => ({
      id: row.id, type: row.type, amount: row.amount, method: row.method,
      description: row.description, createdAt: row.createdAt, resaleKind: row.resaleKind, resaleVersion: row.resaleVersion,
    })) }
  }, { timeout: 15000, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
}

/** Kept transaction-scoped so callers can verify full rollback without production hooks. */
export async function deleteEquipmentInTransaction(tx: Prisma.TransactionClient, businessId: string, id: string, expectedVersion: number) {
  const device = await lockDevice(tx, businessId, id)
  if (device.version !== expectedVersion) throw new EquipmentSalesError(409, 'El equipo cambió. Actualizá el listado antes de eliminarlo.')
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "CashMovement" WHERE "resaleDeviceId" = ${id} ORDER BY "id" FOR UPDATE`)
  const movements = await tx.cashMovement.findMany({ where: { resaleDeviceId: id } })
  await validateEquipmentMovements(tx, device, movements)
  const deletedCash = await tx.cashMovement.deleteMany({ where: { id: { in: movements.map(row => row.id) }, resaleDeviceId: id, businessId } })
  if (deletedCash.count !== movements.length) throw unsafeHistory()
  const deletedDevice = await tx.resaleDevice.deleteMany({ where: { id, businessId, version: expectedVersion } })
  if (deletedDevice.count !== 1) throw new EquipmentSalesError(409, 'El equipo cambió. Actualizá el listado antes de eliminarlo.')
}

export async function deleteEquipment(businessId: string, id: string, expectedVersion: number) {
  try { await prisma.$transaction(tx => deleteEquipmentInTransaction(tx, businessId, id, expectedVersion), { timeout: 15000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }) }
  catch (error) {
    if (error instanceof EquipmentSalesError) throw error
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2003', 'P2025', 'P2034'].includes(error.code)) throw unsafeHistory()
    throw new EquipmentSalesError(500, 'No se pudo eliminar el equipo. Intentá nuevamente.')
  }
}

export async function createDevice(businessId: string, input: DeviceCreateInput) {
  validateCost(input)
  const { status, ...fields } = input
  return transaction(async tx => {
    // El estado se aplica en la misma transacción que los egresos: un equipo comprado roto nace en reparación.
    const device = await tx.resaleDevice.create({ data: { businessId, ...fields, ...(status && { status }) } })
    await recordCost(tx, device, device.purchasePrice, 'PURCHASE')
    await recordCost(tx, device, device.repairExpenses, 'REPAIR')
    return serializeDevice(device)
  })
}

export async function editDevice(businessId: string, id: string, input: DeviceEditInput) {
  validateCost(input)
  return transaction(async tx => {
    const current = await tx.resaleDevice.findFirst({ where: { id, businessId } })
    if (!current) throw new EquipmentSalesError(404, 'Equipo no encontrado.')
    if (current.status === 'SOLD' || current.version !== input.expectedVersion) throw new EquipmentSalesError(409, 'El equipo fue modificado o vendido. Cerrá el formulario y actualizá el listado.')
    const { expectedVersion, ...data } = input
    const changed = await tx.resaleDevice.updateMany({
      where: { id, businessId, version: expectedVersion, status: { not: 'SOLD' } },
      data: { ...data, version: { increment: 1 } },
    })
    if (changed.count !== 1) throw new EquipmentSalesError(409, 'El equipo cambió mientras guardabas. Actualizá el listado.')
    const device = await tx.resaleDevice.findFirstOrThrow({ where: { id, businessId } })
    await recordCost(tx, device, device.purchasePrice - current.purchasePrice, 'PURCHASE_ADJUSTMENT')
    await recordCost(tx, device, device.repairExpenses - current.repairExpenses, 'REPAIR_ADJUSTMENT')
    return serializeDevice(device)
  })
}

export async function sellDevice(businessId: string, id: string, input: DeviceSaleInput) {
  return transaction(async tx => {
    const current = await tx.resaleDevice.findFirst({ where: { id, businessId } })
    if (!current) throw new EquipmentSalesError(404, 'Equipo no encontrado.')
    if (current.status !== 'READY_FOR_SALE' || current.version !== input.expectedVersion) throw new EquipmentSalesError(409, 'El equipo cambió o ya no está listo para vender. Actualizá el listado.')
    const recordedAt = new Date()
    const effectiveSoldAt = input.soldAt ?? recordedAt
    if (!Number.isFinite(effectiveSoldAt.getTime()) || effectiveSoldAt < current.createdAt || effectiveSoldAt > recordedAt) {
      throw new EquipmentSalesError(400, 'La fecha de venta debe estar entre la compra del equipo y el momento actual.')
    }
    const { expectedVersion, ...sale } = input
    const saleCostBasis = current.purchasePrice + current.repairExpenses
    const changed = await tx.resaleDevice.updateMany({
      where: { id, businessId, status: 'READY_FOR_SALE', version: expectedVersion },
      data: { ...sale, soldAt: effectiveSoldAt, saleCostBasis, status: 'SOLD', version: { increment: 1 } },
    })
    if (changed.count !== 1) throw new EquipmentSalesError(409, 'Otro usuario modificó o vendió este equipo. Actualizá el listado.')
    await tx.cashMovement.create({ data: {
      businessId, type: 'INCOME', origin: 'EQUIPMENT', amount: input.actualSalePrice, method: input.salePaymentMethod,
      // soldAt is the effective sale date; cash records when the operation was registered.
      description: `Venta de equipo · ${current.brand} ${current.model}`, createdAt: recordedAt,
      resaleDeviceId: id, resaleKind: 'SALE', resaleVersion: expectedVersion + 1,
    } })
    return serializeDevice(await tx.resaleDevice.findFirstOrThrow({ where: { id, businessId } }))
  })
}

export async function listDevices(businessId: string, input: { page: number; pageSize: number; search?: string; status?: ResaleDeviceStatus }) {
  const where: Prisma.ResaleDeviceWhereInput = {
    businessId, status: input.status,
    ...(input.search ? { OR: [{ brand: { contains: input.search, mode: 'insensitive' } }, { model: { contains: input.search, mode: 'insensitive' } }] } : {}),
  }
  const [items, total] = await prisma.$transaction([
    prisma.resaleDevice.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (input.page - 1) * input.pageSize, take: input.pageSize }),
    prisma.resaleDevice.count({ where }),
  ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
  return { items: items.map(serializeDevice), total, page: input.page, pageSize: input.pageSize, pages: Math.max(1, Math.ceil(total / input.pageSize)) }
}

/** Rango temporal a aplicar a ventas y movimientos de caja. */
export type EquipmentPeriodRange = { gte: Date; lt: Date }

/**
 * Resumen de reventa acotado a un período.
 *
 * La lógica financiera es exactamente la de siempre —mismas reglas de costos, ajustes y
 * ganancias reales—; lo único nuevo es el rango temporal, aplicado a las ventas y a los
 * movimientos de caja. Los conteos de inventario (en proceso, listos para vender) son
 * estado actual, no hechos del período, y por eso no se filtran.
 */
export async function deviceSummary(businessId: string, range?: EquipmentPeriodRange) {
  const createdAt = range ? { createdAt: range } : {}
  const stateQuery = prisma.resaleDevice.groupBy({ by: ['status'], where: { businessId }, _count: { _all: true } })
  const soldQuery = prisma.resaleDevice.aggregate({ where: { businessId, status: 'SOLD', ...createdAt }, _sum: { actualSalePrice: true, saleCostBasis: true }, _count: { _all: true } })
  const costQuery = prisma.cashMovement.groupBy({ by: ['resaleKind', 'type'], where: { businessId, origin: 'EQUIPMENT', resaleDeviceId: { not: null }, resaleKind: { in: ['PURCHASE', 'REPAIR', 'PURCHASE_ADJUSTMENT', 'REPAIR_ADJUSTMENT'] }, ...createdAt }, _sum: { amount: true } })
  const [states, sold, costs] = await prisma.$transaction([stateQuery, soldQuery, costQuery], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
  const count = (state: ResaleDeviceStatus) => states.find(row => row.status === state)?._count._all ?? 0
  const net = (kinds: EquipmentCashKind[]) => costs.reduce((sum, row) => sum + (row.resaleKind && kinds.includes(row.resaleKind) ? (row._sum.amount ?? 0) * (row.type === 'EXPENSE' ? 1 : -1) : 0), 0)
  const purchaseInvestment = net(['PURCHASE', 'PURCHASE_ADJUSTMENT'])
  const repairInvestment = net(['REPAIR', 'REPAIR_ADJUSTMENT'])
  return {
    inProcess: count('PURCHASED') + count('REPAIRING'), readyForSale: count('READY_FOR_SALE'),
    totalInvested: purchaseInvestment + repairInvestment, purchaseInvestment, repairInvestment,
    salesCount: sold._count._all, salesRevenue: sold._sum.actualSalePrice ?? 0,
    realizedProfit: (sold._sum.actualSalePrice ?? 0) - (sold._sum.saleCostBasis ?? 0),
  }
}
