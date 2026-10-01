import { CashMovementType, Prisma, type CashMovement } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import type { CashPeriod } from './cash-period'
import { cashPeriodWhere } from './cash-period'

/**
 * Un movimiento tal como lo consume la lista expandida de un grupo.
 * `createdAt` viaja como ISO string: es la misma convención que usa el resto de la API.
 */
export interface GroupedMovement {
  id: string
  type: CashMovement['type']
  description: string
  amount: number
  method: CashMovement['method']
  createdAt: string
  repairId: string | null
  clientName: string | null
  origin: CashMovement['origin']
}

export interface RepairCashGroup {
  repairId: string
  repairNumber: number
  clientName: string
  deviceBrand: string
  deviceModel: string
  income: number
  expense: number
  net: number
  movementCount: number
  lastMovementAt: string
  movements: GroupedMovement[]
}

/**
 * Movimientos de reparación que no pertenecen a ninguna reparación (cargas manuales con
 * origin = REPAIR). Se devuelven aparte y el frontend los muestra como un grupo propio:
 * nunca se asocian a una reparación ni se agrupan por texto de descripción.
 */
export interface LooseRepairMovements {
  income: number
  expense: number
  net: number
  movementCount: number
  lastMovementAt: string
  movements: GroupedMovement[]
}

const movementColumns = {
  id: true, type: true, description: true, amount: true, method: true,
  createdAt: true, repairId: true, clientName: true, origin: true,
} as const

const toGrouped = (movement: {
  id: string; type: CashMovement['type']; description: string; amount: number
  method: CashMovement['method']; createdAt: Date; repairId: string | null
  clientName: string | null; origin: CashMovement['origin']
}): GroupedMovement => ({
  id: movement.id,
  type: movement.type,
  description: movement.description,
  amount: movement.amount,
  method: movement.method,
  createdAt: movement.createdAt.toISOString(),
  repairId: movement.repairId,
  clientName: movement.clientName,
  origin: movement.origin,
})

/**
 * Totales por reparación para un negocio, con la fecha del último movimiento de cada una.
 *
 * Una sola consulta agregada: no se recorre reparación por reparación (nada de N+1). El
 * agrupamiento es por `repairId`, jamás por descripción, y sólo mira el período elegido.
 */
async function repairTotals(businessId: string, createdAt: Prisma.CashMovementWhereInput['createdAt']) {
  const rows = await prisma.cashMovement.groupBy({
    by: ['repairId', 'type'],
    where: { businessId, origin: 'REPAIR', repairId: { not: null }, createdAt },
    _sum: { amount: true },
    _count: { _all: true },
    _max: { createdAt: true },
  })
  const totals = new Map<string, { income: number; expense: number; movementCount: number; lastMovementAt: Date }>()
  // Época como base: cualquier fecha real la supera, así el máximo siempre es el último movimiento.
  const epoch = new Date(0)
  for (const row of rows) {
    const repairId = row.repairId
    if (!repairId) continue
    const current = totals.get(repairId) ?? { income: 0, expense: 0, movementCount: 0, lastMovementAt: epoch }
    const amount = row._sum.amount ?? 0
    if (row.type === CashMovementType.INCOME) current.income += amount
    else current.expense += amount
    current.movementCount += row._count._all
    // `_max` entrega la fecha más reciente del subconjunto agregado.
    const latest = row._max.createdAt as Date | null
    if (latest && latest > current.lastMovementAt) current.lastMovementAt = latest
    totals.set(repairId, current)
  }
  return totals
}

/**
 * Caja de reparaciones agrupada por reparación, con la paginación por grupos.
 *
 * La página se corta sobre reparaciones completas, nunca sobre movimientos sueltos: así una
 * reparación no puede aparecer partida entre dos páginas ni con totales incompletos. Los
 * grupos se ordenan por la fecha de su movimiento más reciente, de modo que una reparación
 * retomada vuelve arriba conservando juntos todos sus movimientos.
 *
 * Todos los totales y el detalle salen del período elegido: una reparación sigue siendo UN
 * grupo, pero sólo con los movimientos que caen dentro del rango, y sus cifras son las de ese
 * rango. Un movimiento anterior al período no infla ni aparece en el grupo.
 */
