import { z } from 'zod'
import { CashMovementOrigin, CashMovementType, PaymentMethod, RepairStatus } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { canViewRepairFinancials, repairResponse } from './repair-response'
import { authOf, requirePermission } from '../../middlewares/auth'
import type { Express } from 'express'
import { includeRepair } from './repair-query'

export function registerRepairCancellationRoutes(app: Express) {
  const cancellationError = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode })
  const cancelRepairSchema = z.object({
    reviewFee: z.number().int().nonnegative().default(0),
    refundMethod: z.nativeEnum(PaymentMethod).optional(),
  })
  app.post('/api/repairs/:id/cancel', requirePermission('repairs.changeStatus'), async (req, res) => {
    const parsed = cancelRepairSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos de cancelación inválidos' })
    const auth = authOf(req)
    const repairId = String(req.params.id)
    try {
      const repair = await prisma.$transaction(async tx => {
        const current = await tx.repair.findFirst({ where: { id: repairId, businessId: auth.businessId }, include: { client: true } })
        if (!current) throw cancellationError(404, 'Reparación no encontrada')
        if (current.status === RepairStatus.CANCELLED) throw cancellationError(409, 'La reparación ya fue cancelada')
        const reviewFee = parsed.data.reviewFee
        if ((current.paid > 0 || reviewFee > 0) && !canViewRepairFinancials(auth)) throw cancellationError(403, 'No tenés permisos para liquidar pagos o devoluciones de una cancelación')
        // El saldo por revisión y la devolución nunca coexisten: el segundo depende de cuál de los dos montos es mayor.
        const refundAmount = Math.max(0, current.paid - reviewFee)
        const reviewBalance = Math.max(0, reviewFee - current.paid)
        if (refundAmount > 0 && !parsed.data.refundMethod) throw cancellationError(400, 'Indicá el medio de devolución')
        const cancelledAt = new Date()
        let refundMovementId: string | null = null
        if (refundAmount > 0) {
          const movement = await tx.cashMovement.create({ data: { businessId: current.businessId, type: CashMovementType.EXPENSE, origin: CashMovementOrigin.REPAIR, description: `Devolución por cancelación reparación #${current.number}`, amount: refundAmount, method: parsed.data.refundMethod, repairId: current.id, clientName: current.client.name } })
          refundMovementId = movement.id
        }
        const claimed = await tx.repair.updateMany({
          where: { id: current.id, businessId: auth.businessId, status: { not: RepairStatus.CANCELLED } },
          data: {
            status: RepairStatus.CANCELLED, cancelledAt,
            cancellationPaidAmount: current.paid, cancellationReviewFee: reviewFee, cancellationReviewPaid: 0, cancellationRefundAmount: refundAmount,
            cancellationRefundMethod: refundAmount > 0 ? parsed.data.refundMethod ?? null : null,
            cancellationRefundMovementId: refundMovementId, trackingEnabled: false,
          },
        })
        if (claimed.count !== 1) throw cancellationError(409, 'La reparación ya fue cancelada por otra operación')
        const settlement = reviewBalance > 0
          ? `Cancelación con saldo de revisión: abonado ${current.paid}, revisión ${reviewFee}, a cobrar ${reviewBalance}`
          : refundAmount > 0
            ? `Cancelación con devolución: abonado ${current.paid}, revisión ${reviewFee}, devuelto ${refundAmount}`
            : `Cancelación sin devolución: abonado ${current.paid}, revisión ${reviewFee}`
        await tx.repairStatusHistory.create({ data: { repairId: current.id, previousStatus: current.status, newStatus: RepairStatus.CANCELLED, internalNote: settlement, changedByUserId: auth.userId } })
        return tx.repair.findFirst({ where: { id: current.id }, include: includeRepair })
      }, { timeout: 15_000 })
      return res.json(repairResponse(authOf(req), repair))
    } catch (error) {
      const statusCode = typeof error === 'object' && error && 'statusCode' in error ? Number(error.statusCode) : 500
      return res.status(statusCode).json({ success: false, message: error instanceof Error && statusCode !== 500 ? error.message : 'No pudimos cancelar la reparación' })
    }
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
    const repair = await prisma.repair.findFirst({
      where: { id: String(req.params.id), businessId: auth.businessId },
      select: { id: true, paid: true, status: true, cancellationPaidAmount: true, _count: { select: { payments: true, parts: true, inventoryMovements: true, warrantyClaims: true, photos: true } } },
    })
    if (!repair) return res.status(404).json({ success: false, message: 'Reparación no encontrada' })
    const cashMovements = await prisma.cashMovement.count({ where: { repairId: repair.id, businessId: auth.businessId } })
    const counts = repair._count
    // Sólo se borra una orden que nunca generó actividad real: nada de dinero, stock ni garantía.
    const blockers: string[] = []
    if (repair.paid !== 0 || counts.payments > 0) blockers.push('pagos')
    if (cashMovements > 0) blockers.push('movimientos de caja')
    if (counts.parts > 0) blockers.push('repuestos usados')
    if (counts.inventoryMovements > 0) blockers.push('movimientos de stock')
    if (counts.warrantyClaims > 0) blockers.push('reclamos de garantía')
    if (counts.photos > 0) blockers.push('fotos')
    if (repair.status === RepairStatus.DELIVERED) blockers.push('fue entregada')
    if (repair.status === RepairStatus.CANCELLED && repair.cancellationPaidAmount != null) blockers.push('tiene una liquidación de cancelación')
    if (blockers.length) return res.status(409).json({ success: false, message: 'Esta reparación tiene actividad registrada. Cancelala en lugar de eliminarla para conservar el historial.', details: blockers })
    try {
      await prisma.repair.delete({ where: { id: repair.id } })
      return res.json({ success: true })
    } catch {
      return res.status(409).json({ success: false, message: 'No pudimos eliminar la reparación porque tiene registros relacionados.' })
    }
  })
}
