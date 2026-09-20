import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

// Exercise the real migrations without opening or changing any on-disk database.
const db = new DatabaseSync(':memory:')
try {
  const root = resolve(__dirname, '../prisma/migrations-sqlite')
  for (const directory of readdirSync(root).sort()) {
    const file = resolve(root, directory, 'migration.sql')
    if (existsSync(file)) db.exec(readFileSync(file, 'utf8'))
  }
  db.exec('PRAGMA foreign_keys = ON')
  const foreignKeys = db.prepare('PRAGMA foreign_key_list("CashMovement")').all()
  assert.ok(foreignKeys.some(key => key.from === 'commerceSaleId' && key.table === 'CommerceSale' && key.to === 'id' && key.on_delete === 'SET NULL' && key.on_update === 'CASCADE'))
  db.exec(`INSERT INTO "Business" ("id", "name", "updatedAt") VALUES ('a', 'Test A', CURRENT_TIMESTAMP), ('b', 'Test B', CURRENT_TIMESTAMP)`)
  const sale = db.prepare(`INSERT INTO "CommerceSale" ("id", "businessId", "total", "costOfGoodsSold", "profit", "paymentMethod", "idempotencyKey") VALUES (?, ?, 200, 100, 100, 'CASH', ?)`)
  sale.run('sale-a', 'a', 'same-key')
  assert.throws(() => sale.run('duplicate', 'a', 'same-key'), /UNIQUE constraint failed/)
  sale.run('sale-b', 'b', 'same-key')
  sale.run('legacy-1', 'a', null)
  sale.run('legacy-2', 'a', null)
  const cash = db.prepare(`INSERT INTO "CashMovement" ("id", "businessId", "type", "description", "amount", "origin", "commerceSaleId") VALUES (?, 'a', 'INCOME', 'Prueba', 200, 'COMMERCE', ?)`)
  assert.throws(() => cash.run('invalid', 'missing-sale'), /FOREIGN KEY constraint failed/)
  cash.run('cash-a', 'sale-a')
  db.exec(`UPDATE "CommerceSale" SET "id" = 'renamed-sale' WHERE "id" = 'sale-a'`)
  assert.equal(db.prepare(`SELECT "commerceSaleId" FROM "CashMovement" WHERE "id" = 'cash-a'`).get()!.commerceSaleId, 'renamed-sale')
  db.exec(`DELETE FROM "CommerceSale" WHERE "id" = 'renamed-sale'`)
  assert.equal(db.prepare(`SELECT "commerceSaleId" FROM "CashMovement" WHERE "id" = 'cash-a'`).get()!.commerceSaleId, null)
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
  console.log('COMMERCE SQLITE TEST PASSED: physical FK, cascade/set-null and business-scoped idempotency uniqueness')
} finally {
  db.close()
}
