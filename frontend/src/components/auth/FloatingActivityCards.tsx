import { CheckCircleRounded, LinkRounded, NotificationsActiveRounded, PaymentsRounded, TaskAltRounded, VerifiedUserRounded } from '@mui/icons-material'
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
    {!secure && <div className="float-card float-card--pulse float-card--ready"><NotificationsActiveRounded /><span><small>Equipo listo</small><b>Cliente notificado</b></span></div>}
    {!secure && <div className="float-card float-card--pulse float-card--payment"><PaymentsRounded /><span><small>Pago registrado</small><b>Saldo actualizado</b></span></div>}
  </>
}
