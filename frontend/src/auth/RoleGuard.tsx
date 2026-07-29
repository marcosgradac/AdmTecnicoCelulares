import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { hasRole } from './permissions'
import type { AuthUser } from '../services/auth'

export function RoleGuard({ roles, children }: { roles: AuthUser['role'][]; children: ReactNode }) {
  const { user } = useAuth()
  return hasRole(user, ...roles) ? children : <Navigate to="/inicio" replace />
}
