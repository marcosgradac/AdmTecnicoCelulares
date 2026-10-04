import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getSubscription } from './billing.api'
import type { Subscription } from './billing.types'
import { useAuth } from '../../auth/AuthContext'
import { api } from '../../services/api'

const Context = createContext<{ subscription: Subscription | null; commerceEnabled: boolean; loading: boolean; renewalMode: boolean; refresh: () => Promise<void> } | null>(null)
export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [commerceEnabled, setCommerceEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(async () => {
    try {
      if (user?.role === 'OWNER') {
        const data = await getSubscription()
        setSubscription(data)
        setCommerceEnabled(data.usage.entitlements.commerce)
      } else if (user) {
        setSubscription(null)
        setCommerceEnabled((await api.get<{ commerce: boolean }>('/billing/entitlements')).data.commerce)
      } else { setSubscription(null); setCommerceEnabled(false) }
    } catch { setSubscription(null); setCommerceEnabled(false) }
  }, [user?.id, user?.role])
  useEffect(() => { void refresh().finally(() => setLoading(false)) }, [refresh])
  // El backend responde 200 en /billing/subscription incluso con la cuenta bloqueada, así que el
  // modo renovación se decide acá con el estado real de acceso del OWNER.
  const renewalMode = user?.role === 'OWNER' && subscription?.access.status === 'BLOCKED'
  const value = useMemo(() => ({ subscription, commerceEnabled, loading, renewalMode, refresh }), [subscription, commerceEnabled, loading, renewalMode, refresh])
  return <Context.Provider value={value}>{children}</Context.Provider>
}
export const useSubscription = () => {
  const value = useContext(Context)
  if (!value) throw new Error('useSubscription requiere SubscriptionProvider')
  return value
}
