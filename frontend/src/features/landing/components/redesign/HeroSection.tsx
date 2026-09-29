import { Link } from 'react-router-dom'
import { Button } from '@mui/material'
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded'
import KeyboardArrowDownRounded from '@mui/icons-material/KeyboardArrowDownRounded'
import { useAuth } from '../../../../auth/AuthContext'
import { ProductScreenshot, productShots } from './ProductScreenshot'
import { FeaturePills } from './FeaturePills'

export function HeroSection() {
  const { user } = useAuth()
  return <section className="landing-hero redesign-hero" aria-labelledby="hero-title">
    <div className="hero-orb hero-orb--blue" aria-hidden="true" />
    <div className="hero-orb hero-orb--violet" aria-hidden="true" />

    <div className="landing-container hero-grid redesign-hero__grid">
      <div className="hero-copy">
        <span className="hero-trial">1 MES GRATIS</span>
        <h1 id="hero-title">Gestioná todo tu servicio técnico <em>desde un solo lugar.</em></h1>
        <p>Reparaciones, clientes, cobros, garantías, ventas y equipo. Todo organizado para que te enfoques en tu taller.</p>
        <div className="hero-actions">
          <Button component={Link} to={user ? '/admin' : '/register'} size="large" variant="contained" endIcon={<ArrowForwardRounded />}>{user ? 'Ir al panel' : 'Empezar gratis'}</Button>
          <Button className="hero-secondary-action" component="a" href="#reparaciones" size="large" variant="text" startIcon={<KeyboardArrowDownRounded />}>Ver funciones</Button>
        </div>
        <p className="hero-trial-note">30 días con acceso completo · Sin tarjeta</p>
        <div className="hero-trust" aria-label="Beneficios de la prueba gratuita">
          <span><i>✓</i> 30 días gratis</span><span><i>✓</i> Sin tarjeta</span><span><i>✓</i> Listo en minutos</span>
        </div>
      </div>

      <div className="hero-visual">
        <div className="hero-visual__halo" aria-hidden="true" />
        <ProductScreenshot shot={productShots.dashboardDesktop} priority className="hero-visual__shot" />
        <div className="hero-visual__phone">
          <span className="hero-visual__notch" aria-hidden="true" />
          <img src={productShots.dashboardMobile.src} alt={productShots.dashboardMobile.alt} width={430} height={900} loading="eager" decoding="async" />
        </div>
      </div>
    </div>

    <div className="landing-container"><FeaturePills /></div>
  </section>
}
