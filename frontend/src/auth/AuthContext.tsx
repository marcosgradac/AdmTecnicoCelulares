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

/** A rejected session is the only reason to drop the token. */
const isSessionRejected = (error: unknown) => {
  const status = (error as { response?: { status?: number } })?.response?.status
  return status === 401 || status === 403
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [connectionError, setConnectionError] = useState(false)
  const clearSession = useCallback(() => { localStorage.removeItem(TOKEN_KEY); setUser(null); setConnectionError(false) }, [])
  // Single implementation shared by the startup check and the retry button, so both agree on
  // what ends a session. A network blip or a 5xx keeps the token: the user stays signed in and
  // the retry screen explains the problem instead of bouncing them to /login.
  const restoreSession = useCallback(() => {
    if (!localStorage.getItem(TOKEN_KEY)) { setUser(null); setConnectionError(false); setLoading(false); return }
    setLoading(true); setConnectionError(false)
    void getMe().then(restored => { setUser(restored); setConnectionError(false) })
      .catch((error: unknown) => {
        if (isSessionRejected(error)) { clearSession(); return }
        setConnectionError(true)
      })
      .finally(() => setLoading(false))
  }, [clearSession])
  const retrySession = useCallback(() => restoreSession(), [restoreSession])
  useEffect(() => { restoreSession() }, [restoreSession])
  useEffect(() => {
    const expire = () => clearSession()
    window.addEventListener('cellufix:unauthorized', expire)
    return () => window.removeEventListener('cellufix:unauthorized', expire)
  }, [clearSession])
  const login = async (email: string, password: string, turnstileToken?: string) => {
    const result = await loginRequest({ email, password, turnstileToken })
    localStorage.setItem(TOKEN_KEY, result.token)
    setUser(result.user); setConnectionError(false)
    return result.user
  }
  const register = async (input: RegisterInput) => {
    const result = await registerRequest(input)
    sessionStorage.setItem('tecnodesk_trial_started', 'true')
    localStorage.setItem(TOKEN_KEY, result.token)
    setUser(result.user); setConnectionError(false)
  }
  const updateProfile = async (input: ProfileInput) => setUser(await updateProfileRequest(input))
  const refreshUser = async () => setUser(await getMe())
  const markTutorialSeen = async () => { await markTutorialSeenRequest(); setUser(current => current ? { ...current, tutorialSeen: true } : current) }
  const value = useMemo(() => ({ user, loading, login, register, updateProfile, markTutorialSeen, refreshUser, logout: clearSession, connectionError, retrySession }), [user, loading, clearSession, connectionError, retrySession])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return context
}
export const authTokenKey = TOKEN_KEY
