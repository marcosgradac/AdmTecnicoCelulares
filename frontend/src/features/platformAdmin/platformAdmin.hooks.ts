import { useCallback, useEffect, useRef, useState } from 'react'
import axios from 'axios'

export interface ResourceState<T> { data: T | null; loading: boolean; error: string }

export const apiErrorMessage = (error: unknown, fallback = 'No pudimos cargar la información.') => {
  if (axios.isAxiosError<{ message?: string }>(error)) return error.response?.data?.message ?? fallback
  return error instanceof Error && error.message ? error.message : fallback
}

/** Carga un recurso del panel manteniendo separados los estados de carga, error y datos.
 *  Al cambiar de key se descartan los datos anteriores; al recargar la misma key se conservan mientras refresca. */
export function usePlatformResource<T>(load: () => Promise<T>, key: string, enabled = true) {
  const [state, setState] = useState<ResourceState<T>>({ data: null, loading: enabled, error: '' })
  const [tick, setTick] = useState(0)
  const loadRef = useRef(load)
  loadRef.current = load
  const keyRef = useRef(key)
  useEffect(() => {
    if (!enabled) return
    let active = true
    const keyChanged = keyRef.current !== key
    keyRef.current = key
    setState(current => ({ data: keyChanged ? null : current.data, loading: true, error: '' }))
    loadRef.current()
      .then(data => { if (active) setState({ data, loading: false, error: '' }) })
      .catch(error => { if (active) setState({ data: null, loading: false, error: apiErrorMessage(error) }) })
    return () => { active = false }
  }, [key, enabled, tick])
  const reload = useCallback(() => setTick(value => value + 1), [])
  const replace = useCallback((data: T | null) => setState({ data, loading: false, error: '' }), [])
  return { ...state, reload, replace }
}

/** Estado compartido para las acciones del panel: guardando, éxito y error. */
export function usePlatformAction() {
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const run = useCallback(async (action: () => Promise<unknown>, success: string) => {
    setSaving(true); setError(''); setMessage('')
    try { await action(); setMessage(success); return true }
    catch (actionError) { setError(apiErrorMessage(actionError, 'No pudimos completar la acción.')); return false }
    finally { setSaving(false) }
  }, [])
  const clear = useCallback(() => { setMessage(''); setError('') }, [])
  return { saving, message, error, run, clear }
}
