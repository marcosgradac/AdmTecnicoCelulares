import { useEffect, useState } from 'react'
import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel, MenuItem, Radio, RadioGroup, Stack, TextField, Typography } from '@mui/material'
import axios from 'axios'
import { cancelRepair, getCancellationPreview, getRepair, type CancelRepairInput, type CancellationPreview, type ExpenseDecision, type FinancialMethod } from '../../services/repairs'
import type { Repair } from '../../types'
import { formatMoney } from '../../utils/format'
import { CurrencyField } from '../common/CurrencyField'
import { useAuth } from '../../auth/AuthContext'
import { canAccess } from '../../auth/permissions'

type Decision = { disposition: ExpenseDecision['disposition'] | ''; amount: number; confirmed: boolean; method: FinancialMethod; reason: string; stockDisposition: '' | 'LOST' | 'KEPT_FOR_STOCK' }
const initialDecision = (): Decision => ({ disposition: '', amount: 0, confirmed: false, method: 'TRANSFER', reason: '', stockDisposition: '' })
const methodNames = { CASH: 'Efectivo', TRANSFER: 'Transferencia', CARD: 'Tarjeta', OTHER: 'Otro' }

export function RepairCancellationDialog({ repair, onClose, onCancelled }: { repair?: Repair; onClose: () => void; onCancelled: (repair: Repair) => void }) {
  const { user } = useAuth()
  const financial = canAccess(user, 'repairs.viewFinancials') && canAccess(user, 'cash.create')
  const [loaded, setLoaded] = useState<Repair>()
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [charge, setCharge] = useState<'no' | 'yes'>('no')
  const [reviewFee, setReviewFee] = useState<number | null>(null)
  const [refundConfirmed, setRefundConfirmed] = useState(false)
  const [refundMethod, setRefundMethod] = useState<FinancialMethod>('CASH')
  const [requestId, setRequestId] = useState('')
  const [preview, setPreview] = useState<CancellationPreview>()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setLoaded(undefined); setDecisions({}); setCharge('no'); setReviewFee(null); setRefundConfirmed(false); setRefundMethod('CASH'); setPreview(undefined); setError('')
    if (repair) {
      setRequestId(crypto.randomUUID())
      void getRepair(repair.id).then(current => { if (active) { setLoaded(current); setDecisions(Object.fromEntries((current.expenseEntries ?? []).filter(row => row.remaining > 0).map(row => [row.id, initialDecision()]))) } }).catch(() => { if (active) setError('No pudimos cargar la liquidación. Cerrá e intentá nuevamente.') })
    }
    return () => { active = false }
  }, [repair?.id])
  const paid = loaded?.paid ?? 0
  const fee = charge === 'yes' ? reviewFee ?? 0 : 0
  const refundDue = Math.max(0, paid - fee)
  const expenses = (loaded?.expenseEntries ?? []).filter(row => row.remaining > 0)
  const changeDecision = (id: string, changes: Partial<Decision>) => { setDecisions(current => ({ ...current, [id]: { ...current[id], ...changes } })); setPreview(undefined); setError('') }
  const payload = (): CancelRepairInput => ({ requestId, reviewFee: fee, refundConfirmed, ...(refundDue && refundConfirmed ? { refundMethod } : {}), expenses: expenses.map(row => {
    const decision = decisions[row.id]
    return { movementId: row.id, disposition: decision.disposition as ExpenseDecision['disposition'], ...(decision.disposition === 'KEEP' ? { stockDisposition: decision.stockDisposition as 'LOST' | 'KEPT_FOR_STOCK' } : { confirmed: decision.confirmed, ...(decision.disposition === 'NOT_PURCHASED' ? { reason: decision.reason.trim() } : { method: decision.method }), ...(decision.disposition === 'REFUND_PARTIAL' ? { amount: decision.amount } : {}) }) }
  }) })
  const review = async () => {
    if (!loaded || saving) return
    if (!financial && (paid > 0 || expenses.length > 0)) return setError('Un usuario con permisos financieros y de Caja debe liquidar esta cancelación.')
    if (charge === 'yes' && reviewFee == null) return setError('Ingresá el costo de revisión')
    for (const row of expenses) {
      const decision = decisions[row.id]
      if (!decision?.disposition) return setError('Indicá qué pasó con cada gasto de repuestos.')
      if (decision.disposition === 'KEEP' && !decision.stockDisposition) return setError('Indicá si conservás el repuesto para stock o si el gasto es definitivo.')
      if (decision.disposition !== 'KEEP' && !decision.confirmed) return setError('Confirmá la devolución real o la corrección sin dinero; elegir una opción no registra dinero recibido.')
      if (decision.disposition === 'NOT_PURCHASED' && decision.reason.trim().length < 5) return setError('Explicá por qué ese gasto nunca existió.')
      if (decision.disposition === 'REFUND_PARTIAL' && (decision.amount <= 0 || decision.amount >= row.remaining)) return setError('La recuperación parcial debe ser positiva y menor que el gasto pendiente.')
    }
    setSaving(true); setError('')
    try { setPreview(await getCancellationPreview(loaded.id, payload())) }
    catch (cause) { setError(axios.isAxiosError<{ message?: string }>(cause) ? cause.response?.data?.message ?? 'No pudimos revisar la liquidación.' : 'No pudimos revisar la liquidación.') }
    finally { setSaving(false) }
  }
  const confirm = async () => {
    if (!loaded || !preview || saving) return
    setSaving(true); setError('')
    try { onCancelled(await cancelRepair(loaded.id, { ...payload(), expectedVersion: preview.version })) }
    catch (cause) { if (axios.isAxiosError(cause) && cause.response?.status === 409) setPreview(undefined); setError(axios.isAxiosError<{ message?: string }>(cause) ? cause.response?.data?.message ?? 'No pudimos cancelar.' : 'No pudimos cancelar.') }
    finally { setSaving(false) }
  }
  const change = (action: () => void) => { action(); setPreview(undefined); setError('') }
  const row = (label: string, amount: number) => <Stack direction="row" justifyContent="space-between" gap={2}><Typography>{label}</Typography><Typography fontWeight={800}>{formatMoney(amount)}</Typography></Stack>
  return <Dialog open={Boolean(repair)} onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
    <DialogTitle>Cancelar reparación #{repair?.number}</DialogTitle>
    <DialogContent><Stack spacing={2} mt={1}>
      {error && <Alert severity="error">{error}</Alert>}
      {!loaded && !error && <Typography>Cargando liquidación…</Typography>}
      {loaded && <>
        <Typography fontWeight={700}>¿Qué pasó con los gastos de repuestos?</Typography>
        {!expenses.length && <Alert severity="info">No hay compras registradas. El presupuesto no es un egreso. Si hubo una compra real, registrala antes de cancelar.</Alert>}
        {financial && expenses.map(expense => {
          const decision = decisions[expense.id] ?? initialDecision()
          const recovery = ['REFUND_FULL', 'REFUND_PARTIAL'].includes(decision.disposition)
          return <Stack key={expense.id} spacing={1} sx={{ border: '1px solid', borderColor: 'divider', p: 2, borderRadius: 2 }}>
            <Typography fontWeight={700}>{expense.description} · {formatMoney(expense.remaining)}</Typography>
            {expense.historical && <Alert severity="warning">Registro histórico: confirmá qué ocurrió. No lo deducimos del presupuesto.</Alert>}
            <RadioGroup aria-label={`Destino del gasto ${expense.id}`} value={decision.disposition} onChange={event => changeDecision(expense.id, { disposition: event.target.value as Decision['disposition'], confirmed: false, reason: '' })}>
              <FormControlLabel value="NOT_PURCHASED" control={<Radio />} label="No compré repuestos." disabled={saving}/>
              <FormControlLabel value="REFUND_FULL" control={<Radio />} label="Recuperé todo el dinero." disabled={saving}/>
              <FormControlLabel value="KEEP" control={<Radio />} label="Conservar el gasto: no pude recuperar el dinero." disabled={saving}/>
              <FormControlLabel value="REFUND_PARTIAL" control={<Radio />} label="Recuperé solamente una parte." disabled={saving}/>
            </RadioGroup>
            {decision.disposition === 'REFUND_PARTIAL' && <CurrencyField label="Importe recuperado" value={decision.amount} onValueChange={amount => changeDecision(expense.id, { amount })} disabled={saving}/>
            }
            {recovery && <><TextField select label="Medio de devolución del proveedor" value={decision.method} onChange={event => changeDecision(expense.id, { method: event.target.value as FinancialMethod })} disabled={saving}>{Object.entries(methodNames).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField><FormControlLabel control={<Checkbox checked={decision.confirmed} onChange={event => changeDecision(expense.id, { confirmed: event.target.checked })}/>} label="Confirmo que recibí realmente la devolución del proveedor." disabled={saving}/></>}
            {decision.disposition === 'NOT_PURCHASED' && <><Alert severity="info">Se conserva el egreso original y se corrige su efecto contable. No se registra dinero recibido.</Alert><TextField label="Motivo de la corrección" value={decision.reason} onChange={event => changeDecision(expense.id, { reason: event.target.value })} disabled={saving}/><FormControlLabel control={<Checkbox checked={decision.confirmed} onChange={event => changeDecision(expense.id, { confirmed: event.target.checked })}/>} label="Confirmo que ese dinero nunca salió del taller." disabled={saving}/></>}
            {decision.disposition === 'KEEP' && <><TextField select label="Destino del repuesto" value={decision.stockDisposition} onChange={event => changeDecision(expense.id, { stockDisposition: event.target.value as Decision['stockDisposition'] })} disabled={saving}><MenuItem value="">Seleccionar destino</MenuItem><MenuItem value="LOST">Gasto definitivo o pérdida</MenuItem><MenuItem value="KEPT_FOR_STOCK">Conservado para stock</MenuItem></TextField><Typography variant="caption">Conservarlo no devuelve dinero. El stock requiere una operación explícita; esta cancelación no modifica inventario.</Typography></>}
          </Stack>
        })}
        {financial && <><Divider/><Typography fontWeight={700}>¿Vas a conservar o cobrar la revisión del equipo?</Typography><RadioGroup aria-label="Cobro de revisión" value={charge} onChange={event => change(() => setCharge(event.target.value as 'no' | 'yes'))}><FormControlLabel value="no" control={<Radio/>} label="No cobrar revisión" disabled={saving}/><FormControlLabel value="yes" control={<Radio/>} label="Cobrar revisión" disabled={saving}/></RadioGroup>{charge === 'yes' && <CurrencyField required label="Costo de revisión" value={reviewFee} onValueChange={value => change(() => setReviewFee(value))} onEmpty={() => change(() => setReviewFee(null))} disabled={saving} helperText="Los pagos anteriores se conservan. Lo que falte cobrar queda pendiente."/>}{row('Abonado anteriormente', paid)}
          {refundDue > 0 && <><Alert severity="info">Corresponde devolver {formatMoney(refundDue)}. Si todavía no lo hiciste, queda pendiente sin generar egreso.</Alert><FormControlLabel control={<Checkbox checked={refundConfirmed} onChange={event => change(() => setRefundConfirmed(event.target.checked))}/>} label="Confirmo que ya devolví realmente el dinero al cliente." disabled={saving}/>{refundConfirmed && <TextField select label="Medio de devolución al cliente" value={refundMethod} onChange={event => change(() => setRefundMethod(event.target.value as FinancialMethod))} disabled={saving}>{Object.entries(methodNames).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>}</>}
        </>}
        {preview && <Stack spacing={1} role="status" aria-label="Vista previa financiera" sx={{ p: 2, borderRadius: 2, bgcolor: 'action.hover' }}><Typography fontWeight={800}>Resultado antes de confirmar</Typography>{row('Flujo de dinero registrado', preview.projectedCashNet)}{preview.accountingAdjustment !== 0 && row('Ajustes sin movimiento de dinero', preview.accountingAdjustment)}{row('Saldo conciliado', preview.projectedNet)}{row('Revisión pendiente de cobro', preview.reviewBalance)}{row('Devolución pendiente al cliente', preview.refundBalance)}<Typography variant="caption">Se conserva la reparación y todos sus movimientos originales.</Typography></Stack>}
      </>}
    </Stack></DialogContent>
    <DialogActions><Button onClick={onClose} disabled={saving}>Volver</Button>{preview ? <Button variant="contained" color="error" disabled={saving} onClick={() => void confirm()}>Confirmar cancelación</Button> : <Button variant="contained" disabled={saving || !loaded} onClick={() => void review()}>Revisar liquidación</Button>}</DialogActions>
  </Dialog>
}
