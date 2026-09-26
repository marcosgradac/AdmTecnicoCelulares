import 'dotenv/config'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { prisma } from '../src/lib/prisma'

const migration = '20260926020000_add_repair_number_counter/migration.sql'
const fixture = [
  `INSERT INTO "Business" ("id") VALUES ('A'), ('B'), ('empty')`,
  `INSERT INTO "Repair" ("businessId", "number") VALUES ('A', 1043), ('A', 1044), ('B', 1007)`,
]
const counters = `SELECT "id", "lastRepairNumber" FROM "Business" ORDER BY "id"`
const expected = [
  { id: 'A', lastRepairNumber: 1044 }, { id: 'B', lastRepairNumber: 1007 }, { id: 'empty', lastRepairNumber: 1000 },
]

async function main() {
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname), 'Use a local test database')
  try {
    // Temporary tables shadow the real tables only on this transaction's connection.
    await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe('CREATE TEMP TABLE "Business" ("id" TEXT PRIMARY KEY) ON COMMIT DROP')
      await tx.$executeRawUnsafe('CREATE TEMP TABLE "Repair" ("businessId" TEXT, "number" INTEGER) ON COMMIT DROP')
      for (const sql of fixture) await tx.$executeRawUnsafe(sql)
      for (const sql of readFileSync(`prisma/migrations/${migration}`, 'utf8').split(';').filter(sql => sql.trim())) {
        await tx.$executeRawUnsafe(sql)
      }
      assert.deepEqual(await tx.$queryRawUnsafe(counters), expected)
      assert.deepEqual(await tx.$queryRawUnsafe('SELECT "number" FROM "Repair" ORDER BY "number"'),
        [{ number: 1007 }, { number: 1043 }, { number: 1044 }])
    })
    const sqlite = new DatabaseSync(':memory:')
    try {
      sqlite.exec('CREATE TABLE "Business" ("id" TEXT PRIMARY KEY); CREATE TABLE "Repair" ("businessId" TEXT, "number" INTEGER);')
      for (const sql of fixture) sqlite.exec(sql)
      sqlite.exec(readFileSync(`prisma/migrations-sqlite/${migration}`, 'utf8'))
      assert.deepEqual(sqlite.prepare(counters).all().map(row => ({ ...row })), expected)
      assert.deepEqual(sqlite.prepare('SELECT "number" FROM "Repair" ORDER BY "number"').all().map(row => row.number), [1007, 1043, 1044])
    } finally { sqlite.close() }
    console.log('REPAIR NUMBER MIGRATIONS PASSED: PostgreSQL and SQLite initialize each business without renumbering existing repairs')
  } finally { await prisma.$disconnect() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
