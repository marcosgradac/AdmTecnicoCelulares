import { useEffect, useState, type ReactNode } from 'react'
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, Stack, Tab, Tabs, TextField, Typography } from '@mui/material'
import { DeleteOutlineRounded } from '@mui/icons-material'
import { RecordField } from '../../components/admin/AdminPatterns'
import { formatARS, formatDate } from '../billing/billing.utils'
import { createAdminNote, deleteAdminNote, getAdminBusiness, type AdminBusinessDetail, type AdminSubscriptionAudit, type AdminNote } from './platformAdmin.api'
import { usePlatformAction, usePlatformResource } from './platformAdmin.hooks'
import { AccessChip, PlatformError, PlatformLoading, RefreshingBar, SubscriptionStatusChip, auditActionLabel, formatDateTime, formatLong, remainingLabel } from './platformAdmin.shared'
import { ConfirmDialog, useBusinessLifecycleActions, type Target } from './platformAdmin.dialogs'

const Field = ({ label, children }: { label: string; children: ReactNode }) => <RecordField label={label}>{children}</RecordField>

const lifecycleTarget = (business: AdminBusinessDetail): Target | null =>
  business.access ? { id: business.id, name: business.name, access: business.access, graceDaysOverride: business.subscription?.graceDaysOverride ?? null } : null

function ResumenTab({ business }: { business: AdminBusinessDetail }) {
  const owner = business.users.find(user => user.role === 'OWNER')
  const team = business.users.filter(user => user.role === 'TECHNICIAN')
  return <Stack spacing={2.5}>
    <Box display="grid" gap={2} gridTemplateColumns={{ xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))' }}>
      <Field label="Propietario">{owner?.name ?? 'Sin propietario'}</Field>
      <Field label="Email">{owner?.email ?? '—'}</Field>
      <Field label="Teléfono">{business.phone || 'No informado'}</Field>
      <Field label="Plan">{business.subscription?.plan.name ?? 'Sin suscripción'}{business.subscription ? ` · ${formatARS(business.subscription.plan.priceARS)}` : ''}</Field>
      <Field label="Empleados">{team.length} técnicos · {business.users.length} usuarios</Field>
      <Field label="Negocio">{business.isActive ? 'Activo' : 'Inactivo'}</Field>
      <Field label="Reparaciones">{business._count.repairs}</Field>
      <Field label="Clientes">{business._count.clients}</Field>
      <Field label="Movimientos de caja">{business._count.cashMovements}</Field>
      <Field label="Vencimiento">{formatLong(business.access?.expiresAt)}</Field>
      <Field label="Días de gracia">{business.access ? `${business.access.graceDays} días${(business.subscription?.graceDaysOverride ?? null) !== null ? ' (personalizado)' : ''}` : '—'}</Field>
      <Field label="Bloqueo estimado">{formatLong(business.access?.graceEndsAt)}</Field>
      <Field label="Alta en la plataforma">{formatDate(business.createdAt)}</Field>
      <Field label="Inicio de prueba">{formatLong(business.subscription?.trialStartedAt)}</Field>
      {business.subscription?.currentPeriodStart && <Field label="Inicio del período pago">{formatLong(business.subscription.currentPeriodStart)}</Field>}
      <Field label="Última actualización">{formatDate(business.subscription?.updatedAt)}</Field>
    </Box>
    <Divider />
    <Box>
      <Typography variant="subtitle2" fontWeight={750}>Equipo del negocio</Typography>
      <Stack spacing={1} mt={1.5}>
        {business.users.map(user => (
          <Box key={user.id} display="flex" gap={1.5} flexWrap="wrap" alignItems="center" sx={{ p: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 2.5 }}>
            <Box flex={1} minWidth={140}>
              <Typography variant="body2" fontWeight={650} sx={{ overflowWrap: 'anywhere' }}>{user.name}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{user.email}</Typography>
            </Box>
            <Chip size="small" variant="outlined" label={user.role === 'OWNER' ? 'Propietario' : 'Técnico'} />
            <Chip size="small" variant="outlined" color={user.isActive ? 'success' : 'default'} label={user.isActive ? 'Activo' : 'Inactivo'} />
          </Box>
        ))}
      </Stack>
    </Box>
  </Stack>
}

function HistorialTab({ logs }: { logs: AdminSubscriptionAudit[] }) {
  if (!logs.length) return <Typography variant="body2" color="text.secondary">Todavía no hay acciones registradas sobre esta cuenta.</Typography>
  return <Stack spacing={1.5}>
    {logs.map(log => (
      <Box key={log.id} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2.5 }}>
        <Typography variant="body2" fontWeight={700}>{auditActionLabel(log.action)}</Typography>
        <Typography variant="caption" color="text.secondary">{formatDateTime(log.createdAt)} · {log.actor.name}</Typography>
        {typeof log.metadata?.previousExpiresAt === 'string' && typeof log.metadata?.newExpiresAt === 'string' && <Typography variant="body2" mt={.5}>Anterior: {formatLong(log.metadata.previousExpiresAt)} · Nuevo: {formatLong(log.metadata.newExpiresAt)}</Typography>}
      </Box>
    ))}
  </Stack>
}

