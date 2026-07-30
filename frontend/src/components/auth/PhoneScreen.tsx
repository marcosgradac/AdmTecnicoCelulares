import { CheckRounded } from '@mui/icons-material'
import type { AuthVisualVariant } from './auth-visual.types'
import { authVisualContent } from './auth-visual.types'

export function PhoneScreen({ variant }: { variant: AuthVisualVariant }) {
  const [eyebrow, title, status] = authVisualContent[variant]
  const secure = variant.includes('password')
  return <div className="phone-screen">
    <header><i>C</i><b>CelluFix</b><small>● En línea</small></header>
    <main><em>{eyebrow}</em><h3>{title}</h3><p>{secure ? 'Enlace protegido por tiempo' : 'Cliente y equipo conectados'}</p>
      <section><i><CheckRounded /></i><span><small>Estado actual</small><b>{status}</b></span></section>
      <label><span>Progreso</span><b>{secure ? '100%' : '68%'}</b></label><div className="phone-progress"><i /></div>
      <div className="phone-steps">{['Recepción', secure ? 'Validación' : 'Diagnóstico', secure ? 'Protección' : 'Reparación', 'Listo'].map(x => <span key={x}><i />{x}</span>)}</div>
      <aside><span><small>Órdenes activas</small><b>{secure ? '1' : '12'}</b></span><span><small>Completadas</small><b>✓</b></span></aside>
    </main>
  </div>
}
