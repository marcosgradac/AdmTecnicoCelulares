import { Prisma } from '@prisma/client'
import type { dashboardPeriod } from './dashboard-period'

export async function dashboardCashFlow(tx: Pick<Prisma.TransactionClient, '$queryRaw'>, businessId: string, range: ReturnType<typeof dashboardPeriod>, engine: 'postgresql' | 'sqlite' = 'postgresql') {
  // Prisma DateTime is UTC TIMESTAMP (without timezone) on PG, epoch milliseconds on SQLite.
  // Explicit conversion prevents the PG session timezone from shifting raw-query bounds.
  const timestamp = (date: Date) => engine === 'sqlite' ? Prisma.sql`${date.getTime()}` : Prisma.sql`CAST(${date.toISOString()} AS TIMESTAMP)`
  // At most 31 days / 24 hours. Portable SQL aggregation, never full movement lists.
  // Aliases are generated indices, not user input. Tenant and dates are parameters.
  const columns = range.buckets.flatMap((bucket, index) => ['INCOME', 'EXPENSE'].map(type => Prisma.sql`
    COALESCE(SUM(CASE WHEN "createdAt" >= ${timestamp(bucket.start)} AND "createdAt" < ${timestamp(bucket.end)} AND CAST("type" AS TEXT) = ${type} THEN "amount" ELSE 0 END), 0) AS ${Prisma.raw(`"${type.toLowerCase()}_${index}"`)}
  `))
  const rows = await tx.$queryRaw<Array<Record<string, number | bigint>>>(Prisma.sql`SELECT ${Prisma.join(columns)} FROM "CashMovement" WHERE "businessId" = ${businessId} AND "createdAt" >= ${timestamp(range.start)} AND "createdAt" < ${timestamp(range.end)}`)
  return range.buckets.map((bucket, index) => ({ label: bucket.label, income: Number(rows[0][`income_${index}`]), expense: Number(rows[0][`expense_${index}`]) }))
}
