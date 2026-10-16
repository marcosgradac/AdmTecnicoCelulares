import { MobileCarousel } from '../../components/common/MobileCarousel'
import { Button } from '@mui/material'
import type { Plan, PlanCode } from './billing.types'
import { formatARS } from './billing.utils'

const features: Record<PlanCode, string[]> = {
  INITIAL: ['40 reparaciones nuevas por mes', '10 links de seguimiento por mes', 'Clientes, equipos, pagos e historial', 'Dashboard básico'],
  PROFESSIONAL: ['150 reparaciones nuevas por mes', 'Links de seguimiento ilimitados', 'Dashboard y estadísticas completas', 'Todas las funciones del plan Inicial'],
  COMPLETE: ['Reparaciones y seguimientos ilimitados', 'Clientes y equipos ilimitados', 'Comercio: productos, stock y ventas', 'Todos los módulos actuales'],
}
export function PlanCards({ plans, actionLabel, onSelect, mobileCarousel = false }: { plans: Plan[]; actionLabel: string; onSelect: (code: PlanCode) => void; mobileCarousel?: boolean }) {
  const cards = plans.map(plan => <article key={plan.code} className={`billing-plan-card ${plan.code === 'PROFESSIONAL' ? 'recommended' : ''}`}>
    {plan.code === 'PROFESSIONAL' && <span className="billing-plan-badge">MÁS ELEGIDO</span>}
    {plan.code === 'COMPLETE' && <span className="billing-plan-badge secondary">TODO INCLUIDO</span>}
    <p className="billing-plan-name">{plan.name}</p><strong className="billing-plan-price">{formatARS(plan.priceARS)}</strong><small>por mes</small>
    <ul>{features[plan.code].map(feature => <li key={feature}>✓ {feature}</li>)}</ul>
    <Button fullWidth size="large" variant={plan.code === 'PROFESSIONAL' ? 'contained' : 'outlined'} onClick={() => onSelect(plan.code)}>{actionLabel}</Button>
  </article>)
  return mobileCarousel ? <MobileCarousel label="Planes de suscripción" itemLabels={plans.map(plan => plan.name)} desktopSx={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: '18px', alignItems: 'stretch' }}>{cards}</MobileCarousel> : <div className="billing-plan-grid">{cards}</div>
}
