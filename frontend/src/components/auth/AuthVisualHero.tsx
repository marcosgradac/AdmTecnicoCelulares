import { BuildRounded } from '@mui/icons-material'
import { CelluFixPhone3D } from './CelluFixPhone3D'
import { FloatingActivityCards } from './FloatingActivityCards'
import type { AuthVisualVariant } from './auth-visual.types'
import './auth-visual.scss'
export default function AuthVisualHero({ variant }: { variant: AuthVisualVariant }) {
  return <section className="auth-hero" aria-hidden="true"><div className="hero-grid" /><div className="hero-orb" />
    <header className="hero-brand"><i><BuildRounded /></i><span><b>CelluFix</b><small>Gestión técnica inteligente</small></span></header>
    <div className="hero-composition"><CelluFixPhone3D variant={variant} /><FloatingActivityCards variant={variant} /></div>
    <footer><b>Tu servicio técnico, siempre conectado.</b><span>Reparaciones, clientes y stock en un solo lugar.</span></footer>
  </section>
}
