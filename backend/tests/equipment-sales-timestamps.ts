import 'dotenv/config'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { PrismaClient } from '@prisma/client'

async function main() {
  const sqlite = process.env.EQUIPMENT_TIMESTAMP_ENGINE === 'sqlite'
  let db: PrismaClient
  if (sqlite) {
    const file = join(mkdtempSync(join(tmpdir(), 'equipment-time-')), 'test.db')
    const native = new DatabaseSync(file)
    const migrations = resolve(__dirname, '../prisma/migrations-sqlite')
    for (const name of readdirSync(migrations).filter(name => /^\d/.test(name)).sort()) native.exec(readFileSync(join(migrations, name, 'migration.sql'), 'utf8'))
    native.close()
    const { PrismaClient: SQLiteClient } = require('../generated/sqlite-client')
    db = new SQLiteClient({ datasources: { db: { url: 'file:' + file.replace(/\\/g, '/') } } })
  } else {
    const url = new URL(process.env.DATABASE_URL!)
    assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && url.port === '55439', 'Only isolated test PostgreSQL')
    db = new PrismaClient()
  }
  // Replace only the database dependency before loading the real service, in this test process.
  const dependency = require.resolve('../src/lib/prisma')
  require(dependency)
  require.cache[dependency]!.exports = { prisma: db }
  const { createDevice, editDevice, sellDevice } = require('../src/modules/equipment-sales/equipment-sales.service') as typeof import('../src/modules/equipment-sales/equipment-sales.service')
  const business = await db.business.create({ data: { name: 'Timestamp regression' } })
  try {
    const purchase = new Date('2026-09-19T04:43:07.123Z')
    const fields = { brand: 'Xiaomi', model: 'Note 8', purchasePrice: 100, repairExpenses: 20, estimatedSalePrice: 180 }
    const ready = async () => {
      const device = await createDevice(business.id, fields)
      await db.resaleDevice.update({ where: { id: device.id }, data: { createdAt: purchase } })
      await db.cashMovement.updateMany({ where: { resaleDeviceId: device.id }, data: { createdAt: purchase } })
      return editDevice(business.id, device.id, { ...fields, status: 'READY_FOR_SALE', expectedVersion: device.version })
    }
    let device = await ready()
    const input = { expectedVersion: device.version, actualSalePrice: 170, salePaymentMethod: 'CASH' as const }
    const before = Date.now()
    const sold = await sellDevice(business.id, device.id, input)
    const after = Date.now()
    const cash = await db.cashMovement.findFirstOrThrow({ where: { resaleDeviceId: device.id, resaleKind: 'SALE' } })
    assert.ok(sold.soldAt!.getTime() >= before && sold.soldAt!.getTime() <= after, 'now uses server confirmation time')
    assert.equal(cash.createdAt.getTime(), sold.soldAt!.getTime(), 'cash and now sale preserve the same precise instant')
    assert.ok(cash.createdAt >= purchase)
    assert.equal(sold.realizedProfit, 50)
    device = await ready()
    for (const date of [new Date('2026-09-19T04:43:00.000Z'), new Date(purchase.getTime() - 1), new Date(Date.now() + 60000)]) {
      await assert.rejects(() => sellDevice(business.id, device.id, { ...input, expectedVersion: device.version, soldAt: date }), (e: any) => e.status === 400)
    }
    assert.equal(await db.cashMovement.count({ where: { resaleDeviceId: device.id, resaleKind: 'SALE' } }), 0)
    assert.equal((await db.resaleDevice.findUniqueOrThrow({ where: { id: device.id } })).status, 'READY_FOR_SALE')
    const effective = new Date(purchase.getTime() + 876)
    const recordedAfter = Date.now()
    const historical = await sellDevice(business.id, device.id, { ...input, expectedVersion: device.version, soldAt: effective })
    assert.equal(historical.soldAt!.toISOString(), effective.toISOString(), 'effective date retains milliseconds')
    const entries = await db.cashMovement.findMany({ where: { resaleDeviceId: device.id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] })
    assert.equal(entries[0].resaleKind, 'SALE', 'same ordering as cash endpoint: actual operation first')
    assert.ok(entries[0].createdAt.getTime() >= recordedAfter)
    assert.notEqual(entries[0].createdAt.getTime(), effective.getTime(), 'effective date never replaces real cash timestamp')
    assert.equal(entries.reduce((sum, e) => sum + (e.type === 'INCOME' ? e.amount : -e.amount), 0), 50)
    console.log(`EQUIPMENT TIMESTAMPS PASSED (${sqlite ? 'SQLite' : 'PostgreSQL'}): now precision, effective date, purchase lower bound, future rejection, cash ordering, unchanged amounts`)
  } finally {
    await db.cashMovement.deleteMany({ where: { businessId: business.id } })
    await db.resaleDevice.deleteMany({ where: { businessId: business.id } })
    await db.business.delete({ where: { id: business.id } })
    await db.$disconnect()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
