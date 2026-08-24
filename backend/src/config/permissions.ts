import type { UserRole } from '@prisma/client'

export const PERMISSIONS = [
  'repairs.view', 'repairs.create', 'repairs.update', 'repairs.changeStatus', 'repairs.shareTracking', 'repairs.viewFinancials',
  'clients.view', 'clients.create', 'clients.update',
  'cash.view', 'cash.create',
  'reports.view', 'reports.viewSensitive',
  'settings.access', 'settings.business.update', 'settings.repairs.update',
  'team.view', 'team.create', 'team.update', 'team.permissions.update', 'team.deactivate',
] as const

export type Permission = typeof PERMISSIONS[number]

export const DEFAULT_TECHNICIAN_PERMISSIONS: Permission[] = [
  'repairs.view', 'repairs.create', 'repairs.update', 'repairs.changeStatus', 'repairs.shareTracking',
  'clients.view', 'clients.create', 'clients.update', 'settings.access',
]

export const isPermission = (value: unknown): value is Permission =>
  typeof value === 'string' && (PERMISSIONS as readonly string[]).includes(value)

export const permissionsFor = (role: UserRole, stored: unknown): Permission[] => {
  if (role === 'OWNER') return [...PERMISSIONS]
  if (!Array.isArray(stored)) return [...DEFAULT_TECHNICIAN_PERMISSIONS]
  return stored.filter(isPermission)
}
