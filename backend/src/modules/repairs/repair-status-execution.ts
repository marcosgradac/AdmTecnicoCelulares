import { type Response } from 'express'
import { z } from 'zod'
import { RepairStatus } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { statusError } from './repair-status'
import { claimRepairStatusTransition } from './repair-status-transition'
import { authOf } from '../../middlewares/auth'
import { includeRepair } from './repair-query'

export const statusMessagesSchema = z.object({ publicMessage: z.string().trim().max(500).optional(), internalNote: z.string().trim().max(1000).optional() })
export const statusFailure = (res: Response, error: unknown, fallback: string) => {
  const statusCode = typeof error === 'object' && error && 'statusCode' in error ? Number(error.statusCode) : 500
  if (statusCode >= 500) return res.status(statusCode).json({ success: false, message: fallback })
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : undefined
  return res.status(statusCode).json({ success: false, ...(code ? { code } : {}), message: error instanceof Error ? error.message : fallback })
}
/** Una ejecución canónica para el estado explícito, los pasos y las rutas legacy. */
export const executeStatusChange = (
  auth: ReturnType<typeof authOf>,
  repairId: string,
  target: RepairStatus | ((current: RepairStatus) => RepairStatus),
  messages: z.infer<typeof statusMessagesSchema>,
) => prisma.$transaction(async tx => {
  const current = await tx.repair.findFirst({ where: { id: repairId, businessId: auth.businessId } })
  if (!current) throw statusError(404, 'Reparación no encontrada')
  await claimRepairStatusTransition(tx, current, typeof target === 'function' ? target(current.status) : target, messages, auth.userId)
  return tx.repair.findUniqueOrThrow({ where: { id: current.id }, include: includeRepair })
}, { timeout: 15_000 })
