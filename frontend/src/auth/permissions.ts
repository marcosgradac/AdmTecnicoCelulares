import type { AuthUser } from '../services/auth'

export type Permission =
  | 'repairs.view' | 'repairs.create' | 'repairs.update' | 'repairs.changeStatus' | 'repairs.shareTracking' | 'repairs.viewFinancials'
  | 'clients.view' | 'clients.create' | 'clients.update' | 'cash.view' | 'cash.create'
  | 'reports.view' | 'reports.viewSensitive' | 'settings.access' | 'settings.business.update' | 'settings.repairs.update'
  | 'team.view' | 'team.create' | 'team.update' | 'team.permissions.update' | 'team.deactivate'
  | 'cash:manage' | 'payments:create'

export const hasRole = (user: AuthUser | null, ...roles: AuthUser['role'][]) =>
  Boolean(user && roles.includes(user.role))

export const canAccess = (user: AuthUser | null, permission: Permission) => {
  const normalized = permission === 'cash:manage' ? 'cash.view' : permission === 'payments:create' ? 'repairs.viewFinancials' : permission
  return Boolean(user && (user.role === 'OWNER' || user.permissions.includes(normalized)))
}
