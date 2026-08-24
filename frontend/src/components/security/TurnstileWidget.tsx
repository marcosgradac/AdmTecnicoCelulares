import { useEffect, useRef } from 'react'
import { Alert, Box, Typography } from '@mui/material'
import { env } from '../../config/env'

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string
      remove: (widgetId: string) => void
    }
  }
}

let scriptPromise: Promise<void> | null = null
const loadScript = () => {
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-tecnodesk-turnstile]')
    if (existing) { existing.addEventListener('load', () => resolve(), { once: true }); existing.addEventListener('error', reject, { once: true }); return }
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.defer = true
    script.dataset.tecnodeskTurnstile = 'true'
    script.onload = () => resolve()
    script.onerror = reject
    document.head.appendChild(script)
  })
  return scriptPromise
}

export function TurnstileWidget({ onToken, resetKey = 0 }: { onToken: (token: string) => void; resetKey?: number }) {
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!env.turnstileSiteKey || !container.current) return
    let widgetId: string | undefined
    let cancelled = false
    void loadScript().then(() => {
      if (cancelled || !container.current || !window.turnstile) return
      widgetId = window.turnstile.render(container.current, {
        sitekey: env.turnstileSiteKey,
        theme: 'light',
        size: 'flexible',
        callback: (token: string) => onToken(token),
        'expired-callback': () => onToken(''),
        'error-callback': () => onToken(''),
      })
    })
    return () => { cancelled = true; if (widgetId && window.turnstile) window.turnstile.remove(widgetId) }
  }, [onToken, resetKey])

  if (!env.turnstileSiteKey) return <Alert severity="warning">La verificación de seguridad no está configurada en este entorno.</Alert>
  return <Box className="turnstile-field"><Typography variant="caption" color="text.secondary">Verificación de seguridad</Typography><div ref={container} /></Box>
}
