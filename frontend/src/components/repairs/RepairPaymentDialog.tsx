import { useEffect, useState } from 'react'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField } from '@mui/material'
import axios from 'axios'
import { registerPayment } from '../../services/operations'
import type { Repair } from '../../types'
import { CurrencyField } from '../common/CurrencyField'

type Method = 'CASH' | 'TRANSFER' | 'CARD' | 'OTHER'
export function RepairPaymentDialog({ repair, onClose, onRegistered }: { repair?: Repair; onClose: () => void; onRegistered: () => void }) {
  const [amount, setAmount] = useState<number | null>(null), [method, setMethod] = useState<Method>('TRANSFER'), [saving, setSaving] = useState(false), [error, setError] = useState('')
  useEffect(() => { if (repair) { setAmount(null); setMethod('TRANSFER'); setError('') } }, [repair])
  const save = async () => { if (!repair) return; if (amount == null) return setError('Ingresá un monto'); if (amount <= 0) return setError('El monto debe ser mayor que cero'); setSaving(true); setError(''); try { await registerPayment(repair.id, { amount, method }); onRegistered() } catch (cause) { setError(axios.isAxiosError<{message?:string}>(cause) ? cause.response?.data?.message ?? 'No pudimos registrar el pago.' : 'No pudimos registrar el pago.') } finally { setSaving(false) } }
  return <Dialog open={Boolean(repair)} onClose={saving ? undefined : onClose} fullWidth maxWidth="xs"><DialogTitle>Registrar pago</DialogTitle><DialogContent><Stack spacing={2} mt={1}>{error && <Alert severity="error">{error}</Alert>}<CurrencyField required label="Importe" value={amount} onValueChange={setAmount} onEmpty={()=>setAmount(null)} error={Boolean(error) && (amount == null || amount <= 0)} helperText={Boolean(error) && amount == null ? 'Ingresá un monto' : undefined}/><TextField select label="Método" value={method} onChange={event => setMethod(event.target.value as Method)}><MenuItem value="CASH">Efectivo</MenuItem><MenuItem value="TRANSFER">Transferencia</MenuItem><MenuItem value="CARD">Tarjeta</MenuItem><MenuItem value="OTHER">Otro</MenuItem></TextField></Stack></DialogContent><DialogActions><Button onClick={onClose} disabled={saving}>Cancelar</Button><Button variant="contained" disabled={saving || amount == null || amount <= 0} onClick={() => void save()}>{saving ? 'Guardando…' : 'Guardar pago'}</Button></DialogActions></Dialog>
}
