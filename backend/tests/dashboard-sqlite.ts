import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { dashboardPeriod } from '../src/modules/dashboard/dashboard-period'
import { dashboardCashFlow } from '../src/modules/dashboard/dashboard-cash'

async function main() {
  const file = join(mkdtempSync(join(tmpdir(), 'dashboard-cash-')), 'test.db')
  const native = new DatabaseSync(file)
  const root = resolve(__dirname, '../prisma/migrations-sqlite')
  for (const name of readdirSync(root).filter(name => /^\d/.test(name)).sort()) native.exec(readFileSync(join(root, name, 'migration.sql'), 'utf8'))
  native.close()
  const { PrismaClient } = require('../generated/sqlite-client')
  const db = new PrismaClient({ datasources: { db: { url: 'file:' + file.replace(/\\/g, '/') } } })
  try {
    const a = await db.business.create({ data: { name: 'Dashboard SQLite A' } })
    const b = await db.business.create({ data: { name: 'Dashboard SQLite B' } })
    const now = new Date('2026-09-20T15:43:07.123Z')
    for (const [businessId, time, type, amount] of [
      [a.id, '2026-09-20T02:59:59.999Z', 'INCOME', 900],
      [a.id, '2026-09-20T03:00:00Z', 'INCOME', 200],
      [a.id, '2026-09-20T04:00:00Z', 'EXPENSE', 80],
      [a.id, now.toISOString(), 'INCOME', 1000],
      [a.id, '2026-09-21T04:00:00Z', 'INCOME', 7777],
      [b.id, '2026-09-20T04:00:00Z', 'INCOME', 9999],
    ] as const) await db.cashMovement.create({ data: { businessId, description: 'Test', createdAt: new Date(time), type, amount } })
    for (const period of ['today', '7d', '30d', 'month'] as const) {
      const range = dashboardPeriod(period, now)
      const rows = await dashboardCashFlow(db, a.id, range, 'sqlite')
      assert.equal(rows.reduce((sum, row) => sum + row.income, 0), period === 'today' ? 1200 : 2100)
      assert.equal(rows.reduce((sum, row) => sum + row.expense, 0), 80)
      assert.equal(rows.length, period === 'today' ? 13 : period === '7d' ? 7 : period === '30d' ? 30 : 20)
      const empty = await dashboardCashFlow(db, 'missing-business', range, 'sqlite')
      assert.ok(empty.every(row => row.income === 0 && row.expense === 0))
    }
    console.log('DASHBOARD SQLITE PASSED: real SQL aggregation, all periods, midnight boundaries, milliseconds, empty buckets and tenant isolation')
  } finally { await db.$disconnect() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
