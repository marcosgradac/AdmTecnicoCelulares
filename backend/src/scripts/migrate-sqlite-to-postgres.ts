import 'dotenv/config'
import {
  CashMovementType,
  PaymentMethod,
  PrismaClient as PostgresClient,
  RepairStatus,
  UserRole,
} from '@prisma/client'
import {
  PrismaClient as SqliteClient,
  type Business as SourceBusiness,
  type CashMovement as SourceCashMovement,
  type Client as SourceClient,
  type Payment as SourcePayment,
  type Repair as SourceRepair,
  type RepairPart as SourceRepairPart,
  type StockItem as SourceStockItem,
  type User as SourceUser,
} from '../../generated/sqlite-client'

const dryRun = process.argv.includes('--dry-run')
const sqliteUrl = process.env.SQLITE_DATABASE_URL ?? 'file:../dev.db'
const postgresUrl = process.env.DATABASE_URL ?? ''

if (!dryRun && !/^postgres(ql)?:\/\//i.test(postgresUrl)) {
  throw new Error('DATABASE_URL debe apuntar a PostgreSQL para ejecutar la importación.')
}

const source = new SqliteClient({ datasourceUrl: sqliteUrl })
const target = dryRun ? null : new PostgresClient({ datasourceUrl: postgresUrl })

interface SourceData {
  businesses: SourceBusiness[]
  users: SourceUser[]
  clients: SourceClient[]
  repairs: SourceRepair[]
  stockItems: SourceStockItem[]
  payments: SourcePayment[]
  cashMovements: SourceCashMovement[]
  repairParts: SourceRepairPart[]
}

async function readSource() {
  const [businesses, users, clients, repairs, stockItems, payments, cashMovements, repairParts] =
    await Promise.all([
      source.business.findMany({ orderBy: { id: 'asc' } }),
      source.user.findMany({ orderBy: { id: 'asc' } }),
      source.client.findMany({ orderBy: { id: 'asc' } }),
      source.repair.findMany({ orderBy: { id: 'asc' } }),
      source.stockItem.findMany({ orderBy: { id: 'asc' } }),
      source.payment.findMany({ orderBy: { id: 'asc' } }),
      source.cashMovement.findMany({ orderBy: { id: 'asc' } }),
      source.repairPart.findMany({ orderBy: { id: 'asc' } }),
    ])

  return { businesses, users, clients, repairs, stockItems, payments, cashMovements, repairParts }
}

function validate(data: SourceData) {
  const errors: string[] = []
  const businesses = new Set(data.businesses.map((row: SourceBusiness) => row.id))
  const clients = new Map(data.clients.map((row: SourceClient) => [row.id, row]))
  const repairs = new Map(data.repairs.map((row: SourceRepair) => [row.id, row]))
  const stockItems = new Map(data.stockItems.map((row: SourceStockItem) => [row.id, row]))

  for (const row of data.users) {
    if (!businesses.has(row.businessId)) errors.push(`User ${row.id}: businessId huérfano`)
  }
  for (const row of data.clients) {
    if (!businesses.has(row.businessId)) errors.push(`Client ${row.id}: businessId huérfano`)
  }
  for (const row of data.repairs) {
    const client = clients.get(row.clientId)
    if (!businesses.has(row.businessId)) errors.push(`Repair ${row.id}: businessId huérfano`)
    if (!client) errors.push(`Repair ${row.id}: clientId huérfano`)
    else if (client.businessId !== row.businessId) errors.push(`Repair ${row.id}: cliente de otro negocio`)
  }
  for (const row of data.stockItems) {
    if (!businesses.has(row.businessId)) errors.push(`StockItem ${row.id}: businessId huérfano`)
  }
  for (const row of data.payments) {
    const repair = repairs.get(row.repairId)
    const client = clients.get(row.clientId)
    if (!businesses.has(row.businessId)) errors.push(`Payment ${row.id}: businessId huérfano`)
    if (!repair) errors.push(`Payment ${row.id}: repairId huérfano`)
    if (!client) errors.push(`Payment ${row.id}: clientId huérfano`)
    if (repair && repair.businessId !== row.businessId) errors.push(`Payment ${row.id}: reparación de otro negocio`)
    if (client && client.businessId !== row.businessId) errors.push(`Payment ${row.id}: cliente de otro negocio`)
    if (repair && repair.clientId !== row.clientId) errors.push(`Payment ${row.id}: cliente no coincide con reparación`)
  }
  for (const row of data.cashMovements) {
    if (!businesses.has(row.businessId)) errors.push(`CashMovement ${row.id}: businessId huérfano`)
    const repair = row.repairId ? repairs.get(row.repairId) : undefined
    if (row.repairId && !repair) errors.push(`CashMovement ${row.id}: repairId huérfano`)
    if (repair && repair.businessId !== row.businessId) errors.push(`CashMovement ${row.id}: reparación de otro negocio`)
  }
  for (const row of data.repairParts) {
    const repair = repairs.get(row.repairId)
    const stock = stockItems.get(row.stockItemId)
    if (!repair) errors.push(`RepairPart ${row.id}: repairId huérfano`)
    if (!stock) errors.push(`RepairPart ${row.id}: stockItemId huérfano`)
    if (repair && stock && repair.businessId !== stock.businessId) {
      errors.push(`RepairPart ${row.id}: reparación y stock pertenecen a negocios distintos`)
    }
  }

  if (errors.length) throw new Error(`Validación abortada:\n- ${errors.join('\n- ')}`)
}

