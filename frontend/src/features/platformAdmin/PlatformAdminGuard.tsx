import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
export function PlatformAdminGuard({children}:{children:ReactNode}){const{user}=useAuth();return user?.platformRole==='SUPER_ADMIN'?children:<Navigate to="/admin" replace/>}
