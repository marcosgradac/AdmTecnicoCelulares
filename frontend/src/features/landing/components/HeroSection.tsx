import { Link } from 'react-router-dom'
import { Button } from '@mui/material'
import { ArrowForwardRounded, PlayCircleOutlineRounded } from '@mui/icons-material'
import { useAuth } from '../../../auth/AuthContext'
import { HeroVisual } from './hero/HeroVisual'
import './hero/hero.scss'

export function HeroSection() {
  const { user } = useAuth()
  return <section className="landing-hero premium-hero" aria-labelledby="hero-title">
    <div className="hero-orb hero-orb--violet" aria-hidden/><div className="hero-orb hero-orb--blue" aria-hidden/><div className="hero-grid-pattern" aria-hidden/>
    <div className="landing-container hero-content hero-grid">
      <div className="hero-copy"><span className="hero-kicker"><i/> La forma más clara de gestionar tu taller</span><h1 id="hero-title">Cada reparación, <em>bajo control.</em></h1><p>Centralizá clientes, equipos, stock y cobros. Mantené a cada cliente informado mientras vos te enfocás en reparar.</p><div className="hero-actions"><Button component={Link} to={user?'/admin':'/registro'} size="large" variant="contained" endIcon={<ArrowForwardRounded/>}>{user?'Ir al panel':'Empezar gratis'}</Button><Button component="a" href="#como-funciona" size="large" variant="text" startIcon={<PlayCircleOutlineRounded/>}>Ver cómo funciona</Button></div><div className="hero-trust" aria-label="Beneficios principales"><span><i>✓</i> Sin tarjeta</span><span><i>✓</i> Listo en minutos</span><span><i>✓</i> Soporte local</span></div></div>
      <HeroVisual/>
    </div>
  </section>
}
