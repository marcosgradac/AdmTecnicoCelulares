import { PhoneScreen } from './PhoneScreen'
import { PhoneIndicators } from './phone-showcase/PhoneIndicators'
import type { PhoneScreenDefinition } from './phone-showcase/phoneShowcase.types'

export function CelluFixPhone3D({ screens, activeIndex, reducedMotion, onSelect }: {
  screens: PhoneScreenDefinition[]
  activeIndex: number
  reducedMotion: boolean
  onSelect: (index: number) => void
}) {
  return <div className="phone-stage">
    <div className="phone-shadow" />
    <div className="phone-floating-wrapper">
      <div className="phone-shell"><div className="phone-notch" /><PhoneScreen screen={screens[activeIndex]} reducedMotion={reducedMotion} /><div className="phone-shine" /></div>
      <PhoneIndicators screens={screens} activeIndex={activeIndex} onSelect={onSelect} />
    </div>
  </div>
}
