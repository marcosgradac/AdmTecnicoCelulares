import type { AuthData } from '../../middlewares/auth'

export const canViewRepairFinancials = (auth: AuthData) =>
  auth.role === 'OWNER' || Boolean(auth.permissions?.includes('repairs.viewFinancials'))

// These events contain the old and new advance amounts, not an operational status change.
export const repairHistoryResponse = <T extends { internalNote?: string | null }>(auth: AuthData, history: T[]) =>
  canViewRepairFinancials(auth) ? history : history.filter(item => !item.internalNote?.startsWith('Adelanto corregido de $'))

/** HTTP boundary only: never mutate the model used by transactions/calculations.
 * Total, paid and cancellation summary amounts are operational in the existing UI.
 */
export function repairResponse<T extends object>(auth: AuthData, repair: T | null) {
  if (!repair || canViewRepairFinancials(auth)) return repair
  const result = { ...repair } as Record<string, unknown>
  for (const field of ['partsCost', 'laborCost', 'laborCharge', 'initialCostMovementId', 'payments', 'cancellationRefundMethod', 'cancellationRefundMovementId']) delete result[field]
  if (Array.isArray(result.statusHistory)) result.statusHistory = repairHistoryResponse(auth, result.statusHistory)
  return result
}

// ClientDetailPage only consumes this operational summary, regardless of role.
export const clientRepairSelect = {
  id: true, number: true, total: true, paid: true, createdAt: true, updatedAt: true,
  deviceBrand: true, deviceModel: true, issue: true, status: true,
} as const
