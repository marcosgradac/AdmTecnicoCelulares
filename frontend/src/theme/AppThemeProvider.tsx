import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Alert, Snackbar, ThemeProvider } from '@mui/material'
import { useAuth, authTokenKey } from '../auth/AuthContext'
import { normalizeThemePreference, type ThemePreference } from '../services/auth'
import { createAppTheme } from './theme'

const CACHE_KEY = 'tecnodesk_theme_session'
function tokenHint(token: string) { let hash = 2166136261; for (let i = 0; i < token.length; i++) hash = Math.imul(hash ^ token.charCodeAt(i), 16777619); return (hash >>> 0).toString(16) }
const systemDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
function cachedPreference(): ThemePreference {
  try { const token = localStorage.getItem(authTokenKey), cache = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); return token && cache?.tokenHint === tokenHint(token) ? normalizeThemePreference(cache.preference) : 'SYSTEM' } catch { return 'SYSTEM' }
}
interface ThemeContextValue { preference: ThemePreference; mode: 'light' | 'dark'; saving: boolean; setPreference: (value: ThemePreference) => Promise<void> }
const ThemeContext = createContext<ThemeContextValue | null>(null)
export function AppThemeProvider({ children }: { children: ReactNode }) {
  const { user, loading, updateThemePreference, refreshUser, sessionRevision } = useAuth()
  const [preference, setPreferenceState] = useState<ThemePreference>(() => user ? normalizeThemePreference(user.themePreference) : cachedPreference())
  const [darkSystem, setDarkSystem] = useState(systemDark), [saving, setSaving] = useState(false), [error, setError] = useState('')
  const mounted = useRef(true), writing = useRef(false), confirmed = useRef(preference)
  const identity = user ? user.id + ':' + (localStorage.getItem(authTokenKey) || '') + ':' + sessionRevision : null
  const identityRef = useRef(identity); identityRef.current = identity
  const previousIdentity = useRef(identity), operation = useRef(0), pendingSync = useRef(false)
  useEffect(() => {
    if (previousIdentity.current !== identity) { previousIdentity.current = identity; operation.current++; writing.current = false; pendingSync.current = false; setSaving(false); setError('') }
  }, [identity])
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { const query = window.matchMedia?.('(prefers-color-scheme: dark)'); if (!query) return; const change = () => setDarkSystem(query.matches); query.addEventListener('change', change); change(); return () => query.removeEventListener('change', change) }, [])
  useEffect(() => {
    if (loading && !user) return
    const value = user ? normalizeThemePreference(user.themePreference) : 'SYSTEM'
    confirmed.current = value
    if (!writing.current) setPreferenceState(value)
    try {
      const token = localStorage.getItem(authTokenKey)
      if (user && token) localStorage.setItem(CACHE_KEY, JSON.stringify({ owner: user.id, tokenHint: tokenHint(token), preference: value }))
      else localStorage.removeItem(CACHE_KEY)
    } catch { /* Storage restrictions do not prevent server persistence. */ }
  }, [user?.id, user?.themePreference, loading, identity])
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== CACHE_KEY || !user) return
      try { const cache = JSON.parse(event.newValue || 'null'); if (cache?.owner === user.id) { if (writing.current) pendingSync.current = true; else void refreshUser().catch(() => {}) } } catch { /* Ignore malformed visual cache. */ }
    }
    window.addEventListener('storage', sync); return () => window.removeEventListener('storage', sync)
  }, [user?.id, refreshUser])
  const mode = preference === 'DARK' || (preference === 'SYSTEM' && darkSystem) ? 'dark' : 'light'
  useLayoutEffect(() => { document.documentElement.dataset.theme = mode; document.documentElement.style.colorScheme = mode; document.documentElement.style.backgroundColor = mode === 'dark' ? '#0D111B' : '#F8F9FC'; const meta = document.querySelector('meta[name="theme-color"]'); meta?.setAttribute('content', mode === 'dark' ? '#0D111B' : '#075CFF') }, [mode])
  const theme = useMemo(() => createAppTheme(mode), [mode])
  const setPreference = async (value: ThemePreference) => {
    if (!user || writing.current) return
    const requestIdentity = identityRef.current, previous = confirmed.current, requestOperation = ++operation.current
    writing.current = true; setSaving(true); setError(''); setPreferenceState(value)
    try {
      await updateThemePreference(value)
      if (mounted.current && identityRef.current === requestIdentity && operation.current === requestOperation) {
        confirmed.current = value
        try { const token = localStorage.getItem(authTokenKey); if (token) localStorage.setItem(CACHE_KEY, JSON.stringify({ owner: user.id, tokenHint: tokenHint(token), preference: value })) } catch { /* Cache is optional. */ }
      }
    } catch {
      if (mounted.current && identityRef.current === requestIdentity && operation.current === requestOperation) { setPreferenceState(previous); setError('No pudimos guardar la apariencia. Restauramos tu preferencia anterior.') }
    } finally { if (mounted.current && identityRef.current === requestIdentity && operation.current === requestOperation) { writing.current = false; setSaving(false); if (pendingSync.current) { pendingSync.current = false; await refreshUser().catch(() => {}) } } }
  }
  return <ThemeContext.Provider value={{ preference, mode, saving, setPreference }}><ThemeProvider theme={theme}>{children}<Snackbar open={Boolean(error)} autoHideDuration={6000} onClose={() => setError('')}><Alert severity="warning" onClose={() => setError('')}>{error}</Alert></Snackbar></ThemeProvider></ThemeContext.Provider>
}
export function useAppTheme() { const value = useContext(ThemeContext); if (!value) throw new Error('AppThemeProvider requerido'); return value }
