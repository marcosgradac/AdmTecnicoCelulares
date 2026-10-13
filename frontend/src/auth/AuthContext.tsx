import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getMe, login as loginRequest, markTutorialSeen as markTutorialSeenRequest, register as registerRequest, updateProfile as updateProfileRequest, updateThemePreference as updateThemePreferenceRequest, type ThemePreference, type AuthUser, type ProfileInput, type RegisterInput } from '../services/auth'

const TOKEN_KEY = 'cellufix_access_token'
interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  sessionRevision: number
  login: (email: string, password: string, turnstileToken?: string) => Promise<AuthUser>
  register: (input: RegisterInput) => Promise<void>
  updateProfile: (input: ProfileInput) => Promise<void>
  updateThemePreference: (preference: ThemePreference) => Promise<void>
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
  const sessionGeneration = useRef(0)
  const themeMutationRevision = useRef(0)
  const sessionRevision = sessionGeneration.current
  const isCurrentSession = useCallback((generation: number, token: string | null) =>
    generation === sessionGeneration.current && token !== null && localStorage.getItem(TOKEN_KEY) === token, [])
  // Keep fresh profile/permission fields while a read begun before a theme write
  // cannot replace that write's preference with its older snapshot.
  const applyUserRead = useCallback((restored: AuthUser, generation: number, token: string | null, revision: number) => {
    setUser(current => {
      if (!isCurrentSession(generation, token)) return current
      return current?.id === restored.id && revision !== themeMutationRevision.current
        ? { ...restored, themePreference: current.themePreference } : restored
    })
  }, [isCurrentSession])
  const clearSession = useCallback(() => {
    sessionGeneration.current += 1
    localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem('tecnodesk_trial_started')
    setUser(null); setConnectionError(false); setLoading(false)
  }, [])
  // Single implementation shared by the startup check and the retry button, so both agree on
  // what ends a session. A network blip or a 5xx keeps the token: the user stays signed in and
  // the retry screen explains the problem instead of bouncing them to /login.
  const restoreSession = useCallback(() => {
    const token = localStorage.getItem(TOKEN_KEY), generation = sessionGeneration.current, revision = themeMutationRevision.current
    if (!token) { setUser(null); setConnectionError(false); setLoading(false); return }
    setLoading(true); setConnectionError(false)
    void getMe().then(restored => { if (isCurrentSession(generation, token)) { applyUserRead(restored, generation, token, revision); setConnectionError(false) } })
      .catch((error: unknown) => {
        if (!isCurrentSession(generation, token)) return
        if (isSessionRejected(error)) { clearSession(); return }
        setConnectionError(true)
      })
      .finally(() => { if (generation === sessionGeneration.current) setLoading(false) })
  }, [clearSession, isCurrentSession, applyUserRead])
  const retrySession = useCallback(() => restoreSession(), [restoreSession])
  useEffect(() => { restoreSession() }, [restoreSession])
  useEffect(() => {
    const expire = () => clearSession()
    const syncSession = (event: StorageEvent) => {
      if (event.storageArea !== localStorage || (event.key !== TOKEN_KEY && event.key !== null)) return
      // Read current storage, not a possibly stale event from a previous login.
      if (!localStorage.getItem(TOKEN_KEY)) { clearSession(); return }
      sessionGeneration.current += 1
      setUser(null)
      restoreSession()
    }
    window.addEventListener('cellufix:unauthorized', expire)
    window.addEventListener('storage', syncSession)
    return () => { window.removeEventListener('cellufix:unauthorized', expire); window.removeEventListener('storage', syncSession) }
  }, [clearSession, restoreSession])
  const login = async (email: string, password: string, turnstileToken?: string) => {
    const generation = ++sessionGeneration.current
    const result = await loginRequest({ email, password, turnstileToken })
    if (generation !== sessionGeneration.current) throw new Error('La sesión cambió. Volvé a iniciar sesión.')
    localStorage.setItem(TOKEN_KEY, result.token)
    setUser(result.user); setConnectionError(false)
    return result.user
  }
  const register = async (input: RegisterInput) => {
    const generation = ++sessionGeneration.current
    const result = await registerRequest(input)
    if (generation !== sessionGeneration.current) throw new Error('La sesión cambió. Volvé a iniciar sesión.')
    sessionStorage.setItem('tecnodesk_trial_started', 'true')
    localStorage.setItem(TOKEN_KEY, result.token)
    setUser(result.user); setConnectionError(false)
  }
  const updateProfile = async (input: ProfileInput) => {
    const token = localStorage.getItem(TOKEN_KEY), generation = sessionGeneration.current
    const revision = themeMutationRevision.current
    const updated = await updateProfileRequest(input)
    if (isCurrentSession(generation, token)) applyUserRead(updated, generation, token, revision)
  }
  const updateThemePreference = async (preference: ThemePreference) => {
    const token = localStorage.getItem(TOKEN_KEY), generation = sessionGeneration.current, userId = user?.id
    if (!token || !userId) throw new Error('La sesión cambió. Volvé a iniciar sesión.')
    themeMutationRevision.current += 1
    const updated = await updateThemePreferenceRequest(preference)
    if (!isCurrentSession(generation, token)) throw new Error('La sesión cambió. Volvé a iniciar sesión.')
    themeMutationRevision.current += 1
    if (isCurrentSession(generation, token)) {
      setUser(current => isCurrentSession(generation, token) && current?.id === userId
        ? { ...current, themePreference: updated.themePreference } : current)
    }
  }
  const refreshUser = async () => {
    const token = localStorage.getItem(TOKEN_KEY), generation = sessionGeneration.current
    const revision = themeMutationRevision.current
    const restored = await getMe()
    if (isCurrentSession(generation, token)) applyUserRead(restored, generation, token, revision)
  }
  const markTutorialSeen = async () => {
    const token = localStorage.getItem(TOKEN_KEY), generation = sessionGeneration.current
    await markTutorialSeenRequest()
    if (isCurrentSession(generation, token)) setUser(current => current ? { ...current, tutorialSeen: true } : current)
  }
  const value = useMemo(() => ({ user, loading, sessionRevision, login, register, updateProfile, updateThemePreference, markTutorialSeen, refreshUser, logout: clearSession, connectionError, retrySession }), [user, loading, sessionRevision, clearSession, connectionError, retrySession])
  // A different account must not inherit mounted components containing the old account's data.
  return <AuthContext.Provider value={value}><Fragment key={user?.id ?? 'signed-out'}>{children}</Fragment></AuthContext.Provider>
}
export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return context
}
export const authTokenKey = TOKEN_KEY
