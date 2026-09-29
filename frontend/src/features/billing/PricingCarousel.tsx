import { useEffect, useId, useRef, useState } from 'react'
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded'
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded'
import { PlanCards } from './PlanCards'
import type { Plan, PlanCode } from './billing.types'

/** Presentación móvil de los mismos planes; en desktop conserva la grilla. */
export function PricingCarousel({ plans, actionLabel, onSelect }: {
  plans: Plan[]
  actionLabel: string
  onSelect: (code: PlanCode) => void
}) {
  const viewport = useRef<HTMLDivElement>(null)
  const id = useId()
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    const element = viewport.current
    if (!element) return
    let frame = 0
    const update = () => {
      frame = 0
      const box = element.getBoundingClientRect()
      const center = box.left + box.width / 2
      const cards = [...element.querySelectorAll('.billing-plan-card')]
      let closest = 0
      let distance = Infinity
      cards.forEach((card, index) => {
        const rect = card.getBoundingClientRect()
        const nextDistance = Math.abs(rect.left + rect.width / 2 - center)
        if (nextDistance < distance) { closest = index; distance = nextDistance }
      })
      setActiveIndex(closest)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
    element.addEventListener('scroll', schedule, { passive: true })
    const observer = new ResizeObserver(schedule)
    observer.observe(element)
    update()
    return () => {
      element.removeEventListener('scroll', schedule)
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [plans])

  const goTo = (index: number) => {
    const element = viewport.current
    const card = element?.querySelectorAll('.billing-plan-card')[index]
    if (!element || !card) return
    const box = element.getBoundingClientRect()
    const rect = card.getBoundingClientRect()
    element.scrollBy({
      left: rect.left + rect.width / 2 - box.left - box.width / 2,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    })
  }

  return <div className="pricing-carousel" data-active-plan={activeIndex}>
    <div ref={viewport} id={id} className="pricing-carousel__viewport" role="region" aria-label="Planes disponibles" tabIndex={0}>
      <PlanCards plans={plans} actionLabel={actionLabel} onSelect={onSelect} />
    </div>
    <div className="pricing-carousel__controls" role="group" aria-label="Navegación de planes">
      <button type="button" aria-label="Plan anterior" aria-controls={id} disabled={activeIndex === 0} onClick={() => goTo(activeIndex - 1)}><ChevronLeftRounded /></button>
      <div className="pricing-carousel__dots">
        {plans.map((plan, index) => <button key={plan.code} type="button" aria-label={`Ver plan ${plan.name}`} aria-controls={id} aria-current={activeIndex === index ? 'true' : undefined} onClick={() => goTo(index)}><span /></button>)}
      </div>
      <button type="button" aria-label="Plan siguiente" aria-controls={id} disabled={activeIndex === plans.length - 1} onClick={() => goTo(activeIndex + 1)}><ChevronRightRounded /></button>
    </div>
  </div>
}
