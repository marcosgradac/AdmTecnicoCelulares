import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getMe, login as loginRequest, markTutorialSeen as markTutorialSeenRequest, register as registerRequest, updateProfile as updateProfileRequest, type AuthUser, type ProfileInput, type RegisterInput } from '../services/auth'

const TOKEN_KEY = 'cellufix_access_token'
interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string, turnstileToken?: string) => Promise<AuthUser>
  register: (input: RegisterInput) => Promise<void>
  updateProfile: (input: ProfileInput) => Promise<void>
  markTutorialSeen: () => Promise<void>
  refreshUser: () => Promise<void>
  logout: () => void
  connectionError: boolean
  retrySession: () => void
}
const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [connectionError, setConnectionError] = useState(false)
  const logout = useCallback(() => { localStorage.removeItem(TOKEN_KEY); setUser(null); setConnectionError(false) }, [])
  const retrySession = useCallback(() => {
    if (!localStorage.getItem(TOKEN_KEY)) { setLoading(false); return }
    setLoading(true); setConnectionError(false)
    void getMe().then(setUser).catch(() => setConnectionError(true)).finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) { setLoading(false); return }
    // Only a rejected session may drop the token. A network blip or a 5xx must not log the
    // user out: the token is still valid and clearing it would interrupt real work.
    void getMe().then(setUser).catch((error: unknown) => {
      const status = (error as { response?: { status?: number } })?.response?.status
      if (status === 401 || status === 403) { logout(); return }
      // Keep the token so a retry can recover; the screen shows the connection problem.
      setConnectionError(true)
    }).finally(() => setLoading(false))
  }, [logout])
  useEffect(() => {
    const expire = () => logout()
    window.addEventListener('cellufix:unauthorized', expire)
    return () => window.removeEventListener('cellufix:unauthorized', expire)
  }, [logout])
  const login = async (email: string, password: string, turnstileToken?: string) => {
    const result = await loginRequest({ email, password, turnstileToken })
    localStorage.setItem(TOKEN_KEY, result.token); setUser(result.user)
    return result.user
  }
  const register = async (input: RegisterInput) => {
    const result = await registerRequest(input)
    sessionStorage.setItem('tecnodesk_trial_started', 'true')
    localStorage.setItem(TOKEN_KEY, result.token); setUser(result.user)
  }
  const updateProfile = async (input: ProfileInput) => setUser(await updateProfileRequest(input))
  const refreshUser = async () => setUser(await getMe())
  const markTutorialSeen = async () => { await markTutorialSeenRequest(); setUser(current => current ? { ...current, tutorialSeen: true } : current) }
  const value = useMemo(() => ({ user, loading, login, register, updateProfile, markTutorialSeen, refreshUser, logout, connectionError, retrySession }), [user, loading, logout, connectionError, retrySession])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return context
}
export const authTokenKey = TOKEN_KEY
