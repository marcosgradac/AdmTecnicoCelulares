import { useEffect, useRef, useState } from 'react'
import { WhatsApp } from '@mui/icons-material'
import { SOCIAL_LINKS } from '../../../config/socialLinks'

// Contenido que el boton flotante no debe tapar en mobile: badges de plan,
// botones, CTA final y enlaces del footer. Solo aplica <=600px.
const CRITICAL_SELECTORS = [
  '.billing-plan-badge',
  '.billing-plan-card a',
  '.billing-plan-card button',
  '.final-cta a',
  '.final-cta button',
  '.landing-footer a',
  '.landing-footer button',
]

export function FloatingWhatsApp() {
  const ref = useRef<HTMLAnchorElement | null>(null)
  const [dodging, setDodging] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const narrow = window.matchMedia('(max-width: 600px)')

    let frame = 0
    const evaluate = () => {
      frame = 0
      if (!narrow.matches) { setDodging(false); return }
      const box = el.getBoundingClientRect()
      // Si el boton quedo fuera del viewport no hay nada que esquivar.
      if (box.bottom < 0 || box.top > window.innerHeight) return
      const clash = CRITICAL_SELECTORS.some(sel =>
        [...document.querySelectorAll(sel)].some(node => {
          const r = node.getBoundingClientRect()
          if (r.width === 0 || r.height === 0) return false
          return r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top
        }),
      )
      setDodging(prev => (prev === clash ? prev : clash))
    }
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(evaluate) }

    evaluate()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [])

  return <a ref={ref} className={`floating-whatsapp${dodging ? ' is-dodging' : ''}`} href={SOCIAL_LINKS.whatsapp.salesUrl} target="_blank" rel="noopener noreferrer" aria-label="Contactar TecnoDesk por WhatsApp"><WhatsApp/><span>¿Necesitás ayuda?</span></a>
}

