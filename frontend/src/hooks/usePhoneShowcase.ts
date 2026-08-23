import { useCallback, useEffect, useState } from 'react'

const ROTATION_MS = 3000

export function usePhoneShowcase(itemCount: number) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState === 'visible')

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
    if (itemCount < 2 || !pageVisible) return
    const timer = window.setInterval(() => {
      setActiveIndex(current => (current + 1) % itemCount)
    }, ROTATION_MS)
    return () => window.clearInterval(timer)
  }, [itemCount, pageVisible])

  const select = useCallback((index: number) => {
    setActiveIndex(index)
  }, [])

  return { activeIndex, reducedMotion, select }
}
