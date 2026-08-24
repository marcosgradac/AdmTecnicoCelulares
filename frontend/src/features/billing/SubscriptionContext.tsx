import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getSubscription } from './billing.api'
import type { Subscription } from './billing.types'
import { useAuth } from '../../auth/AuthContext'

const Context = createContext<{ subscription: Subscription | null; loading: boolean; refresh: () => Promise<void> } | null>(null)
export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(async () => { if (user?.role === 'OWNER') setSubscription(await getSubscription()); else setSubscription(null) }, [user?.role])
  useEffect(() => { void refresh().finally(() => setLoading(false)) }, [refresh])
  const value = useMemo(() => ({ subscription, loading, refresh }), [subscription, loading, refresh])
  return <Context.Provider value={value}>{children}</Context.Provider>
}
export const useSubscription = () => {
  const value = useContext(Context)
  if (!value) throw new Error('useSubscription requiere SubscriptionProvider')
  return value
}