export async function repairCashGroups(businessId: string, page: number, pageSize: number, period: CashPeriod = 'TODAY', now = new Date()) {
  const createdAt = cashPeriodWhere(period, now)
  const totals = await repairTotals(businessId, createdAt)
  // Orden por última actividad y, a igualdad, por cantidad de movimientos como desempate estable.
  const ordered = [...totals.entries()].sort(([, a], [, b]) =>
    b.lastMovementAt.getTime() - a.lastMovementAt.getTime() || b.movementCount - a.movementCount)

  const total = ordered.length
  const start = (page - 1) * pageSize
  const pageEntries = ordered.slice(start, start + pageSize)
  const pageIds = pageEntries.map(([repairId]) => repairId)

  // Cabecera y movimientos de la página en dos consultas: no hay una consulta por reparación.
  const [repairs, movements] = await prisma.$transaction([
    prisma.repair.findMany({ where: { id: { in: pageIds }, businessId }, include: { client: { select: { name: true } } } }),
    prisma.cashMovement.findMany({
      where: { businessId, origin: 'REPAIR', repairId: { in: pageIds }, createdAt },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: movementColumns,
    }),
  ])
  const repairById = new Map(repairs.map(repair => [repair.id, repair]))
  const byRepair = new Map<string, GroupedMovement[]>(pageIds.map(id => [id, []]))
  for (const movement of movements) {
    if (!movement.repairId) continue
    byRepair.get(movement.repairId)?.push(toGrouped(movement))
  }

  const items: RepairCashGroup[] = pageEntries.map(([repairId, aggregate]) => {
    const repair = repairById.get(repairId)
    return {
      repairId,
      // Una reparación borrada con movimientos sueltos no se pierde: conserva su grupo.
      repairNumber: repair?.number ?? 0,
      clientName: repair?.client.name ?? 'Cliente eliminado',
      deviceBrand: repair?.deviceBrand ?? '',
      deviceModel: repair?.deviceModel ?? '',
      income: aggregate.income,
      expense: aggregate.expense,
      net: aggregate.income - aggregate.expense,
      movementCount: aggregate.movementCount,
      lastMovementAt: aggregate.lastMovementAt.toISOString(),
      movements: byRepair.get(repairId) ?? [],
    }
  })
  return { items, total }
}

/** Un movimiento "manual" de una caja es el que no tiene ese vínculo: se cargó a mano y no
 * pertenece a una reparación, un equipo ni una venta. Nunca se deduce del texto de la
 * descripción: sólo de los campos que lo atan a una entidad real.
 */
const linkField: Record<string, 'repairId' | 'resaleDeviceId' | 'commerceSaleId'> = {
  REPAIR: 'repairId',
  EQUIPMENT: 'resaleDeviceId',
  COMMERCE: 'commerceSaleId',
}

/**
 * Condición de "movimiento manual" para una caja con entidad.
 *
 * Caja General no tiene entidad: `undefined` cae en `NO_LINK`, así que sus movimientos —que
 * nunca llevan vínculo— van todos a "Otros movimientos" y la tabla principal queda vacía.
 */
const manualFor = (origin: string | undefined) => {
  const field = origin ? linkField[origin] : undefined
  if (!field) return null
  if (field === 'repairId') return { repairId: null }
  if (field === 'resaleDeviceId') return { resaleDeviceId: null, commerceSaleId: null, relatedCommerceSaleId: null }
  return { commerceSaleId: null, relatedCommerceSaleId: null }
}

/** Columnas que necesita la tabla secundaria de movimientos manuales. */
export const looseColumns = { id: true, type: true, description: true, amount: true, method: true, createdAt: true, repairId: true, clientName: true, origin: true } as const

type LooseRow = {
  id: string; type: CashMovementType; description: string; amount: number
  method: CashMovement['method']; createdAt: Date; repairId: string | null
  clientName: string | null; origin: CashMovement['origin']
}

/** Bloque de movimientos manuales con sus totales, listo para la tabla secundaria. */
export const toLooseBlock = (movements: LooseRow[]): LooseRepairMovements => {
  const income = movements.filter(movement => movement.type === CashMovementType.INCOME).reduce((sum, movement) => sum + movement.amount, 0)
  const expense = movements.filter(movement => movement.type === CashMovementType.EXPENSE).reduce((sum, movement) => sum + movement.amount, 0)
  return { income, expense, net: income - expense, movementCount: movements.length, lastMovementAt: movements[0].createdAt.toISOString(), movements: movements.map(toGrouped) }
}

/** Bloque vacío: la tabla secundaria siempre existe, aunque no haya nada que mostrar. */
export const emptyLoose: LooseRepairMovements = { income: 0, expense: 0, net: 0, movementCount: 0, lastMovementAt: '', movements: [] }

/** Caja General: un movimiento es manual si NO está vinculado a ninguna entidad. */
const NO_LINK = { repairId: null, resaleDeviceId: null, commerceSaleId: null, relatedCommerceSaleId: null }

/** Condición para quedarse con lo VINCULADO al módulo (tabla principal). */
export const linkedWhereFor = (origin: string | undefined): Prisma.CashMovementWhereInput =>
  ({ NOT: manualFor(origin) ?? NO_LINK }) as Prisma.CashMovementWhereInput

/** Condición para quedarse con los movimientos MANUALES (tabla secundaria). */
export const looseWhereFor = (origin: string | undefined): Prisma.CashMovementWhereInput =>
  (manualFor(origin) ?? NO_LINK) as Prisma.CashMovementWhereInput

/**
 * Movimientos manuales de una caja: los que no están vinculados a una reparación, un equipo
 * ni una venta. Van en su propia tabla y nunca se cuelgan de la agrupación principal.
 *
 * Devuelve SIEMPRE un bloque, incluso vacío: la tabla secundaria existe en todas las cajas
 * para que el frontend pueda pintar su empty state sin tratar el `null` como un caso aparte.
 */
export async function looseCashMovements(businessId: string, origin: string | undefined, period: CashPeriod = 'TODAY', now = new Date()): Promise<LooseRepairMovements> {
  const movements = await prisma.cashMovement.findMany({
    where: { businessId, ...(origin ? { origin: origin as CashMovement['origin'] } : {}), ...looseWhereFor(origin), createdAt: cashPeriodWhere(period, now) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: movementColumns,
  })
  return movements.length ? toLooseBlock(movements) : emptyLoose
}
