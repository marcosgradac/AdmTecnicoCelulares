import type { PhoneScreenDefinition } from './phoneShowcase.types'

export function PhoneIndicators({ screens, activeIndex, onSelect }: {
  screens: PhoneScreenDefinition[]
  activeIndex: number
  onSelect: (index: number) => void
}) {
  return <div className="phone-indicators" aria-label="Vistas de ejemplo">
    {screens.map((screen, index) => <button type="button" className={index === activeIndex ? 'active' : ''} aria-label={`Mostrar ${screen.indicatorLabel}`} aria-pressed={index === activeIndex} onClick={() => onSelect(index)} key={screen.id} />)}
  </div>
}
