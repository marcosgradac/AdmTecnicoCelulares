import { BuildRounded } from '@mui/icons-material'
import { CelluFixPhone3D } from './CelluFixPhone3D'
import { FloatingActivityCards } from './FloatingActivityCards'
import type { AuthVisualVariant } from './auth-visual.types'
import { phoneShowcaseConfig } from './phone-showcase/phoneShowcase.data'
import { usePhoneShowcase } from '../../hooks/usePhoneShowcase'
import './auth-visual.scss'
export default function AuthVisualHero({ variant }: { variant: AuthVisualVariant }) {
  const screens = phoneShowcaseConfig[variant]
  const { activeIndex, reducedMotion, select } = usePhoneShowcase(screens.length)
  const activeScreen = screens[activeIndex]

  return <section className="auth-hero"><div className="hero-grid" aria-hidden="true" /><div className="hero-orb" aria-hidden="true" />
    <header className="hero-brand"><i><BuildRounded /></i><span><b>CelluFix</b><small>Gestión técnica inteligente</small></span></header>
    <div className="hero-composition"><CelluFixPhone3D screens={screens} activeIndex={activeIndex} reducedMotion={reducedMotion} onSelect={select} /><FloatingActivityCards variant={variant} activeKind={activeScreen.kind} /></div>
    <footer><b>Tu servicio técnico, siempre conectado.</b><span>Reparaciones, clientes y stock en un solo lugar.</span></footer>
  </section>
}