function summarize(data: SourceData) {
  const totalsByBusiness = data.businesses.map((business: SourceBusiness) => {
    const repairs = data.repairs.filter((row: SourceRepair) => row.businessId === business.id)
    const payments = data.payments.filter((row: SourcePayment) => row.businessId === business.id)
    const cash = data.cashMovements.filter((row: SourceCashMovement) => row.businessId === business.id)
    return {
      businessId: business.id,
      clients: data.clients.filter((row: SourceClient) => row.businessId === business.id).length,
      repairs: repairs.length,
      stockQuantity: data.stockItems
        .filter((row: SourceStockItem) => row.businessId === business.id)
        .reduce((sum: number, row: SourceStockItem) => sum + row.quantity, 0),
      repairTotal: repairs.reduce((sum: number, row: SourceRepair) => sum + row.total, 0),
      repairPaid: repairs.reduce((sum: number, row: SourceRepair) => sum + row.paid, 0),
      paymentTotal: payments.reduce((sum: number, row: SourcePayment) => sum + row.amount, 0),
      cashTotal: cash.reduce((sum: number, row: SourceCashMovement) => sum + row.amount, 0),
    }
  })
  return {
    counts: Object.fromEntries(
      (Object.keys(data) as Array<keyof SourceData>).map((name: keyof SourceData) => [name, data[name].length]),
    ),
    totalsByBusiness,
    repairPartsByRepair: data.repairs.map((repair: SourceRepair) => ({
      repairId: repair.id,
      count: data.repairParts.filter((part: SourceRepairPart) => part.repairId === repair.id).length,
    })),
  }
}

async function readTarget(): Promise<SourceData> {
  if (!target) throw new Error('PostgreSQL no está configurado.')
  const [businesses, users, clients, repairs, stockItems, payments, cashMovements, repairParts] =
    await Promise.all([
      target.business.findMany({ orderBy: { id: 'asc' } }),
      target.user.findMany({ orderBy: { id: 'asc' } }),
      target.client.findMany({ orderBy: { id: 'asc' } }),
      target.repair.findMany({ orderBy: { id: 'asc' } }),
      target.stockItem.findMany({ orderBy: { id: 'asc' } }),
      target.payment.findMany({ orderBy: { id: 'asc' } }),
      target.cashMovement.findMany({ orderBy: { id: 'asc' } }),
      target.repairPart.findMany({ orderBy: { id: 'asc' } }),
    ])
  return { businesses, users, clients, repairs, stockItems, payments, cashMovements, repairParts } as SourceData
}

async function migrate(data: SourceData) {
  if (!target) return
  await target.$transaction(
    async (tx) => {
      for (const row of data.businesses) {
        await tx.business.upsert({ where: { id: row.id }, create: row, update: row })
      }
      for (const row of data.users) {
        const record = { ...row, role: row.role as UserRole }
        await tx.user.upsert({ where: { id: row.id }, create: record, update: record })
      }
      for (const row of data.clients) {
        await tx.client.upsert({ where: { id: row.id }, create: row, update: row })
      }
      for (const row of data.repairs) {
        const record = { ...row, status: row.status as RepairStatus }
        await tx.repair.upsert({ where: { id: row.id }, create: record, update: record })
      }
      for (const row of data.stockItems) {
        await tx.stockItem.upsert({ where: { id: row.id }, create: row, update: row })
      }
      for (const row of data.payments) {
        const record = { ...row, method: row.method as PaymentMethod }
        await tx.payment.upsert({ where: { id: row.id }, create: record, update: record })
      }
      for (const row of data.cashMovements) {
        const record = {
          ...row,
          type: row.type as CashMovementType,
          method: row.method as PaymentMethod | null,
        }
        await tx.cashMovement.upsert({ where: { id: row.id }, create: record, update: record })
      }
      for (const row of data.repairParts) {
        await tx.repairPart.upsert({ where: { id: row.id }, create: row, update: row })
      }
    },
    { timeout: 120_000 },
  )
}

async function main() {
  const data = await readSource()
  validate(data)
  const sourceSummary = summarize(data)
  console.log(JSON.stringify({ mode: dryRun ? 'dry-run' : 'import', source: sourceSummary }, null, 2))
  if (dryRun) return

  await migrate(data)
  const targetData = await readTarget()
  const targetSummary = summarize(targetData)
  if (JSON.stringify(sourceSummary) !== JSON.stringify(targetSummary)) {
    throw new Error(`Verificación fallida.\nOrigen: ${JSON.stringify(sourceSummary)}\nDestino: ${JSON.stringify(targetSummary)}`)
  }
  console.log(JSON.stringify({ verification: 'ok', target: targetSummary }, null, 2))
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => {
    await source.$disconnect()
    await target?.$disconnect()
  })
