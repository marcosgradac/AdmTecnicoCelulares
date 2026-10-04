import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import type { AuthData } from '../../middlewares/auth'

export class AccountDeletionError extends Error {
  constructor(public readonly status: number, message: string) { super(message) }
}

export const ownerOnlyMessage = 'Solo el propietario puede eliminar permanentemente la cuenta y el negocio.'
export const platformAccountMessage = 'La cuenta de administración de plataforma no puede eliminarse desde este flujo.'
const conflictMessage = 'No se pudo eliminar el negocio. Sus datos se conservaron. Volvé a intentar o contactá con soporte.'

/** Do not let SetNull/Cascade change a different tenant when legacy data has cross-tenant FKs. */
async function assertNoExternalReferences(tx: Prisma.TransactionClient, businessId: string) {
  const external = { businessId: { not: businessId } }
  const tenant = { businessId }
  const counts = await Promise.all([
    tx.device.count({ where: { ...external, client: tenant } }),
    tx.repair.count({ where: { ...external, OR: [{ client: tenant }, { device: tenant }, { initialCostMovement: tenant }] } }),
    tx.payment.count({ where: { ...external, OR: [{ client: tenant }, { repair: tenant }, { cashMovement: tenant }] } }),
    tx.inventoryMovement.count({ where: { ...external, OR: [{ stockItem: tenant }, { repair: tenant }, { createdBy: tenant }] } }),
    tx.repairStatusHistory.count({ where: { repair: external, changedBy: tenant } }),
    tx.repairPart.count({ where: { repair: external, stockItem: tenant } }),
    tx.cashMovement.count({ where: { ...external, OR: [{ resaleDevice: tenant }, { commerceSale: tenant }, { relatedCommerceSale: tenant }] } }),
    tx.commerceSaleLine.count({ where: { sale: external, product: tenant } }),
    tx.paymentSubmission.count({ where: { ...external, OR: [{ subscription: tenant }, { reviewedBy: tenant }] } }),
    tx.subscriptionAuditLog.count({ where: { ...external, actor: tenant } }),
  ])
  if (counts.some(count => count !== 0)) throw new AccountDeletionError(409, conflictMessage)
}

/** Explicit child-first hard deletion. Every filter is tenant-scoped, including indirect children. */
async function purgeBusiness(tx: Prisma.TransactionClient, businessId: string) {
  const where = { businessId }
  const repairChildren = { repair: { businessId } }
  await tx.warrantyClaimExpense.deleteMany({ where })
  await tx.warrantyClaim.deleteMany({ where })
  await tx.payment.deleteMany({ where })
  await tx.inventoryMovement.deleteMany({ where })
  await tx.repairPart.deleteMany({ where: repairChildren })
  await tx.repairStatusHistory.deleteMany({ where: repairChildren })
  await tx.repairPhoto.deleteMany({ where: repairChildren })
  await tx.repair.deleteMany({ where })
  await tx.stockItem.deleteMany({ where })
  await tx.cashMovement.deleteMany({ where })
  await tx.commerceSaleLine.deleteMany({ where: { sale: { businessId } } })
  await tx.commerceSale.deleteMany({ where })
  await tx.commerceProduct.deleteMany({ where })
  await tx.commerceCategory.deleteMany({ where })
  await tx.resaleDevice.deleteMany({ where })
  await tx.device.deleteMany({ where })
  await tx.client.deleteMany({ where })
  await tx.paymentSubmission.deleteMany({ where })
  await tx.subscriptionAuditLog.deleteMany({ where })
  await tx.platformInternalNote.deleteMany({ where })
  await tx.subscription.deleteMany({ where })
  await tx.passwordResetToken.deleteMany({ where: { user: { businessId } } })
  await tx.user.deleteMany({ where })
  await tx.business.delete({ where: { id: businessId } })
}

export async function deleteOwnerAccount(auth: AuthData, password: string): Promise<void> {
  try {
    await prisma.$transaction(async tx => {
      // Serialize purge requests across processes/tabs. Parameters never come from the request body.
      const businesses = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Business" WHERE "id" = ${auth.businessId} FOR UPDATE`
      if (businesses.length !== 1) throw new AccountDeletionError(404, 'La cuenta ya no existe.')
      const user = await tx.user.findUnique({ where: { id: auth.userId } })
      if (!user || user.businessId !== auth.businessId || !user.isActive || user.deletedAt || user.tokenVersion !== auth.tokenVersion) {
        throw new AccountDeletionError(401, 'Sesión inválida')
      }
      if (user.platformRole === 'SUPER_ADMIN') throw new AccountDeletionError(403, platformAccountMessage)
      if (user.role !== 'OWNER') throw new AccountDeletionError(403, ownerOnlyMessage)
      if (!await bcrypt.compare(password, user.passwordHash)) throw new AccountDeletionError(400, 'La contraseña actual es incorrecta.')
      const owners = await tx.user.count({ where: { businessId: auth.businessId, role: 'OWNER', isActive: true, deletedAt: null } })
      if (owners > 1) throw new AccountDeletionError(409, 'Hay más de un propietario activo. No se puede eliminar el negocio mientras existan otros propietarios.')
      await assertNoExternalReferences(tx, auth.businessId)
      await purgeBusiness(tx, auth.businessId)
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 30_000 })
  } catch (error) {
    if (error instanceof AccountDeletionError) throw error
    // Includes FK restrictions, concurrent serializable conflicts and transaction failures.
    // Never leak Prisma errors, SQL, password, or a stack trace to the client.
    throw new AccountDeletionError(409, conflictMessage)
  }
}
