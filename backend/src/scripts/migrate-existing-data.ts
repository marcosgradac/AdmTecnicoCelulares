import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const DEMO_BUSINESS_ID = 'cellufix-demo-business'

async function main() {
  const adminEmail = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase()
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD
  if (!adminEmail || !adminPassword || adminPassword.length < 8) {
    throw new Error('INITIAL_ADMIN_EMAIL e INITIAL_ADMIN_PASSWORD (mínimo 8 caracteres) son obligatorios')
  }

  await prisma.$transaction(async transaction => {
    const business = await transaction.business.upsert({
      where: { id: DEMO_BUSINESS_ID },
      update: {},
      create: { id: DEMO_BUSINESS_ID, name: 'CelluFix Demo', slug: 'cellufix-demo' }
    })

    await transaction.$executeRawUnsafe(`UPDATE Client SET businessId = '${DEMO_BUSINESS_ID}' WHERE businessId IS NULL`)
    await transaction.$executeRawUnsafe(`UPDATE Repair SET businessId = '${DEMO_BUSINESS_ID}' WHERE businessId IS NULL`)
    await transaction.$executeRawUnsafe(`UPDATE StockItem SET businessId = '${DEMO_BUSINESS_ID}' WHERE businessId IS NULL`)
    await transaction.$executeRawUnsafe(`UPDATE CashMovement SET businessId = '${DEMO_BUSINESS_ID}' WHERE businessId IS NULL`)
    await transaction.$executeRawUnsafe(`UPDATE Payment SET businessId = '${DEMO_BUSINESS_ID}' WHERE businessId IS NULL`)

    const existing = await transaction.user.findUnique({ where: { email: adminEmail } })
    if (!existing) {
      await transaction.user.create({
        data: {
          businessId: business.id,
          name: 'Administrador',
          email: adminEmail,
          passwordHash: await bcrypt.hash(adminPassword, 12),
          role: 'OWNER'
        }
      })
    }
  })
}

main()
  .finally(async () => prisma.$disconnect())
  .catch(() => {
    process.exitCode = 1
  })
