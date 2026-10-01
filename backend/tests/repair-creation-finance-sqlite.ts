import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

// Apply the actual migration chain, including an existing repair before this migration.
const db = new DatabaseSync(':memory:')
try {
  const migrations = resolve(__dirname, '../prisma/migrations-sqlite')
  for (const name of readdirSync(migrations).sort()) {
    const file = resolve(migrations, name, 'migration.sql')
    if (!existsSync(file)) continue
    if (name === '20260929140000_repair_creation_finance') {
      db.exec(`INSERT INTO "Business" (id,name,updatedAt) VALUES ('a','A',CURRENT_TIMESTAMP);
        INSERT INTO "Client" (id,businessId,name) VALUES ('ca','a','Cliente A');
        INSERT INTO "Repair" (id,businessId,number,clientId,deviceBrand,deviceModel,issue,trackingToken,updatedAt)
          VALUES ('legacy','a',1001,'ca','Samsung','A14','Pantalla','legacy-token',CURRENT_TIMESTAMP);`)
    }
    db.exec(readFileSync(file, 'utf8'))
  }
  db.exec('PRAGMA foreign_keys=ON')
  const legacy = db.prepare('SELECT partsCost,laborCost,laborCharge,initialCostMovementId FROM Repair WHERE id=?').get('legacy')!
  assert.deepEqual({ ...legacy }, { partsCost: 0, laborCost: 0, laborCharge: 0, initialCostMovementId: null })
  db.exec(`BEGIN;
    INSERT INTO "Repair" (id,businessId,number,clientId,deviceBrand,deviceModel,issue,trackingToken,updatedAt,partsCost,laborCharge,total)
      VALUES ('new','a',1002,'ca','Samsung','A14','Pantalla','new-token',CURRENT_TIMESTAMP,30000,30000,60000);
    INSERT INTO "CashMovement" (id,businessId,type,origin,repairId,description,amount) VALUES ('cost','a','EXPENSE','REPAIR','new','Costo',30000);
    INSERT INTO "CashMovement" (id,businessId,type,origin,repairId,description,amount,method) VALUES ('income','a','INCOME','REPAIR','new','Adelanto',20000,'CASH');
    INSERT INTO "Payment" (id,businessId,repairId,clientId,amount,method,isAdvance,"cashMovementId") VALUES ('advance','a','new','ca',20000,'CASH',1,'income');
    UPDATE "Repair" SET paid=20000,initialCostMovementId='cost' WHERE id='new';
    COMMIT;`)
  const repair = db.prepare('SELECT total,paid,partsCost,laborCharge,laborCost FROM Repair WHERE id=?').get('new')!
  assert.equal(Number(repair.total) - Number(repair.partsCost), 30000)
  assert.equal(Number(repair.total) - Number(repair.paid), 40000)
  assert.equal(repair.laborCost, 0)
  assert.equal(db.prepare('SELECT isAdvance FROM Payment WHERE id=?').get('advance')!.isAdvance, 1)
  // El adelanto queda vinculado a su ingreso de Caja por ID, no por el texto de la descripción.
  const linked = db.prepare('SELECT p.id AS pid, p."cashMovementId" AS mid, m.amount AS amount FROM Payment p JOIN CashMovement m ON m.id = p."cashMovementId" WHERE p.id=?').get('advance')!
  assert.equal(linked.mid, 'income', 'el pago apunta a su movimiento de caja por ID')
  assert.equal(linked.amount, 20000, 'el movimiento enlazado es el ingreso del adelanto')
  assert.throws(() => db.exec(`DELETE FROM "CashMovement" WHERE id='income'`), /FOREIGN KEY/, 'no se puede borrar una caja que todavía respalda un pago')
  // Un movimiento no puede respaldar dos pagos a la vez.
  assert.throws(() => db.exec(`INSERT INTO "Payment" (id,businessId,repairId,clientId,amount,method,"cashMovementId") VALUES ('dup','a','new','ca',100,'CASH','income')`), /UNIQUE/, 'un movimiento no puede asignarse a dos pagos')
  assert.throws(() => db.exec(`DELETE FROM "CashMovement" WHERE id='cost'`), /FOREIGN KEY/)
  assert.throws(() => db.exec(`UPDATE "Repair" SET initialCostMovementId='missing' WHERE id='legacy'`), /FOREIGN KEY/)
  assert.throws(() => db.exec(`UPDATE "Repair" SET initialCostMovementId='cost' WHERE id='legacy'`), /UNIQUE/)
  const before = db.prepare('SELECT COUNT(*) AS count FROM CashMovement').get()!.count
  db.exec('BEGIN')
  try {
    db.exec(`INSERT INTO "CashMovement" (id,businessId,type,origin,repairId,description,amount) VALUES ('rollback','a','EXPENSE','REPAIR','legacy','Costo',1)`)
    assert.throws(() => db.exec(`UPDATE "Repair" SET initialCostMovementId='missing' WHERE id='legacy'`), /FOREIGN KEY/)
  } finally { db.exec('ROLLBACK') }
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM CashMovement').get()!.count, before)
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
  console.log('REPAIR FINANCE SQLITE PASSED: complete migration chain, existing records preserved, costs/advance, unique cost link, FK protection and rollback')
} finally { db.close() }
