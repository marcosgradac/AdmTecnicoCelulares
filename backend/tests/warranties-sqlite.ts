import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

// Real migrations, in memory: no on-disk database or customer data.
const db = new DatabaseSync(':memory:')
try {
  const root = resolve(__dirname, '../prisma/migrations-sqlite')
  for (const directory of readdirSync(root).sort()) {
    const file = resolve(root, directory, 'migration.sql')
    if (existsSync(file)) db.exec(readFileSync(file, 'utf8'))
  }
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(`
    INSERT INTO "Business" (id, name, updatedAt) VALUES ('a', 'Warranty A', CURRENT_TIMESTAMP), ('b', 'Warranty B', CURRENT_TIMESTAMP);
    INSERT INTO "Client" (id, businessId, name) VALUES ('client-a', 'a', 'Client A');
    INSERT INTO "Repair" (id, businessId, number, clientId, deviceBrand, deviceModel, issue, trackingToken, updatedAt,
      warrantyEnabled, warrantyDurationDays, warrantyStartedAt, warrantyExpiresAt)
      VALUES ('repair-a', 'a', 1001, 'client-a', 'Samsung', 'A14', 'Display', 'tracking-a', CURRENT_TIMESTAMP,
      1, 7, '2026-10-01', '2026-10-08');
    INSERT INTO "WarrantyClaim" (id, businessId, repairId, description, updatedAt, coveredWarrantyStartedAt, coveredWarrantyExpiresAt, coveredWarrantyDurationDays)
      VALUES ('claim-a', 'a', 'repair-a', 'Display failed', CURRENT_TIMESTAMP, '2026-10-01', '2026-10-08', 7);
    INSERT INTO "CashMovement" (id, businessId, type, description, amount, method, origin, repairId)
      VALUES ('cash-a', 'a', 'EXPENSE', 'New display', 20000, 'CASH', 'REPAIR', 'repair-a'),
             ('cash-b', 'b', 'EXPENSE', 'Unrelated expense', 100, 'CASH', 'GENERAL', NULL);
  `)
  const expense = db.prepare('INSERT INTO "WarrantyClaimExpense" (id, businessId, claimId, concept, cashMovementId, idempotencyKey) VALUES (?, ?, ?, ?, ?, ?)')
  expense.run('expense-a', 'a', 'claim-a', 'Módulo nuevo', 'cash-a', 'request-a')
  assert.throws(() => expense.run('duplicate-key', 'a', 'claim-a', 'Duplicate', 'cash-a', 'request-a'), /UNIQUE constraint failed/)
  assert.throws(() => expense.run('duplicate-cash', 'a', 'claim-a', 'Duplicate', 'cash-a', 'request-other'), /UNIQUE constraint failed/)
  assert.throws(() => expense.run('cross-cash', 'a', 'claim-a', 'Cross tenant', 'cash-b', 'request-cross'), /FOREIGN KEY constraint failed/)
  assert.throws(() => expense.run('cross-claim', 'b', 'claim-a', 'Cross tenant', 'cash-b', 'request-cross'), /FOREIGN KEY constraint failed/)
  assert.throws(() => db.exec(`DELETE FROM "CashMovement" WHERE id = 'cash-a'`), /FOREIGN KEY constraint failed/)
  assert.throws(() => db.exec(`DELETE FROM "WarrantyClaim" WHERE id = 'claim-a'`), /FOREIGN KEY constraint failed/)
  assert.throws(() => db.exec(`DELETE FROM "Repair" WHERE id = 'repair-a'`), /FOREIGN KEY constraint failed/)
  db.exec(`BEGIN;
    UPDATE "WarrantyClaim" SET status = 'RESOLVED', resolution = 'Replaced', deliveredAt = '2026-10-06',
      newWarrantyDurationDays = 7, newWarrantyStartedAt = '2026-10-06', newWarrantyExpiresAt = '2026-10-13' WHERE id = 'claim-a';
    UPDATE "Repair" SET warrantyStartedAt = '2026-10-06', warrantyExpiresAt = '2026-10-13' WHERE id = 'repair-a';
    COMMIT;`)
  const claim = db.prepare('SELECT * FROM "WarrantyClaim" WHERE id = ?').get('claim-a')!
  assert.equal(claim.coveredWarrantyStartedAt, '2026-10-01')
  assert.equal(claim.coveredWarrantyExpiresAt, '2026-10-08')
  assert.equal(claim.newWarrantyExpiresAt, '2026-10-13')
  assert.equal(db.prepare('SELECT SUM(amount) AS total FROM "CashMovement" WHERE repairId = ?').get('repair-a')!.total, 20000)
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
  console.log('WARRANTY SQLITE TESTS PASSED: migration chain, expense uniqueness, tenant FKs, immutable financial links and historical coverage')
} finally { db.close() }
