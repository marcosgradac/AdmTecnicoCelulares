import { useEffect, useState, type ReactNode } from 'react'
import { Alert, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material'
import { blockAdminBusiness, renewAdminBusiness, setAdminBusinessExpiry, unblockAdminBusiness, type AccountAccess } from './platformAdmin.api'
import { apiErrorMessage } from './platformAdmin.hooks'
import { formatLong, toDateInput } from './platformAdmin.shared'

export const blockReasons = [
  ['ADMINISTRATIVE', 'Administrativo'], ['CUSTOMER_REQUEST', 'Solicitud del cliente'], ['NON_COMPLIANCE', 'Incumplimiento'], ['OTHER', 'Otro'],
] as const

export function ConfirmDialog({ open, title, description, confirmLabel = 'Confirmar', destructive = false, saving = false, error = '', onClose, onConfirm }: { open: boolean; title: string; description: ReactNode; confirmLabel?: string; destructive?: boolean; saving?: boolean; error?: string; onClose: () => void; onConfirm: () => void }) {
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
    <DialogTitle>{title}</DialogTitle>
    <DialogContent><Stack spacing={2} mt={.5}>{typeof description === 'string' ? <Typography>{description}</Typography> : description}{error && <Alert severity="error">{error}</Alert>}</Stack></DialogContent>
    <DialogActions><Button onClick={onClose}>Cancelar</Button><Button variant="contained" color={destructive ? 'error' : 'primary'} disabled={saving} onClick={onConfirm}>{saving ? 'Procesando…' : confirmLabel}</Button></DialogActions>
  </Dialog>
}

export function RejectPaymentDialog({ open, businessName, saving, error, onClose, onConfirm }: { open: boolean; businessName?: string; saving: boolean; error?: string; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('')
  useEffect(() => { if (open) setReason('') }, [open])
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
    <DialogTitle>Rechazar pago</DialogTitle>
    <DialogContent><Stack spacing={2} mt={.5}>
      {businessName && <Typography variant="body2" color="text.secondary">Negocio: <b>{businessName}</b></Typography>}
      <TextField autoFocus multiline minRows={3} label="Motivo del rechazo" value={reason} onChange={event => setReason(event.target.value)} helperText="Lo ve el negocio, así que conviene explicar qué corregir." />
      {error && <Alert severity="error">{error}</Alert>}
    </Stack></DialogContent>
    <DialogActions><Button onClick={onClose}>Cancelar</Button><Button color="error" variant="contained" disabled={saving || reason.trim().length < 3} onClick={() => onConfirm(reason.trim())}>{saving ? 'Rechazando…' : 'Rechazar pago'}</Button></DialogActions>
  </Dialog>
}

export function RenewDialog({ open, target, saving, error, initialDays = 30, onClose, onConfirm }: { open: boolean; target: Target | null; saving: boolean; error?: string; initialDays?: number; onClose: () => void; onConfirm: (days: number, base: 'TODAY' | 'EXPIRY') => void }) {
  const [days, setDays] = useState(initialDays)
  const [base, setBase] = useState<'TODAY' | 'EXPIRY'>('TODAY')
  useEffect(() => {
    if (!open || !target) return
    const restartsFromToday = ['GRACE', 'BLOCKED', 'NO_EXPIRY'].includes(target.access.status)
    setDays(initialDays)
    setBase(restartsFromToday ? 'TODAY' : 'EXPIRY')
  }, [open, target, initialDays])
  const currentExpiry = target?.access.expiresAt ? new Date(target.access.expiresAt) : new Date()
  const nextExpiry = new Date((base === 'EXPIRY' ? currentExpiry : new Date()).getTime() + days * 86_400_000)
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
    <DialogTitle>Renovar {target?.name}</DialogTitle>
    <DialogContent><Stack spacing={2.5} mt={.5}>
      <Typography variant="body2" color="text.secondary">Vencimiento actual: <b>{formatLong(target?.access.expiresAt)}</b></Typography>
      <TextField type="number" label="Cantidad de días" value={days} onChange={event => setDays(Math.max(1, Math.min(730, Number(event.target.value) || 0)))} inputProps={{ min: 1, max: 730 }} />
      <Stack direction="row" gap={1} flexWrap="wrap">{[7, 15, 30, 90].map(value => <Chip key={value} label={`+${value} días`} clickable onClick={() => setDays(value)} color={days === value ? 'primary' : 'default'} variant={days === value ? 'filled' : 'outlined'} />)}</Stack>
      {!['GRACE', 'BLOCKED', 'NO_EXPIRY'].includes(target?.access.status ?? '') && <FormControl fullWidth><InputLabel id="renew-base">Punto de partida</InputLabel><Select labelId="renew-base" label="Punto de partida" value={base} onChange={event => setBase(event.target.value as 'TODAY' | 'EXPIRY')}><MenuItem value="EXPIRY">Sumar desde el vencimiento actual</MenuItem><MenuItem value="TODAY">Renovar desde hoy</MenuItem></Select></FormControl>}
      <Alert severity="info">Nuevo vencimiento: <b>{formatLong(nextExpiry.toISOString())}</b>{base === 'TODAY' && <Typography variant="caption" display="block">Los días que quedaban se descartan porque la vigencia arranca hoy.</Typography>}</Alert>
      {error && <Alert severity="error">{error}</Alert>}
    </Stack></DialogContent>
    <DialogActions><Button onClick={onClose}>Cancelar</Button><Button variant="contained" disabled={saving || days < 1} onClick={() => onConfirm(days, base)}>{saving ? 'Renovando…' : 'Confirmar renovación'}</Button></DialogActions>
  </Dialog>
}

export function ExpiryDialog({ open, target, saving, error, onClose, onConfirm }: { open: boolean; target: Target | null; saving: boolean; error?: string; onClose: () => void; onConfirm: (date: string, graceDaysOverride: number | null) => void }) {
  const [date, setDate] = useState('')
  const [grace, setGrace] = useState('')
  useEffect(() => { if (open && target) { setDate(toDateInput(target.access.expiresAt)); setGrace(target.graceDaysOverride ? String(target.graceDaysOverride) : '') } }, [open, target])
  const parsedGrace = grace.trim() === '' ? null : Number(grace)
  const graceValid = parsedGrace === null || (Number.isInteger(parsedGrace) && parsedGrace >= 0 && parsedGrace <= 60)
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
    <DialogTitle>Cambiar vencimiento</DialogTitle>
    <DialogContent><Stack spacing={2.5} mt={.5}>
      <Typography variant="body2" color="text.secondary">Negocio: <b>{target?.name}</b> · Vencimiento actual: <b>{formatLong(target?.access.expiresAt)}</b></Typography>
      <TextField type="date" label="Nueva fecha de vencimiento" value={date} onChange={event => setDate(event.target.value)} InputLabelProps={{ shrink: true }} />
      <TextField type="number" label="Días de gracia para este negocio" value={grace} onChange={event => setGrace(event.target.value)} error={!graceValid} helperText={graceValid ? 'Vacío = usar los días de gracia generales de la plataforma.' : 'Ingresá un número entre 0 y 60.'} inputProps={{ min: 0, max: 60 }} />
      {error && <Alert severity="error">{error}</Alert>}
    </Stack></DialogContent>
    <DialogActions><Button onClick={onClose}>Cancelar</Button><Button variant="contained" disabled={saving || !date || !graceValid} onClick={() => onConfirm(date, parsedGrace)}>{saving ? 'Guardando…' : 'Guardar vencimiento'}</Button></DialogActions>
  </Dialog>
}

export function BlockDialog({ open, target, saving, error, onClose, onConfirm }: { open: boolean; target: Target | null; saving: boolean; error?: string; onClose: () => void; onConfirm: (reason: string, note: string) => void }) {
  const [reason, setReason] = useState<string>('ADMINISTRATIVE')
  const [note, setNote] = useState('')
  useEffect(() => { if (open) { setReason('ADMINISTRATIVE'); setNote('') } }, [open])
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
    <DialogTitle>Bloquear {target?.name}</DialogTitle>
    <DialogContent><Stack spacing={2.5} mt={.5}>
      <Alert severity="warning">La cuenta pierde el acceso hasta que la desbloquees. Sus datos quedan guardados.</Alert>
      <FormControl fullWidth><InputLabel id="block-reason">Motivo</InputLabel><Select labelId="block-reason" label="Motivo" value={reason} onChange={event => setReason(event.target.value)}>{blockReasons.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</Select></FormControl>
      <TextField multiline minRows={3} label="Observación interna (opcional)" value={note} onChange={event => setNote(event.target.value)} inputProps={{ maxLength: 1000 }} />
      {error && <Alert severity="error">{error}</Alert>}
    </Stack></DialogContent>
    <DialogActions><Button onClick={onClose}>Cancelar</Button><Button color="error" variant="contained" disabled={saving} onClick={() => onConfirm(reason, note.trim())}>{saving ? 'Bloqueando…' : 'Bloquear cuenta'}</Button></DialogActions>
  </Dialog>
}

export function UnblockDialog({ open, target, saving, error, onClose, onConfirm }: { open: boolean; target: Target | null; saving: boolean; error?: string; onClose: () => void; onConfirm: (date: string | null) => void }) {
  const [date, setDate] = useState('')
  useEffect(() => { if (open) setDate('') }, [open])
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
    <DialogTitle>Desbloquear {target?.name}</DialogTitle>
    <DialogContent><Stack spacing={2.5} mt={.5}>
      <Typography variant="body2" color="text.secondary">Podés mantener el vencimiento actual (<b>{formatLong(target?.access.expiresAt)}</b>) o asignar una nueva fecha al desbloquear.</Typography>
      <TextField type="date" label="Nueva fecha de vencimiento (opcional)" value={date} onChange={event => setDate(event.target.value)} InputLabelProps={{ shrink: true }} />
      {error && <Alert severity="error">{error}</Alert>}
    </Stack></DialogContent>
    <DialogActions><Button onClick={onClose}>Cancelar</Button><Button color="success" variant="contained" disabled={saving} onClick={() => onConfirm(date || null)}>{saving ? 'Desbloqueando…' : 'Desbloquear cuenta'}</Button></DialogActions>
  </Dialog>
}

export interface Target { id: string; name: string; access: AccountAccess; graceDaysOverride?: number | null }

/** Renovación, vencimiento, bloqueo y desbloqueo de un negocio, disponibles tanto en la tabla como en el detalle. */
export function useBusinessLifecycleActions(onDone: (message: string, businessId: string) => void) {
  const [target, setTarget] = useState<Target | null>(null)
  const [mode, setMode] = useState<'RENEW' | 'EXPIRY' | 'BLOCK' | 'UNBLOCK' | null>(null)
  const [presetDays, setPresetDays] = useState(30)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const close = () => { setMode(null); setTarget(null); setError('') }
  const run = async (businessId: string, action: () => Promise<unknown>, success: string) => {
    setSaving(true); setError('')
    try { await action(); close(); onDone(success, businessId) }
    catch (actionError) { setError(apiErrorMessage(actionError, 'No pudimos completar la acción.')) }
    finally { setSaving(false) }
  }
  const open = (next: Target, nextMode: 'RENEW' | 'EXPIRY' | 'BLOCK' | 'UNBLOCK', days = 30) => { setTarget(next); setMode(nextMode); setPresetDays(days); setError('') }
  const element = <>
    <RenewDialog open={mode === 'RENEW'} target={target} saving={saving} error={error} initialDays={presetDays} onClose={close} onConfirm={(days, base) => { if (target) void run(target.id, () => renewAdminBusiness(target.id, days, base), 'Vigencia renovada correctamente.') }} />
    <ExpiryDialog open={mode === 'EXPIRY'} target={target} saving={saving} error={error} onClose={close} onConfirm={(date, graceDaysOverride) => { if (target) void run(target.id, () => setAdminBusinessExpiry(target.id, new Date(`${date}T23:59:59-03:00`).toISOString(), graceDaysOverride), 'Vencimiento actualizado.') }} />
    <BlockDialog open={mode === 'BLOCK'} target={target} saving={saving} error={error} onClose={close} onConfirm={(reason, note) => { if (target) void run(target.id, () => blockAdminBusiness(target.id, reason, note || undefined), 'Cuenta bloqueada manualmente.') }} />
    <UnblockDialog open={mode === 'UNBLOCK'} target={target} saving={saving} error={error} onClose={close} onConfirm={date => { if (target) void run(target.id, () => unblockAdminBusiness(target.id, date ? new Date(`${date}T23:59:59-03:00`).toISOString() : undefined), 'Cuenta desbloqueada.') }} />
  </>
  return {
    element,
    openRenew: (next: Target, days = 30) => open(next, 'RENEW', days),
    openExpiry: (next: Target) => open(next, 'EXPIRY'),
    openBlock: (next: Target) => open(next, 'BLOCK'),
    openUnblock: (next: Target) => open(next, 'UNBLOCK'),
  }
}


