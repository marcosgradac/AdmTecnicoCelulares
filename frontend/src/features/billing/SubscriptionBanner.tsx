import { Alert, Button } from '@mui/material'
import { useNavigate } from 'react-router-dom'
import { useSubscription } from './SubscriptionContext'

export function SubscriptionBanner() {
  const { subscription } = useSubscription()
  const navigate = useNavigate()
  if (!subscription || ['ACTIVE','NO_EXPIRY'].includes(subscription.access.status)) return null
  const accessCopy = subscription.access.status === 'EXPIRING' ? subscription.access.daysRemaining === 0 ? 'Tu acceso vence hoy.' : subscription.access.daysRemaining === 1 ? 'Tu acceso vence mañana.' : `Tu acceso vence en ${subscription.access.daysRemaining} días.` : subscription.access.status === 'GRACE' ? `Tu período de acceso venció. Podés seguir utilizando TecnoDesk durante ${subscription.access.graceDaysRemaining} días más.` : null
  const trialCopy = subscription.daysRemaining === 0 ? 'Tu prueba gratuita finalizó. Elegí un plan para continuar usando TecnoDesk.' : subscription.daysRemaining === 1 ? 'Tu prueba termina mañana.' : subscription.daysRemaining <= 3 ? 'Tu período gratuito está por finalizar.' : subscription.daysRemaining <= 7 ? `Tu prueba gratuita termina en ${subscription.daysRemaining} días.` : `Estás usando TecnoDesk gratis · ${subscription.daysRemaining} días restantes`
  const copy = accessCopy ?? (subscription.status === 'SUSPENDED'
    ? 'Tu suscripción está pausada. Tus datos siguen seguros.'
    : subscription.status === 'GRACE'
    ? 'Tu suscripción venció. Tenés 3 días para regularizar el pago sin perder acceso.'
    : subscription.pendingPayment
    ? 'Pago informado. Estamos verificando tu transferencia.'
    : subscription.status === 'ACTIVE'
    ? subscription.daysRemaining === 0 ? 'Tu suscripción vence hoy.' : subscription.daysRemaining === 1 ? 'Tu suscripción vence mañana.' : `Tu suscripción vence en ${subscription.daysRemaining} días.`
    : subscription.status === 'TRIALING'
    ? trialCopy
    : 'Tu suscripción necesita atención.')
  return <Alert severity={subscription.status === 'SUSPENDED' ? 'error' : subscription.status === 'GRACE' ? 'warning' : subscription.pendingPayment ? 'success' : 'info'} action={<Button color="inherit" size="small" onClick={() => navigate('/admin/suscripcion')}>{subscription.status === 'SUSPENDED' || subscription.status === 'GRACE' ? 'Renovar' : subscription.pendingPayment ? 'Ver estado' : 'Ver planes'}</Button>} sx={{ mb: 2 }}>{copy}</Alert>
}
