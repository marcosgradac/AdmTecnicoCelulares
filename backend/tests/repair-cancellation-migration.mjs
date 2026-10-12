import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createServer } from 'node:net'
import EmbeddedPostgres from 'embedded-postgres'

const migration = await readFile(new URL('../prisma/migrations/20261012180000_remove_repair_cancellation/migration.sql', import.meta.url), 'utf8')
const root = resolve(tmpdir())
const directory = await mkdtemp(join(root, 'tecnodesk-cancellation-migration-'))
const reservation = createServer()
await new Promise((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve) })
const port = reservation.address().port
await new Promise(resolve => reservation.close(resolve))
const postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: 'postgres', password: 'synthetic-local-only', persistent: true, authMethod: 'scram-sha-256', postgresFlags: ['-h', '127.0.0.1'], onLog() {}, onError() {} })
const statuses = ['RECEIVED', 'REVIEW', 'BUDGET', 'APPROVED', 'WAITING_PART', 'REPAIRING', 'TESTING', 'READY', 'DELIVERED', 'CANCELLED', 'WARRANTY']
const movementTypes = ['INITIAL_STOCK', 'PURCHASE', 'MANUAL_ENTRY', 'REPAIR_USAGE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'RETURN', 'DAMAGED', 'CANCELLED_REPAIR_RETURN']
const fields = ['cancelledAt', 'cancellationPaidAmount', 'cancellationReviewFee', 'cancellationReviewPaid', 'cancellationRefundAmount', 'cancellationRefundMethod', 'cancellationRefundMovementId']
const setup = `
CREATE TYPE "RepairStatus" AS ENUM (${statuses.map(x => "'" + x + "'").join(',')});
CREATE TYPE "InventoryMovementType" AS ENUM (${movementTypes.map(x => "'" + x + "'").join(',')});
CREATE TABLE "Repair" (id text PRIMARY KEY, status "RepairStatus" NOT NULL DEFAULT 'RECEIVED', "cancelledAt" timestamp, "cancellationPaidAmount" double precision, "cancellationReviewFee" double precision, "cancellationReviewPaid" double precision NOT NULL DEFAULT 0, "cancellationRefundAmount" double precision, "cancellationRefundMethod" text, "cancellationRefundMovementId" text, "businessId" text NOT NULL, total double precision NOT NULL DEFAULT 0);
CREATE TABLE "Payment" (id text PRIMARY KEY, "repairId" text REFERENCES "Repair"(id), "cancellationReview" boolean NOT NULL DEFAULT false, amount double precision NOT NULL);
CREATE TABLE "RepairStatusHistory" (id text PRIMARY KEY, "repairId" text REFERENCES "Repair"(id), "previousStatus" "RepairStatus", "newStatus" "RepairStatus" NOT NULL);
CREATE TABLE "InventoryMovement" (id text PRIMARY KEY, "repairId" text REFERENCES "Repair"(id), type "InventoryMovementType" NOT NULL, quantity integer NOT NULL);
CREATE INDEX repair_status_idx ON "Repair"(status);
CREATE TABLE "CashMovement" (id text PRIMARY KEY, amount double precision NOT NULL, "paymentId" text REFERENCES "Payment"(id));
CREATE TABLE "CommerceSale" (id text PRIMARY KEY, total double precision NOT NULL);
INSERT INTO "Repair" (id, "businessId", total) VALUES ('repair', 'business', 1700);
INSERT INTO "Payment" (id, "repairId", amount) VALUES ('payment', 'repair', 700);
INSERT INTO "RepairStatusHistory" VALUES ('history', 'repair', NULL, 'RECEIVED');
INSERT INTO "InventoryMovement" VALUES ('inventory', 'repair', 'REPAIR_USAGE', -1);
INSERT INTO "CashMovement" VALUES ('cash', 700, 'payment');
INSERT INTO "CommerceSale" VALUES ('sale', 2100);
`
const cases = [
  ['cancelled repairs', `UPDATE "Repair" SET status = 'CANCELLED'`],
  ['cancelled status history', `UPDATE "RepairStatusHistory" SET "previousStatus" = 'CANCELLED'`],
  ['cancelled status history', `UPDATE "RepairStatusHistory" SET "newStatus" = 'CANCELLED'`],
  ...fields.map(field => ['repair cancellation fields', `UPDATE "Repair" SET "${field}" = ${field === 'cancelledAt' ? "'2026-10-12'" : field === 'cancellationRefundMethod' || field === 'cancellationRefundMovementId' ? "'history'" : field === 'cancellationReviewPaid' ? '1' : '0'}`]),
  ['cancellation review payments', `UPDATE "Payment" SET "cancellationReview" = true`],
  ['cancellation inventory movements', `UPDATE "InventoryMovement" SET type = 'CANCELLED_REPAIR_RETURN'`],
]
let client
async function snapshot() {
  const tables = ['Repair', 'Payment', 'RepairStatusHistory', 'InventoryMovement', 'CashMovement', 'CommerceSale']
  const result = {}
  for (const table of tables) result[table] = (await client.query(`SELECT * FROM "${table}" ORDER BY id`)).rows
  result.columns = (await client.query(`SELECT table_name, column_name, data_type, udt_name, column_default, is_nullable FROM information_schema.columns WHERE table_schema = current_schema() ORDER BY table_name, ordinal_position`)).rows
  result.enums = (await client.query(`SELECT t.typname, e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = current_schema() ORDER BY t.typname, e.enumsortorder`)).rows
  result.constraints = (await client.query(`SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace = current_schema()::regnamespace ORDER BY conname`)).rows
  result.indexes = (await client.query(`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = current_schema() ORDER BY indexname`)).rows
  return result
}
async function fresh(index) {
  await client.query(`CREATE SCHEMA test_${index}; SET search_path TO test_${index};`)
  await client.query(setup)
}
try {
  await postgres.initialise()
  await postgres.start()
  client = postgres.getPgClient('postgres', '127.0.0.1')
  await client.connect()
  for (const [index, [category, seed]] of cases.entries()) {
    await fresh(index)
    await client.query(seed)
    const before = await snapshot()
    await assert.rejects(client.query(migration), error => error.message === 'Repair cancellation removal blocked: ' + category)
    await client.query('ROLLBACK')
    assert.deepEqual(await snapshot(), before, 'Guard must preserve rows, enums, columns, defaults, indexes and foreign keys: ' + seed)
    console.log('PASS guard rollback: ' + seed)
  }
  await fresh('success')
  // Every remaining enum label survives conversion, including nullable history.
  for (const status of statuses.filter(x => x !== 'CANCELLED')) {
    await client.query('INSERT INTO "Repair" (id, status, "businessId", total) VALUES ($1, $2, $3, $4)', ['repair-' + status, status, 'business', 33])
    await client.query('INSERT INTO "RepairStatusHistory" VALUES ($1, $2, $3, $3)', ['history-' + status, 'repair', status])
  }
  for (const type of movementTypes.filter(x => x !== 'CANCELLED_REPAIR_RETURN')) {
    await client.query('INSERT INTO "InventoryMovement" VALUES ($1, $2, $3, $4)', ['inventory-' + type, 'repair', type, 2])
  }
  const before = await snapshot()
  await client.query(migration)
  const after = await snapshot()
  for (const row of before.Repair) for (const field of fields) delete row[field]
  for (const row of before.Payment) delete row.cancellationReview
  before.constraints = before.constraints.filter(x => !['Payment_cancellationReview_not_null', 'Repair_cancellationReviewPaid_not_null'].includes(x.conname))
  for (const table of ['Repair', 'Payment', 'RepairStatusHistory', 'InventoryMovement', 'CashMovement', 'CommerceSale', 'constraints', 'indexes']) {
    assert.deepEqual(after[table], before[table], 'Successful migration preserves ' + table)
  }
  assert.deepEqual(after.columns, before.columns.filter(x => !(x.table_name === 'Repair' && fields.includes(x.column_name)) && !(x.table_name === 'Payment' && x.column_name === 'cancellationReview')))
  assert.deepEqual(after.enums, before.enums.filter(x => !['CANCELLED', 'CANCELLED_REPAIR_RETURN'].includes(x.enumlabel)))
  await assert.rejects(client.query(`UPDATE "Repair" SET status = 'CANCELLED'`), /invalid input value for enum/)
  await assert.rejects(client.query(`UPDATE "InventoryMovement" SET type = 'CANCELLED_REPAIR_RETURN'`), /invalid input value for enum/)
  await client.query(`INSERT INTO "Repair" (id, "businessId") VALUES ('default-after', 'business')`)
  assert.equal((await client.query(`SELECT status FROM "Repair" WHERE id = 'default-after'`)).rows[0].status, 'RECEIVED')
  console.log('PASS empty/default-zero migration preserves rows, finance, commerce, enum labels, defaults, indexes and foreign keys')
  // An unanticipated enum dependency must abort the entire migration.
  await fresh('dependency')
  await client.query(`CREATE TABLE "UnknownDependency" (status "RepairStatus"); INSERT INTO "UnknownDependency" VALUES ('RECEIVED')`)
  const dependencyBefore = await snapshot()
  await assert.rejects(client.query(migration), /other objects depend on it/)
  await client.query('ROLLBACK')
  assert.deepEqual(await snapshot(), dependencyBefore)
  assert.equal((await client.query('SELECT status FROM "UnknownDependency"')).rows[0].status, 'RECEIVED')
  console.log('PASS unknown enum dependency refuses migration without partial schema changes')
} finally {
  if (client) await client.end()
  await postgres.stop()
  assert.equal(dirname(resolve(directory)), root)
  assert.ok(directory.startsWith(join(root, 'tecnodesk-cancellation-migration-')))
  await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
