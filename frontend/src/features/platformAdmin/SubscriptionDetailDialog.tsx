import { useEffect, useState } from 'react'
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material'
import { RecordField } from '../../components/admin/AdminPatterns'
import { getPlans } from '../billing/billing.api'
import { formatARS, formatDate } from '../billing/billing.utils'
import { getAdminSubscription, updateAdminSubscription, type PlanCode, type SubscriptionAction } from './platformAdmin.api'
import { usePlatformAction, usePlatformResource } from './platformAdmin.hooks'
import { PaymentStatusChip, PlatformError, PlatformLoading, RefreshingBar, SubscriptionStatusChip, formatDateTime, formatLong, limitLabel, subscriptionPeriodLabel } from './platformAdmin.shared'
import { ConfirmDialog } from './platformAdmin.dialogs'

type ActionDialog = SubscriptionAction
const planCodes: PlanCode[] = ['INITIAL', 'PROFESSIONAL', 'COMPLETE']

const UsageRow = ({ label, used, limit }: { label: string; used: number; limit: number | null }) => (
  <Box display="grid" gridTemplateColumns="1fr auto" gap={1} sx={{ p: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 2.5 }}>
    <Typography variant="body2">{label}</Typography>
    <Typography variant="body2" fontWeight={700}>{used} / {limitLabel(limit)}</Typography>
  </Box>
)

