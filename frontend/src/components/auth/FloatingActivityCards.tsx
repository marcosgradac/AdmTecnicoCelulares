import { CheckCircleRounded, VerifiedUserRounded } from '@mui/icons-material'
import type { AuthVisualVariant } from './auth-visual.types'
import { authVisualContent } from './auth-visual.types'
export function FloatingActivityCards({ variant }: { variant: AuthVisualVariant }) {
  const secure = variant.includes('password')
  return <><div className="float-card float-card--one">{secure ? <VerifiedUserRounded /> : <CheckCircleRounded />}<span><small>Actualización</small><b>{authVisualContent[variant][3]}</b></span></div><div className="float-card float-card--two"><CheckCircleRounded /><span><small>Hace un momento</small><b>{secure ? 'Seguridad actualizada' : 'Pago registrado'}</b></span></div></>
}
