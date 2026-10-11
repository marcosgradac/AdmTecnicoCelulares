import { useEffect, useState } from 'react'
import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Stack, TextField, Typography } from '@mui/material'
import axios from 'axios'
import type { Repair } from '../../types'
import { getRepair, registerCancellationRefund, registerRepairFinancialOperation, type FinancialMethod } from '../../services/repairs'
import { formatMoney } from '../../utils/format'
import { CurrencyField } from '../common/CurrencyField'

type Kind = 'PURCHASE' | 'SUPPLIER_REFUND' | 'EXPENSE_CORRECTION' | 'CUSTOMER_REFUND'
const titles: Record<Kind, string> = { PURCHASE: 'Registrar compra real', SUPPLIER_REFUND: 'Registrar devolución del proveedor', EXPENSE_CORRECTION: 'Corregir gasto que nunca existió', CUSTOMER_REFUND: 'Registrar devolución al cliente' }

export function RepairFinancialOperationDialog({ repair, kind, onClose, onRegistered }: { repair?: Repair; kind: Kind; onClose: () => void; onRegistered: (repair: Repair) => void }) {
  const [loaded, setLoaded] = useState<Repair>()
  const [amount, setAmount] = useState<number | null>(null)
  const [movementId, setMovementId] = useState('')
  const [method, setMethod] = useState<FinancialMethod>('TRANSFER')
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [requestId, setRequestId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setLoaded(undefined); setAmount(null); setMovementId(''); setConfirmed(false); setError(''); setReason(''); setRequestId(crypto.randomUUID())
    if (repair) void getRepair(repair.id).then(value => { if (active) { setLoaded(value); if (kind === 'CUSTOMER_REFUND') setAmount(value.financialSummary?.refundBalance ?? 0) } }).catch(() => { if (active) setError('No pudimos cargar la liquidación.') })
    return () => { active = false }
  }, [repair?.id, kind])
  const expenses = (loaded?.expenseEntries ?? []).filter(row => row.remaining > 0)
  const selected = expenses.find(row => row.id === movementId)
  const correction = kind === 'EXPENSE_CORRECTION'
  const save = async () => {
    if (!loaded || saving || !confirmed) return
    if (amount == null || amount <= 0) return setError('Ingresá un importe positivo.')
    if (correction && reason.trim().length < 5) return setError('Explicá por qué ese gasto nunca existió.')
    if ((kind === 'SUPPLIER_REFUND' || correction) && !selected) return setError('Seleccioná el gasto original.')
    if (selected && amount > selected.remaining) return setError('No podés compensar más que el gasto pendiente.')
    setSaving(true); setError('')
    try {
      const result = kind === 'CUSTOMER_REFUND'
        ? await registerCancellationRefund(loaded.id, { requestId, amount, method, confirmed: true })
        : await registerRepairFinancialOperation(loaded.id, { requestId, kind, amount, confirmed: true, ...(correction ? { reason: reason.trim() } : { method }), ...(selected ? { movementId: selected.id } : {}) })
      onRegistered(result)
    } catch (cause) { setError(axios.isAxiosError<{ message?: string }>(cause) ? cause.response?.data?.message ?? 'No pudimos registrar la operación.' : 'No pudimos registrar la operación.') }
    finally { setSaving(false) }
  }
  return <Dialog open={Boolean(repair)} onClose={saving ? undefined : onClose} fullWidth maxWidth="sm"><DialogTitle>{titles[kind]}</DialogTitle><DialogContent><Stack spacing={2} mt={1}>
    {error && <Alert severity="error">{error}</Alert>}
    {(kind === 'SUPPLIER_REFUND' || correction) && <TextField select label="Gasto original" value={movementId} onChange={event => { const id = event.target.value; setMovementId(id); setAmount(expenses.find(row => row.id === id)?.remaining ?? null); setConfirmed(false) }} disabled={saving}><MenuItem value="">Seleccionar</MenuItem>{expenses.map(row => <MenuItem key={row.id} value={row.id}>{row.description} · {formatMoney(row.remaining)}{row.historical ? ' · Histórico por conciliar' : ''}</MenuItem>)}</TextField>}
    {correction && <Alert severity="info">El movimiento original permanece. Esta corrección reduce el gasto registrado sin inventar dinero recibido; se registra hoy y no cambia fechas anteriores.</Alert>}
    <CurrencyField label={correction ? 'Importe a corregir' : 'Importe real'} value={amount} onValueChange={value => { setAmount(value); setConfirmed(false) }} onEmpty={() => setAmount(null)} disabled={saving || correction} />
    {correction ? <TextField required multiline label="Motivo de la corrección" value={reason} onChange={event => setReason(event.target.value)} disabled={saving}/> : <TextField select label="Medio de pago" value={method} onChange={event => setMethod(event.target.value as FinancialMethod)} disabled={saving}><MenuItem value="CASH">Efectivo</MenuItem><MenuItem value="TRANSFER">Transferencia</MenuItem><MenuItem value="CARD">Tarjeta</MenuItem><MenuItem value="OTHER">Otro</MenuItem></TextField>}
    <FormControlLabel control={<Checkbox checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/>} label={correction ? 'Confirmo que ese dinero nunca salió del taller.' : kind === 'PURCHASE' ? 'Confirmo que pagué realmente esta compra.' : kind === 'CUSTOMER_REFUND' ? 'Confirmo que ya devolví realmente este dinero al cliente.' : 'Confirmo que recibí realmente la devolución del proveedor.'} disabled={saving}/>
    <Typography variant="caption">Esta operación conserva todos los movimientos previos y no modifica inventario.</Typography>
  </Stack></DialogContent><DialogActions><Button onClick={onClose} disabled={saving}>Volver</Button><Button variant="contained" disabled={saving || !loaded || !confirmed || !amount || amount < 0} onClick={() => void save()}>Registrar operación</Button></DialogActions></Dialog>
}
