import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

const key = 'tecnodesk_password_recovery'
const lifetime = 30 * 60_000
type Recovery = { token: string; expiresAt: number }
// AuthProvider remounts children when identity restoration completes. Preserve the
// memory-only fallback across that remount, without persisting it beyond this page.
let memory: Recovery | null = null
let storageWriteFailed = false
const valid = (value: Recovery | null): value is Recovery => Boolean(value && typeof value.token === 'string' && value.token && Number.isFinite(value.expiresAt) && value.expiresAt > Date.now() && value.expiresAt <= Date.now() + lifetime)
const read = (): Recovery | null => {
  let stored: string | null
  try { stored = sessionStorage.getItem(key) } catch {
    if (valid(memory)) return memory
    memory = null
    return null
  }
  try {
    const value = JSON.parse(stored ?? 'null') as Recovery | null
    if (valid(value)) { memory = value; storageWriteFailed = false; return value }
    if (stored === null && storageWriteFailed && valid(memory)) return memory
    memory = null
    storageWriteFailed = false
    sessionStorage.removeItem(key)
  } catch {
    memory = null
    storageWriteFailed = false
    // Discard malformed data; unavailable storage still falls back to memory.
    try { sessionStorage.removeItem(key) } catch { /* Storage may be disabled. */ }
  }
  return null
}
const clearStored = () => { memory = null; storageWriteFailed = false; try { sessionStorage.removeItem(key) } catch { /* Storage may be disabled. */ } }

/** Keep an emailed capability out of subsequent URLs/referrers, retaining reload in this tab only. */
export function useRecoveryToken() {
  const [params, setParams] = useSearchParams()
  const incoming = params.get('token')
  const [token, setToken] = useState(() => incoming ?? read()?.token ?? '')
  useEffect(() => {
    if (incoming === null) return
    setToken(incoming)
    clearStored()
    if (incoming) {
      memory = { token: incoming, expiresAt: Date.now() + lifetime }
      try { sessionStorage.setItem(key, JSON.stringify(memory)) } catch { storageWriteFailed = true }
    }
    const cleaned = new URLSearchParams(params)
    cleaned.delete('token')
    setParams(cleaned, { replace: true })
  }, [incoming, params, setParams])
  return { token, clearToken: () => { clearStored(); setToken('') } }
}
