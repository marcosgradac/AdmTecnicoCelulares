import type { AuthUser } from '../services/auth'

export type Permission =
  | 'team:manage'
  | 'cash:manage'
  | 'reports:view'
  | 'payments:create'

const ownerPermissions: Permission[] = ['team:manage', 'cash:manage', 'reports:view', 'payments:create']

export const hasRole = (user: AuthUser | null, ...roles: AuthUser['role'][]) =>
  Boolean(user && roles.includes(user.role))

export const canAccess = (user: AuthUser | null, permission: Permission) =>
  Boolean(user && (user.role === 'OWNER' ? ownerPermissions.includes(permission) : false))