function NotasTab({ business, onReload }: { business: AdminBusinessDetail; onReload: () => void }) {
  const [note, setNote] = useState('')
  const [pendingDelete, setPendingDelete] = useState<AdminNote | null>(null)
  const action = usePlatformAction()
  return <Stack spacing={2}>
    {action.message && <Alert severity="success" onClose={action.clear}>{action.message}</Alert>}
    {action.error && <Alert severity="error" onClose={action.clear}>{action.error}</Alert>}
    <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5} alignItems={{ sm: 'flex-start' }}>
      <TextField fullWidth multiline minRows={2} label="Nueva nota interna" helperText="Solo la ve el equipo de TecnoDesk." value={note} onChange={event => setNote(event.target.value)} inputProps={{ maxLength: 2000 }} />
      <Button variant="contained" disabled={action.saving || note.trim().length < 2} onClick={() => void action.run(async () => { await createAdminNote(business.id, note.trim()); setNote(''); onReload() }, 'Nota agregada.')}>Agregar</Button>
    </Stack>
    {business.internalNotes.length ? business.internalNotes.map(item => (
      <Box key={item.id} display="flex" gap={1} alignItems="flex-start" sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2.5 }}>
        <Box flex={1} minWidth={0}>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{item.content}</Typography>
          <Typography variant="caption" color="text.secondary">{formatDateTime(item.createdAt)}</Typography>
        </Box>
        <IconButton size="small" color="error" aria-label="Eliminar nota" onClick={() => setPendingDelete(item)}><DeleteOutlineRounded fontSize="small" /></IconButton>
      </Box>
    )) : <Typography variant="body2" color="text.secondary">Todavía no hay notas internas para este negocio.</Typography>}
    <ConfirmDialog open={Boolean(pendingDelete)} title="Eliminar nota" description="Esta nota interna se eliminará definitivamente." confirmLabel="Eliminar nota" destructive saving={action.saving} onClose={() => { setPendingDelete(null); action.clear() }} onConfirm={() => void action.run(async () => { if (pendingDelete) await deleteAdminNote(business.id, pendingDelete.id); setPendingDelete(null); onReload() }, 'Nota eliminada.')} />
  </Stack>
}

export function BusinessDetailDialog({ businessId, onClose, onChanged }: { businessId: string | null; onClose: () => void; onChanged: () => void }) {
  const [tab, setTab] = useState(0)
  const [feedback, setFeedback] = useState('')
  const detail = usePlatformResource(() => getAdminBusiness(businessId ?? ''), `business:${businessId}`, Boolean(businessId))
  const actions = useBusinessLifecycleActions(message => { setFeedback(message); detail.reload(); onChanged() })
  useEffect(() => { setTab(0); setFeedback('') }, [businessId])
  const business = detail.data
  const target = business ? lifecycleTarget(business) : null
  return <Dialog open={Boolean(businessId)} onClose={onClose} fullWidth maxWidth="md">
    <DialogTitle sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap', alignItems: 'center' }}>
      <Box flex={1} minWidth={180}>
        <Typography variant="overline" color="primary.main" fontSize={10} fontWeight={800} letterSpacing=".12em">Negocio</Typography>
        <Typography variant="h5" sx={{ overflowWrap: 'anywhere' }}>{business?.name ?? 'Cargando negocio…'}</Typography>
      </Box>
      {business?.access && <AccessChip access={business.access} />}
      {business?.subscription && <SubscriptionStatusChip status={business.subscription.status} />}
    </DialogTitle>
    <DialogContent dividers>
      {detail.loading && !business ? <PlatformLoading label="Cargando el negocio…" />
        : detail.error || !business ? <PlatformError message={detail.error || 'No pudimos cargar el negocio.'} onRetry={detail.reload} />
          : <Stack spacing={2.5}>
            {detail.loading && <RefreshingBar />}
            {feedback && <Alert severity="success" onClose={() => setFeedback('')}>{feedback}</Alert>}
            {business.access && <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 3, bgcolor: '#FBFBFE' }}>
              <Typography fontWeight={750}>{remainingLabel(business.access)}</Typography>
              <Typography variant="body2" color="text.secondary">Vencimiento {formatLong(business.access.expiresAt)} · Gracia de {business.access.graceDays} días · Aviso {business.access.warningDays} días antes del vencimiento</Typography>
              {business.access.blockType && <Alert severity="error" sx={{ mt: 1.5 }}>{business.access.blockType === 'MANUAL' ? 'Bloqueo manual' : 'Bloqueo automático por vencimiento'}{business.access.blockReason ? ` · ${business.access.blockReason}` : ''}{business.access.blockNote ? ` · ${business.access.blockNote}` : ''}</Alert>}
            </Box>}
            <Stack direction="row" gap={1} flexWrap="wrap">
              <Button variant="contained" disabled={!target} onClick={() => target && actions.openRenew(target)}>Renovar 30 días</Button>
              {[7, 15].map(days => <Button key={days} variant="outlined" disabled={!target} onClick={() => target && actions.openRenew(target, days)}>+{days} días</Button>)}
              <Button variant="outlined" disabled={!target} onClick={() => target && actions.openExpiry(target)}>Cambiar vencimiento</Button>
              {business.access?.status === 'BLOCKED'
                ? <Button color="success" disabled={!target} onClick={() => target && actions.openUnblock(target)}>Desbloquear</Button>
                : <Button color="error" disabled={!target} onClick={() => target && actions.openBlock(target)}>Bloquear</Button>}
            </Stack>
            <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" allowScrollButtonsMobile>
              <Tab label="Resumen" /><Tab label="Historial" /><Tab label={`Notas internas${business.internalNotes.length ? ` (${business.internalNotes.length})` : ''}`} />
            </Tabs>
            <Box>
              {tab === 0 && <ResumenTab business={business} />}
              {tab === 1 && <HistorialTab logs={business.subscriptionAudits} />}
              {tab === 2 && <NotasTab business={business} onReload={detail.reload} />}
            </Box>
          </Stack>}
    </DialogContent>
    <DialogActions><Button onClick={onClose}>Cerrar</Button></DialogActions>
    {actions.element}
  </Dialog>
}
