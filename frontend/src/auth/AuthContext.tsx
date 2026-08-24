import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getMe, login as loginRequest, register as registerRequest, updateProfile as updateProfileRequest, type AuthUser, type ProfileInput, type RegisterInput } from '../services/auth'

const TOKEN_KEY = 'cellufix_access_token'
interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<AuthUser>
  register: (input: RegisterInput) => Promise<void>
  updateProfile: (input: ProfileInput) => Promise<void>
  logout: () => void
}
const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const logout = useCallback(() => { localStorage.removeItem(TOKEN_KEY); setUser(null) }, [])
  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) { setLoading(false); return }
    void getMe().then(setUser).catch(logout).finally(() => setLoading(false))
  }, [logout])
  useEffect(() => {
    const expire = () => logout()
    window.addEventListener('cellufix:unauthorized', expire)
    return () => window.removeEventListener('cellufix:unauthorized', expire)
  }, [logout])
  const login = async (email: string, password: string) => {
    const result = await loginRequest({ email, password })
    localStorage.setItem(TOKEN_KEY, result.token); setUser(result.user)
    return result.user
  }
  const register = async (input: RegisterInput) => {
    const result = await registerRequest(input)
    sessionStorage.setItem('tecnodesk_trial_started', 'true')
    localStorage.setItem(TOKEN_KEY, result.token); setUser(result.user)
  }
  const updateProfile = async (input: ProfileInput) => setUser(await updateProfileRequest(input))
  const value = useMemo(() => ({ user, loading, login, register, updateProfile, logout }), [user, loading, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return context
}
export const authTokenKey = TOKEN_KEY
