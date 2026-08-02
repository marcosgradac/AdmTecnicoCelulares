import { useCallback, useEffect, useRef, useState } from 'react'

const ROTATION_MS = 5000
const INTERACTION_PAUSE_MS = 10000

export function usePhoneShowcase(itemCount: number) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [autoPaused, setAutoPaused] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState === 'visible')
  const lastInteractionAt = useRef(0)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateMotion = () => setReducedMotion(media.matches)
    updateMotion()
    media.addEventListener('change', updateMotion)
    return () => media.removeEventListener('change', updateMotion)
  }, [])

  useEffect(() => {
    const updateVisibility = () => setPageVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', updateVisibility)
    return () => document.removeEventListener('visibilitychange', updateVisibility)
  }, [])

  useEffect(() => {
    if (!autoPaused) return
    const timer = window.setTimeout(() => setAutoPaused(false), INTERACTION_PAUSE_MS)
    return () => window.clearTimeout(timer)
  }, [autoPaused])

  useEffect(() => {
    if (itemCount < 2 || reducedMotion || !pageVisible || autoPaused) return
    const timer = window.setTimeout(() => {
      if (Date.now() - lastInteractionAt.current < INTERACTION_PAUSE_MS) return
      setActiveIndex(current => (current + 1) % itemCount)
    }, ROTATION_MS)
    return () => window.clearTimeout(timer)
  }, [activeIndex, autoPaused, itemCount, pageVisible, reducedMotion])

  const select = useCallback((index: number) => {
    lastInteractionAt.current = Date.now()
    setActiveIndex(index)
    setAutoPaused(true)
  }, [])

  return { activeIndex, reducedMotion, select }
}
