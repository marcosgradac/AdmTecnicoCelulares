import type { ReactElement } from 'react'
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, LinearProgress, Typography } from '@mui/material'
import { BlockRounded, CancelRounded, CheckCircleRounded, HelpOutlineRounded, HourglassBottomRounded, RefreshRounded, RocketLaunchRounded, ScheduleRounded } from '@mui/icons-material'
import { UiState } from '../../components/common/UiState'
import { formatDate } from '../billing/billing.utils'
import type { AccessStatus, AccountAccess, PaymentStatus, SubscriptionStatus } from './platformAdmin.api'

interface PillMeta { label: string; color: string; background: string; icon: ReactElement }

export const StatusPill = ({ label, color, background, icon }: PillMeta) => (
  <Chip size="small" icon={icon} label={label} sx={{ color, bgcolor: background, border: `1px solid ${color}33`, fontWeight: 650, maxWidth: '100%', '& .MuiChip-icon': { color, fontSize: 16 } }} />
)

const accessMeta: Record<AccessStatus, PillMeta> = {
  ACTIVE: { label: 'Activo', color: '#1B7F4C', background: '#E9F8F0', icon: <CheckCircleRounded /> },
  EXPIRING: { label: 'Por vencer', color: '#8F5A00', background: '#FFF5DF', icon: <ScheduleRounded /> },
  GRACE: { label: 'En gracia', color: '#B4470F', background: '#FFF0E6', icon: <HourglassBottomRounded /> },
  BLOCKED: { label: 'Bloqueado', color: '#B3261E', background: '#FDECEC', icon: <BlockRounded /> },
  NO_EXPIRY: { label: 'Sin vencimiento', color: '#5A6172', background: '#F0F1F6', icon: <HelpOutlineRounded /> },
}
export const AccessChip = ({ access }: { access: AccountAccess }) => <StatusPill {...accessMeta[access.status]} />

const subscriptionMeta: Record<SubscriptionStatus, PillMeta> = {
  TRIALING: { label: 'Prueba', color: '#1D6FB8', background: '#EAF5FF', icon: <RocketLaunchRounded /> },
  ACTIVE: { label: 'Activa', color: '#1B7F4C', background: '#E9F8F0', icon: <CheckCircleRounded /> },
  GRACE: { label: 'En gracia', color: '#B4470F', background: '#FFF0E6', icon: <HourglassBottomRounded /> },
  PAST_DUE: { label: 'Vencida', color: '#8F5A00', background: '#FFF5DF', icon: <ScheduleRounded /> },
  SUSPENDED: { label: 'Suspendida', color: '#B3261E', background: '#FDECEC', icon: <BlockRounded /> },
  CANCELED: { label: 'Cancelada', color: '#5A6172', background: '#F0F1F6', icon: <CancelRounded /> },
}
export const SubscriptionStatusChip = ({ status }: { status: SubscriptionStatus }) => <StatusPill {...subscriptionMeta[status]} />

const paymentMeta: Record<PaymentStatus, PillMeta> = {
  PENDING: { label: 'Pendiente', color: '#8F5A00', background: '#FFF5DF', icon: <ScheduleRounded /> },
  APPROVED: { label: 'Aprobado', color: '#1B7F4C', background: '#E9F8F0', icon: <CheckCircleRounded /> },
  REJECTED: { label: 'Rechazado', color: '#B3261E', background: '#FDECEC', icon: <CancelRounded /> },
}
export const PaymentStatusChip = ({ status }: { status: PaymentStatus }) => <StatusPill {...paymentMeta[status]} />

export const formatLong = (value?: string | null) => value
  ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'long', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(value))
  : 'Sin configurar'

export const formatDateTime = (value?: string | null) => value
  ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(value))
  : '—'

export const toDateInput = (value?: string | null) => value
  ? new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(value))
  : ''

export const remainingLabel = (access: AccountAccess) =>
  access.status === 'NO_EXPIRY' ? 'Sin vencimiento configurado'
    : access.status === 'BLOCKED' ? `Bloqueado${access.blockedAt ? ` desde el ${formatDate(access.blockedAt)}` : ''}`
      : access.status === 'GRACE' ? (access.graceDaysRemaining === 1 ? 'Último día de gracia' : `${access.graceDaysRemaining} días de gracia restantes`)
        : access.daysRemaining === 0 ? 'Vence hoy'
          : access.daysRemaining === 1 ? 'Vence mañana'
            : `Quedan ${access.daysRemaining} días`

export const subscriptionPeriodLabel = (row: { status: SubscriptionStatus; trialEndsAt: string; currentPeriodEnd: string | null }) =>
  row.status === 'TRIALING' ? `Prueba hasta el ${formatLong(row.trialEndsAt)}`
    : row.currentPeriodEnd ? `Vence el ${formatLong(row.currentPeriodEnd)}`
      : 'Sin período configurado'

const auditLabels: Record<string, string> = {
  ACCESS_EXTENDED: 'Vigencia extendida', EXPIRY_CHANGED: 'Vencimiento cambiado', ACCOUNT_BLOCKED_MANUALLY: 'Cuenta bloqueada',
  ACCOUNT_UNBLOCKED: 'Cuenta desbloqueada', BUSINESS_DEACTIVATED: 'Negocio desactivado', BUSINESS_REACTIVATED: 'Negocio reactivado',
  PAYMENT_APPROVED: 'Pago aprobado', PAYMENT_REJECTED: 'Pago rechazado', CHANGE_PLAN: 'Cambio de plan',
  ADD_COURTESY_DAYS: 'Días de cortesía', SUSPEND: 'Suscripción suspendida', REACTIVATE: 'Suscripción reactivada',
}
export const auditActionLabel = (action: string) => auditLabels[action] ?? action.replaceAll('_', ' ').toLowerCase()
export const limitLabel = (value: number | null | undefined) => value === null || value === undefined ? 'Ilimitado' : String(value)

export const PlatformLoading = ({ label = 'Cargando información…' }: { label?: string }) => (
  <Card><CardContent><Box display="grid" gap={1.5} sx={{ placeItems: 'center', py: 5 }}><CircularProgress size={28} /><Typography variant="body2" color="text.secondary">{label}</Typography></Box></CardContent></Card>
)

export const PlatformError = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <Card><CardContent><Alert severity="error" action={<Button color="inherit" size="small" startIcon={<RefreshRounded />} onClick={onRetry}>Reintentar</Button>}>{message}</Alert></CardContent></Card>
)

export const PlatformEmpty = ({ title, description }: { title: string; description: string }) => (
  <Card><CardContent><UiState title={title} description={description} /></CardContent></Card>
)

export const RefreshingBar = () => <LinearProgress sx={{ height: 3, borderRadius: 2, mb: 1.5 }} />