export function SubscriptionDetailDialog({ subscriptionId, onClose, onChanged }: { subscriptionId: string | null; onClose: () => void; onChanged: () => void }) {
  const [dialog, setDialog] = useState<ActionDialog | null>(null)
  const [planCode, setPlanCode] = useState<PlanCode>('COMPLETE')
  const [days, setDays] = useState(30)
  const [planOptions, setPlanOptions] = useState<Array<{ code: PlanCode; label: string }>>([])
  const detail = usePlatformResource(() => getAdminSubscription(subscriptionId ?? ''), `subscription:${subscriptionId}`, Boolean(subscriptionId))
  const action = usePlatformAction()
  useEffect(() => { setDialog(null); action.clear() }, [subscriptionId, action.clear])
  useEffect(() => {
    if (!detail.data) return
    setPlanCode(detail.data.planCode)
    setDays(30)
  }, [detail.data])
  useEffect(() => {
    if (dialog !== 'CHANGE_PLAN' || planOptions.length) return
    void getPlans()
      .then(items => setPlanOptions(items.map(plan => ({ code: plan.code, label: `${plan.name} · ${formatARS(plan.priceARS)}` }))))
      .catch(() => setPlanOptions(planCodes.map(code => ({ code, label: code }))))
  }, [dialog, planOptions.length])
  const subscription = detail.data
  const closeDialog = () => setDialog(null)
  const runAction = async (payload: { action: SubscriptionAction; planCode?: PlanCode; days?: number }, success: string) => {
    if (!subscription) return
    const done = await action.run(() => updateAdminSubscription(subscription.id, payload), success)
    if (!done) return
    setDialog(null)
    detail.reload()
    onChanged()
  }
  return <Dialog open={Boolean(subscriptionId)} onClose={onClose} fullWidth maxWidth="md">
    <DialogTitle sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap', alignItems: 'center' }}>
      <Box flex={1} minWidth={180}>
        <Typography variant="overline" color="primary.main" fontSize={10} fontWeight={800} letterSpacing=".12em">Suscripción</Typography>
        <Typography variant="h5" sx={{ overflowWrap: 'anywhere' }}>{subscription?.business.name ?? 'Cargando suscripción…'}</Typography>
      </Box>
      {subscription && <SubscriptionStatusChip status={subscription.status} />}
    </DialogTitle>
    <DialogContent dividers>
      {detail.loading && !subscription ? <PlatformLoading label="Cargando la suscripción…" />
        : detail.error || !subscription ? <PlatformError message={detail.error || 'No pudimos cargar la suscripción.'} onRetry={detail.reload} />
          : <Stack spacing={2.5}>
            {detail.loading && <RefreshingBar />}
            {action.message && <Alert severity="success" onClose={action.clear}>{action.message}</Alert>}
            {action.error && <Alert severity="error" onClose={action.clear}>{action.error}</Alert>}
            {subscription.manuallyBlockedAt && <Alert severity="warning">Bloqueo manual desde el {formatDate(subscription.manuallyBlockedAt)}{subscription.manualBlockReason ? ` · ${subscription.manualBlockReason}` : ''}{subscription.manualBlockNote ? ` · ${subscription.manualBlockNote}` : ''}</Alert>}
            <Box display="grid" gap={2} gridTemplateColumns={{ xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))' }}>
              <RecordField label="Negocio">{subscription.business.name}</RecordField>
              <RecordField label="Propietario">{subscription.business.users.find(user => user.role === 'OWNER')?.email ?? 'Sin propietario'}</RecordField>
              <RecordField label="Usuarios">{subscription.business.users.length}</RecordField>
              <RecordField label="Plan">{subscription.plan.name} · {formatARS(subscription.plan.priceARS)}</RecordField>
              <RecordField label="Vigencia">{subscriptionPeriodLabel(subscription)}</RecordField>
              <RecordField label="Vencimiento de acceso">{formatLong(subscription.accessExpiresAt)}</RecordField>
              <RecordField label="Inicio del período">{formatLong(subscription.trialStartedAt)}</RecordField>
              <RecordField label="Fin de prueba">{formatLong(subscription.trialEndsAt)}</RecordField>
              <RecordField label="Fin del período pago">{formatLong(subscription.currentPeriodEnd)}</RecordField>
              <RecordField label="Fin de gracia">{formatLong(subscription.graceEndsAt)}</RecordField>
              <RecordField label="Días de gracia">{subscription.graceDaysOverride === null ? 'Según configuración general' : `${subscription.graceDaysOverride} días`}</RecordField>
              <RecordField label="Alta del negocio">{formatDate(subscription.business.createdAt)}</RecordField>
            </Box>
            <Stack direction="row" gap={1} flexWrap="wrap">
              <Button variant="outlined" disabled={action.saving} onClick={() => setDialog('CHANGE_PLAN')}>Cambiar plan</Button>
              <Button variant="outlined" disabled={action.saving} onClick={() => setDialog('ADD_COURTESY_DAYS')}>Agregar días de cortesía</Button>
              {subscription.status === 'SUSPENDED'
                ? <Button color="success" variant="contained" disabled={action.saving} onClick={() => setDialog('REACTIVATE')}>Reactivar</Button>
                : <Button color="error" variant="outlined" disabled={action.saving} onClick={() => setDialog('SUSPEND')}>Suspender</Button>}
            </Stack>
            <Box>
              <Typography variant="subtitle2" fontWeight={750}>Uso del plan</Typography>
              <Typography variant="caption" color="text.secondary" display="block" mb={1.5}>Período {formatDate(subscription.usage.periodStart)} — {formatDate(subscription.usage.periodEnd)}</Typography>
              <Stack spacing={1}>
                <UsageRow label="Reparaciones del período" used={subscription.usage.repairs} limit={subscription.usage.entitlements.repairLimitPerPeriod} />
                <UsageRow label="Seguimientos creados" used={subscription.usage.trackingLinks} limit={subscription.usage.entitlements.trackingLimitPerPeriod} />
              </Stack>
              <Stack direction="row" gap={1} flexWrap="wrap" mt={1.5}>
                {[['Dashboard completo', subscription.usage.entitlements.dashboardComplete], ['Reportes avanzados', subscription.usage.entitlements.advancedReports], ['Comercio', subscription.usage.entitlements.commerce]].map(([label, included]) => <Chip key={String(label)} size="small" variant="outlined" color={included ? 'success' : 'default'} label={`${String(label)}: ${included ? 'incluido' : 'no incluido'}`} />)}
              </Stack>
            </Box>
            <Box>
              <Typography variant="subtitle2" fontWeight={750}>Pagos informados</Typography>
              <Stack spacing={1} mt={1.5}>
                {subscription.payments.length ? subscription.payments.map(payment => (
                  <Box key={payment.id} display="flex" gap={1.5} flexWrap="wrap" alignItems="center" sx={{ p: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 2.5 }}>
                    <Box flex={1} minWidth={140}>
                      <Typography variant="body2" fontWeight={650}>{payment.plan?.name ?? payment.planCode} · {formatARS(payment.reportedAmount)}</Typography>
                      <Typography variant="caption" color="text.secondary" display="block">Informado el {formatDateTime(payment.createdAt)} · Esperado {formatARS(payment.expectedAmount)} · {payment.payerName}</Typography>
                      {payment.rejectionReason && <Typography variant="caption" color="error.main">{payment.rejectionReason}</Typography>}
                    </Box>
                    <PaymentStatusChip status={payment.status} />
                  </Box>
                )) : <Typography variant="body2" color="text.secondary">Todavía no hay pagos informados para esta suscripción.</Typography>}
              </Stack>
            </Box>
          </Stack>}
    </DialogContent>
    <DialogActions><Button onClick={onClose}>Cerrar</Button></DialogActions>
    <Dialog open={dialog === 'CHANGE_PLAN'} onClose={closeDialog} fullWidth maxWidth="xs">
      <DialogTitle>Cambiar plan</DialogTitle>
      <DialogContent><Stack spacing={2} mt={.5}>
        <Typography variant="body2" color="text.secondary">Plan actual: <b>{subscription?.plan.name ?? '—'}</b>. El cambio se aplica sobre la suscripción del negocio.</Typography>
        <FormControl fullWidth>
          <InputLabel id="subscription-plan">Nuevo plan</InputLabel>
          <Select labelId="subscription-plan" label="Nuevo plan" value={planCode} onChange={event => setPlanCode(event.target.value as PlanCode)}>
            {(planOptions.length ? planOptions : planCodes.map(code => ({ code, label: code }))).map(option => <MenuItem key={option.code} value={option.code}>{option.label}</MenuItem>)}
          </Select>
        </FormControl>
      </Stack></DialogContent>
      <DialogActions><Button onClick={closeDialog}>Cancelar</Button><Button variant="contained" disabled={action.saving || planCode === subscription?.planCode} onClick={() => void runAction({ action: 'CHANGE_PLAN', planCode }, `Plan cambiado a ${planOptions.find(option => option.code === planCode)?.label ?? planCode}.`)}>{action.saving ? 'Guardando…' : 'Cambiar plan'}</Button></DialogActions>
    </Dialog>
    <Dialog open={dialog === 'ADD_COURTESY_DAYS'} onClose={closeDialog} fullWidth maxWidth="xs">
      <DialogTitle>Agregar días de cortesía</DialogTitle>
      <DialogContent><Stack spacing={2} mt={.5}>
        <Typography variant="body2" color="text.secondary">Se suman días al vencimiento actual ({formatLong(subscription?.accessExpiresAt)}). Si la cuenta estaba suspendida, vuelve a activa.</Typography>
        <TextField type="number" label="Días a agregar" value={days} onChange={event => setDays(Math.max(1, Math.min(365, Number(event.target.value) || 0)))} inputProps={{ min: 1, max: 365 }} />
        <Stack direction="row" gap={1} flexWrap="wrap">{[7, 15, 30].map(value => <Chip key={value} label={`+${value} días`} clickable onClick={() => setDays(value)} color={days === value ? 'primary' : 'default'} variant={days === value ? 'filled' : 'outlined'} />)}</Stack>
      </Stack></DialogContent>
      <DialogActions><Button onClick={closeDialog}>Cancelar</Button><Button variant="contained" disabled={action.saving || days < 1} onClick={() => void runAction({ action: 'ADD_COURTESY_DAYS', days }, `${days} días de cortesía agregados.`)}>{action.saving ? 'Guardando…' : 'Agregar días'}</Button></DialogActions>
    </Dialog>
    <ConfirmDialog open={dialog === 'SUSPEND'} title="Suspender suscripción" description="El negocio pierde el acceso hasta que la reactives. Sus datos quedan guardados." confirmLabel="Suspender" destructive saving={action.saving} onClose={closeDialog} onConfirm={() => void runAction({ action: 'SUSPEND' }, 'Suscripción suspendida.')} />
    <ConfirmDialog open={dialog === 'REACTIVATE'} title="Reactivar suscripción" description="La suscripción vuelve a estado activo con 30 días de vigencia desde hoy." confirmLabel="Reactivar" saving={action.saving} onClose={closeDialog} onConfirm={() => void runAction({ action: 'REACTIVATE' }, 'Suscripción reactivada.')} />
  </Dialog>
}
