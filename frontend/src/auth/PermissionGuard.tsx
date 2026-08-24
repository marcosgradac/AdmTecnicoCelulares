import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { canAccess, firstAllowedPath, type Permission } from './permissions'

export function PermissionGuard({ permission, ownerOnly = false, children }: { permission?: Permission; ownerOnly?: boolean; children: ReactNode }) {
  const { user } = useAuth()
  const allowed = ownerOnly ? user?.role === 'OWNER' : permission ? canAccess(user, permission) : true
  return allowed ? children : <Navigate to={firstAllowedPath(user)} replace />
}
