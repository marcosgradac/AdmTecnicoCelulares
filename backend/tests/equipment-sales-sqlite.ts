import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const db = new DatabaseSync(':memory:')
try {
  const root = resolve(__dirname, '../prisma/migrations-sqlite')
  const directories = readdirSync(root).sort()
  db.exec('PRAGMA foreign_keys = ON')
  for (const directory of directories) {
    const file = resolve(root, directory, 'migration.sql')
    if (!existsSync(file)) continue
    if (directory === '20260920010000_add_equipment_sales') {
      db.exec(`INSERT INTO "Business" ("id", "name", "updatedAt") VALUES ('equipment-business', 'Test', CURRENT_TIMESTAMP)`)
      db.exec(`INSERT INTO "CashMovement" ("id", "businessId", "type", "description", "amount") VALUES ('legacy-cash', 'equipment-business', 'INCOME', 'Anterior', 123)`)
    }
    db.exec(readFileSync(file, 'utf8'))
  }
  assert.equal(db.prepare(`SELECT amount FROM CashMovement WHERE id = 'legacy-cash'`).get()!.amount, 123, 'migration preserves existing cash')
  const fk = db.prepare('PRAGMA foreign_key_list("CashMovement")').all()
  assert.ok(fk.some(row => row.from === 'resaleDeviceId' && row.table === 'ResaleDevice' && row.on_delete === 'RESTRICT' && row.on_update === 'CASCADE'))
  db.exec(`INSERT INTO "ResaleDevice" ("id", "businessId", "brand", "model", "purchasePrice", "estimatedSalePrice", "updatedAt") VALUES ('device', 'equipment-business', 'Samsung', 'A54', 100, 200, CURRENT_TIMESTAMP)`)
  const insert = db.prepare(`INSERT INTO "CashMovement" ("id", "businessId", "type", "description", "amount", "origin", "resaleDeviceId", "resaleKind", "resaleVersion") VALUES (?, 'equipment-business', 'EXPENSE', 'Compra', 100, 'EQUIPMENT', ?, 'PURCHASE', 0)`)
  assert.throws(() => insert.run('invalid', 'missing'), /FOREIGN KEY constraint failed/)
  insert.run('purchase', 'device')
  assert.throws(() => insert.run('duplicate', 'device'), /UNIQUE constraint failed/)
  assert.throws(() => db.exec(`DELETE FROM "ResaleDevice" WHERE "id" = 'device'`), /FOREIGN KEY constraint failed/)
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
  console.log('EQUIPMENT SQLITE PASSED: additive migration preserves cash, physical FK, immutable linkage and unique version/kind')
} finally { db.close() }
