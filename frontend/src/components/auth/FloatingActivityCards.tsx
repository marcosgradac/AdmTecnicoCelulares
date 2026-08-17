import { CheckCircleRounded, LinkRounded, TaskAltRounded, VerifiedUserRounded } from '@mui/icons-material'
import type { AuthVisualVariant } from './auth-visual.types'
import { authVisualContent } from './auth-visual.types'
import type { PhoneScreenKind } from './phone-showcase/phoneShowcase.types'
export function FloatingActivityCards({ variant, activeKind }: { variant: AuthVisualVariant; activeKind: PhoneScreenKind }) {
  const secure = variant.includes('password')
  return <>
    <div className="float-card float-card--one">{secure ? <VerifiedUserRounded /> : <CheckCircleRounded />}<span><small>Actualización</small><b>{authVisualContent[variant][3]}</b></span></div>
    <div className="float-card float-card--two"><CheckCircleRounded /><span><small>Hace un momento</small><b>{secure ? 'Seguridad actualizada' : 'Pago registrado'}</b></span></div>
    <div className={`float-card float-card--rotating float-card--tracking${activeKind === 'tracking' ? ' is-active' : ''}`}><LinkRounded /><span><small>Seguimiento activo</small><b>El cliente consultó su reparación</b></span></div>
    <div className={`float-card float-card--rotating float-card--budget${activeKind === 'repair' ? ' is-active' : ''}`}><TaskAltRounded /><span><small>Presupuesto aprobado</small><b>Reparación lista para comenzar</b></span></div>
  </>
}
