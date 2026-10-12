import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const root = fileURLToPath(new URL('../prisma/migrations-sqlite', import.meta.url))
const name = '20261012180000_remove_repair_cancellation'
const migration = readFileSync(join(root, name, 'migration.sql'), 'utf8')
const fields = ['cancelledAt', 'cancellationPaidAmount', 'cancellationReviewFee', 'cancellationReviewPaid', 'cancellationRefundAmount', 'cancellationRefundMethod', 'cancellationRefundMovementId']
function create() {
  const db = new DatabaseSync(':memory:')
  for (const directory of readdirSync(root).sort()) {
    if (directory === name) continue
    const file = join(root, directory, 'migration.sql')
    if (existsSync(file)) db.exec(readFileSync(file, 'utf8'))
  }
  db.exec(`PRAGMA foreign_keys = ON;
    INSERT INTO "Business" (id, name, updatedAt) VALUES ('business', 'Migration QA', CURRENT_TIMESTAMP);
    INSERT INTO "Client" (id, "businessId", name) VALUES ('client', 'business', 'Client QA');
    INSERT INTO "Repair" (id, "businessId", number, "clientId", "deviceBrand", "deviceModel", issue, "trackingToken", "updatedAt", total, paid)
      VALUES ('repair', 'business', 1, 'client', 'Brand', 'Model', 'Issue', 'token', CURRENT_TIMESTAMP, 1700, 700);
    INSERT INTO "Payment" (id, "businessId", "repairId", "clientId", amount, method) VALUES ('payment', 'business', 'repair', 'client', 700, 'CASH');
    INSERT INTO "CommerceSale" (id, "businessId", total, "costOfGoodsSold", profit, "paymentMethod", "idempotencyKey")
      VALUES ('sale', 'business', 2100, 1100, 1000, 'CASH', 'sale-key');
    INSERT INTO "CashMovement" (id, "businessId", type, description, amount, origin, "commerceSaleId")
      VALUES ('cash', 'business', 'INCOME', 'Commerce', 2100, 'COMMERCE', 'sale');`)
  return db
}
function snapshot(db) {
  const result = { tables: {} }
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all()
  for (const { name } of tables) {
    result.tables[name] = {
      rows: db.prepare(`SELECT * FROM "${name}" ORDER BY id`).all(),
      columns: db.prepare(`PRAGMA table_info("${name}")`).all().map(({ cid, ...column }) => column),
      foreignKeys: db.prepare(`PRAGMA foreign_key_list("${name}")`).all(),
      indexes: db.prepare(`PRAGMA index_list("${name}")`).all(),
    }
  }
  result.tempTables = db.prepare(`SELECT name FROM sqlite_temp_master WHERE type='table' ORDER BY name`).all()
  return result
}
const cases = [
  ['blocked_cancelled_repairs', `UPDATE "Repair" SET status = 'CANCELLED'`],
  ...fields.map(field => ['blocked_repair_cancellation_fields', `UPDATE "Repair" SET "${field}" = ${field === 'cancelledAt' ? "'2026-10-12'" : field === 'cancellationRefundMethod' || field === 'cancellationRefundMovementId' ? "'history'" : field === 'cancellationReviewPaid' ? '1' : '0'}`]),
  ['blocked_cancellation_review_payments', `UPDATE "Payment" SET "cancellationReview" = 1`],
]
for (const [category, seed] of cases) {
  const db = create()
  try {
    db.exec(seed)
    const before = snapshot(db)
    assert.throws(() => db.exec(migration), new RegExp(category))
    db.exec('ROLLBACK')
    assert.deepEqual(snapshot(db), before)
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
    console.log('PASS SQLite guard rollback: ' + seed)
  } finally { db.close() }
}
const db = create()
try {
  // Unrelated commerce cancellation is retained, including its historical data.
  db.exec(`UPDATE "CommerceSale" SET "cancelledAt" = '2026-10-12'`)
  const before = snapshot(db)
  db.exec(migration)
  const after = snapshot(db)
  for (const field of fields) delete before.tables.Repair.rows[0][field]
  delete before.tables.Payment.rows[0].cancellationReview
  before.tables.Repair.columns = before.tables.Repair.columns.filter(x => !fields.includes(x.name))
  before.tables.Payment.columns = before.tables.Payment.columns.filter(x => x.name !== 'cancellationReview')
  assert.deepEqual(after, before, 'Remove only repair cancellation columns; retain rows, commerce, finance, indexes, defaults and FKs')
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
  db.exec(`INSERT INTO "Repair" (id, "businessId", number, "clientId", "deviceBrand", "deviceModel", issue, "trackingToken", "updatedAt")
    VALUES ('after', 'business', 2, 'client', 'Brand', 'Model', 'Issue', 'after-token', CURRENT_TIMESTAMP)`)
  assert.equal(db.prepare(`SELECT status FROM "Repair" WHERE id = 'after'`).get().status, 'RECEIVED')
  assert.throws(() => db.exec(`INSERT INTO "CashMovement" (id, "businessId", type, description, amount, origin, "commerceSaleId") VALUES ('bad', 'business', 'INCOME', 'bad', 1, 'COMMERCE', 'missing')`), /FOREIGN KEY constraint failed/)
  db.exec(`UPDATE "CommerceSale" SET id = 'renamed' WHERE id = 'sale'`)
  assert.equal(db.prepare(`SELECT "commerceSaleId" FROM "CashMovement" WHERE id = 'cash'`).get().commerceSaleId, 'renamed')
  db.exec(`DELETE FROM "CommerceSale" WHERE id = 'renamed'`)
  assert.equal(db.prepare(`SELECT "commerceSaleId" FROM "CashMovement" WHERE id = 'cash'`).get().commerceSaleId, null)
  console.log('PASS SQLite actual migration chain preserves unrelated data, schema defaults/indexes/FKs and commerce cascade/set-null behavior')
} finally { db.close() }
