import { HeroDashboardMockup } from './HeroDashboardMockup'
import { HeroTrackingCard } from './HeroTrackingCard'
import { CheckCircleRounded, LinkRounded, TrendingUpRounded } from '@mui/icons-material'
import './hero-visual.scss'

export function HeroVisual(){return <div className="saas-visual" aria-label="Vista previa de TecnoDesk"><div className="saas-visual__glow" aria-hidden/><HeroDashboardMockup/><div className="float-card float-card--approval"><span className="float-card__icon success"><CheckCircleRounded/></span><span><small>Presupuesto</small><strong>Aprobado</strong></span><i>Hace 2 min</i></div><div className="float-card float-card--income"><span className="float-card__icon blue"><TrendingUpRounded/></span><span><small>Ingresos del mes</small><strong>$ 285.400</strong></span><b>+18%</b></div><div className="float-card float-card--link"><span className="float-card__icon violet"><LinkRounded/></span><span><small>Seguimiento enviado</small><strong>Cliente conectado</strong></span><i className="live-dot"/></div><HeroTrackingCard/></div>}
