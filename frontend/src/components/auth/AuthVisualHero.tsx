import { CelluFixPhone3D } from './CelluFixPhone3D'
import { FloatingActivityCards } from './FloatingActivityCards'
import type { AuthVisualVariant } from './auth-visual.types'
import { phoneShowcaseConfig } from './phone-showcase/phoneShowcase.data'
import { usePhoneShowcase } from '../../hooks/usePhoneShowcase'
import './auth-visual.scss'
import './auth-brand.scss'
export default function AuthVisualHero({ variant }: { variant: AuthVisualVariant }) {
  const screens = phoneShowcaseConfig[variant]
  const { activeIndex, reducedMotion, select } = usePhoneShowcase(screens.length)
  const activeScreen = screens[activeIndex]

  return <section className="auth-hero"><div className="hero-grid" aria-hidden="true" /><div className="hero-orb" aria-hidden="true" />
    <div className="hero-composition"><CelluFixPhone3D screens={screens} activeIndex={activeIndex} reducedMotion={reducedMotion} onSelect={select} /><FloatingActivityCards variant={variant} activeKind={activeScreen.kind} /></div>
    <footer><b>Tu servicio técnico, siempre conectado.</b><span>Clientes, reparaciones y pagos en un solo lugar.</span></footer>
  </section>
}
