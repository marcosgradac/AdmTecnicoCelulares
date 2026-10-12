import { z } from 'zod'
import { CashMovementOrigin, CashMovementType, PaymentMethod, Prisma, RepairStatus } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { repairResponse } from './repair-response'
import { authOf, requirePermission } from '../../middlewares/auth'
import type { Express } from 'express'
import { includeRepair } from './repair-query'
import { deleteRepairInTransaction } from './repair-delete'

export function registerRepairCancellationRoutes(app: Express) {
  const cancellationError = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode })
  // Old clients cannot create cancellations either.
  for (const endpoint of ['cancel', 'cancel-preview']) app.post('/api/repairs/:id/' + endpoint, requirePermission('repairs.changeStatus'), async (req, res) => {
    const repair = await prisma.repair.findFirst({ where: { id: String(req.params.id), businessId: authOf(req).businessId }, select: { id: true } })
    if (!repair) return res.status(404).json({ success: false, message: 'Reparación no encontrada' })
    return res.status(410).json({ success: false, code: 'REPAIR_CANCELLATION_REMOVED', message: 'Cancelar reparación ya no está disponible. Usá Eliminar reparación.' })
  })
  const cancellationPaymentSchema = z.object({ amount: z.number().int().positive(), method: z.nativeEnum(PaymentMethod) })
  app.post('/api/repairs/:id/cancellation-payment', requirePermission('repairs.viewFinancials'), async (req, res) => {
    const parsed = cancellationPaymentSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos de cobro de revisión inválidos' })
    const auth = authOf(req)
    const repairId = String(req.params.id)
    try {
      const repair = await prisma.$transaction(async tx => {
        const current = await tx.repair.findFirst({ where: { id: repairId, businessId: auth.businessId }, include: { client: true } })
        if (!current) throw cancellationError(404, 'Reparación no encontrada')
        if (current.status !== RepairStatus.CANCELLED) throw cancellationError(409, 'La reparación no está cancelada: usá el registro de pagos habitual')
        const reviewFee = current.cancellationReviewFee ?? 0
        const covered = current.cancellationReviewPaid ?? 0
        // El saldo descuenta el adelanto que el cliente ya entregó: lo que falta es sólo la diferencia.
        const balance = reviewFee - covered - (current.cancellationPaidAmount ?? 0)
        if (balance <= 0) throw cancellationError(409, 'La revisión ya está cobrada por completo')
        if (parsed.data.amount > balance) throw cancellationError(400, `El monto supera el saldo de revisión pendiente (${balance})`)
        const reviewMovement = await tx.cashMovement.create({ data: { businessId: current.businessId, type: CashMovementType.INCOME, origin: CashMovementOrigin.REPAIR, description: `Cobro revisión reparación #${current.number}`, amount: parsed.data.amount, method: parsed.data.method, repairId: current.id, clientName: current.client.name } })
        // Compare-and-swap sobre el saldo ya cubierto: dos cobros simultáneos del mismo saldo no pueden ocurrir.
        const claimed = await tx.repair.updateMany({
          where: { id: current.id, businessId: auth.businessId, status: RepairStatus.CANCELLED, cancellationReviewFee: reviewFee, cancellationReviewPaid: covered },
          data: { cancellationReviewPaid: { increment: parsed.data.amount } },
        })
        if (claimed.count !== 1) throw cancellationError(409, 'El cobro de revisión ya fue registrado por otra operación')
        // El cobro queda vinculado por ID a su ingreso de caja, igual que los pagos normales.
        await tx.payment.create({ data: { businessId: current.businessId, repairId: current.id, clientId: current.clientId, amount: parsed.data.amount, method: parsed.data.method, note: `Cobro revisión reparación #${current.number}`, cancellationReview: true, cashMovementId: reviewMovement.id } })
        return tx.repair.findFirst({ where: { id: current.id }, include: includeRepair })
      }, { timeout: 15_000 })
      return res.json(repairResponse(authOf(req), repair))
    } catch (error) {
      const statusCode = typeof error === 'object' && error && 'statusCode' in error ? Number(error.statusCode) : 500
      return res.status(statusCode).json({ success: false, message: error instanceof Error && statusCode !== 500 ? error.message : 'No pudimos registrar el cobro de revisión' })
    }
  })
  app.delete('/api/repairs/:id', requirePermission('repairs.delete'), async (req, res) => {
    const auth = authOf(req)
    try {
      await prisma.$transaction(tx => deleteRepairInTransaction(tx, auth.businessId, String(req.params.id)), { timeout: 15000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })
      return res.json({ success: true })
    } catch (error) {
      const status = typeof error === 'object' && error && 'statusCode' in error ? Number(error.statusCode) : 500
      return res.status(status).json({ success: false, message: error instanceof Error && status !== 500 ? error.message : 'No pudimos eliminar la reparación; los datos se conservaron.' })
    }
  })
}
