import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getSubscription } from './billing.api'
import type { Subscription } from './billing.types'

const Context = createContext<{ subscription: Subscription | null; loading: boolean; refresh: () => Promise<void> } | null>(null)
export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(async () => { setSubscription(await getSubscription()) }, [])
  useEffect(() => { void refresh().finally(() => setLoading(false)) }, [refresh])
  const value = useMemo(() => ({ subscription, loading, refresh }), [subscription, loading, refresh])
  return <Context.Provider value={value}>{children}</Context.Provider>
}
export const useSubscription = () => {
  const value = useContext(Context)
  if (!value) throw new Error('useSubscription requiere SubscriptionProvider')
  return value
}
