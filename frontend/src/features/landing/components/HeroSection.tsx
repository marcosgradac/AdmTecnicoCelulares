import { Link } from 'react-router-dom'
import { Button } from '@mui/material'
import { ArrowForwardRounded, PlayCircleOutlineRounded } from '@mui/icons-material'
import { useAuth } from '../../../auth/AuthContext'
import { ProductMockup } from './ProductMockup'
export function HeroSection(){
 const {user}=useAuth()
 return <section className="landing-hero"><div className="hero-background hero-glow" aria-hidden/><div className="landing-container hero-content hero-grid">
  <div className="hero-copy"><span className="eyebrow">GESTIÓN PARA SERVICIOS TÉCNICOS</span><h1>Administrá tus reparaciones <em>sin perder el control</em></h1><p>Registrá equipos, organizá reparaciones, controlá pagos y compartí con cada cliente un enlace para seguir el estado de su celular.</p><div className="hero-actions"><Button component={Link} to={user?'/admin':'/registro'} size="large" variant="contained" endIcon={<ArrowForwardRounded/>}>{user?'Ir al panel':'Crear mi cuenta'}</Button><Button component="a" href="#como-funciona" size="large" variant="outlined" startIcon={<PlayCircleOutlineRounded/>}>Ver cómo funciona</Button></div><small>Pensado para técnicos independientes y servicios técnicos de celulares.</small></div>
  <div><ProductMockup/></div>
 </div></section>
}
