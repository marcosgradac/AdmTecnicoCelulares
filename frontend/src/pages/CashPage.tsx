import { useEffect, useState } from 'react'
import { Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Grid, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { AddRounded, ArrowDownwardRounded, ArrowUpwardRounded, PaymentsRounded, PendingActionsRounded } from '@mui/icons-material'
import { PageHeader } from '../components/common/PageHeader'
import { StatCard } from '../components/common/StatCard'
import { UiState } from '../components/common/UiState'
import { formatMoney } from '../utils/format'
import { createCashMovement, getCashMovements, type CashMovement } from '../services/operations'

export function CashPage() {
  const [movements, setMovements] = useState<CashMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ type: 'EXPENSE' as 'INCOME' | 'EXPENSE', description: '', amount: 0, method: 'TRANSFER' as 'CASH' | 'TRANSFER' | 'CARD' | 'OTHER' })
  const load = () => { setLoading(true); getCashMovements().then(setMovements).catch(() => setError('No pudimos cargar los movimientos.')).finally(() => setLoading(false)) }
  useEffect(load, [])
  const today = new Date().toDateString()
  const todayMovements = movements.filter(item => new Date(item.createdAt).toDateString() === today)
  const income = todayMovements.filter(item => item.type === 'INCOME').reduce((sum, item) => sum + item.amount, 0)
  const expense = todayMovements.filter(item => item.type === 'EXPENSE').reduce((sum, item) => sum + item.amount, 0)
  const save = async () => { try { await createCashMovement(form); setOpen(false); load() } catch { setError('No pudimos registrar el movimiento.') } }
  return <Box><PageHeader eyebrow="FINANZAS" title="Caja" description="Ingresos, egresos y movimientos del servicio técnico." action={<Button variant="contained" startIcon={<AddRounded />} onClick={() => setOpen(true)}>Registrar movimiento</Button>} />
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    <Grid container spacing={1.5} mb={2.2}><Grid size={{ xs: 6, lg: 3 }}><StatCard label="Ingresos de hoy" value={formatMoney(income)} icon={<ArrowUpwardRounded />} tone="success" /></Grid><Grid size={{ xs: 6, lg: 3 }}><StatCard label="Egresos de hoy" value={formatMoney(expense)} icon={<ArrowDownwardRounded />} tone="warning" /></Grid><Grid size={{ xs: 6, lg: 3 }}><StatCard label="Balance" value={formatMoney(income - expense)} icon={<PaymentsRounded />} /></Grid><Grid size={{ xs: 6, lg: 3 }}><StatCard label="Movimientos" value={String(movements.length)} icon={<PendingActionsRounded />} tone="info" /></Grid></Grid>
    <Card><CardContent><Typography variant="h2">Últimos movimientos</Typography><Typography variant="body2" color="text.secondary" mb={2}>Pagos de reparaciones y operaciones manuales</Typography>{loading ? <UiState loading/> : !movements.length ? <UiState title="Todavía no hay movimientos"/> : <Stack divider={<Box borderTop="1px solid" borderColor="divider"/>}>{movements.map(item => <Stack key={item.id} direction="row" alignItems="center" gap={1.5} py={1.7}><Box color={item.type === 'INCOME' ? 'success.main' : 'error.main'}>{item.type === 'INCOME' ? <ArrowUpwardRounded/> : <ArrowDownwardRounded/>}</Box><Box flex={1}><Typography variant="body2" fontWeight={750}>{item.description}</Typography><Typography variant="caption" color="text.secondary">{item.clientName || 'Movimiento de caja'} · {new Date(item.createdAt).toLocaleString('es-AR')}</Typography></Box><Chip label={`${item.type === 'INCOME' ? '+' : '-'}${formatMoney(item.amount)}`} color={item.type === 'INCOME' ? 'success' : 'error'} variant="outlined"/></Stack>)}</Stack>}</CardContent></Card>
    <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs"><DialogTitle>Registrar movimiento</DialogTitle><DialogContent><Stack spacing={2} mt={1}><TextField select label="Tipo" value={form.type} onChange={event => setForm(value => ({ ...value, type: event.target.value as typeof value.type }))}><MenuItem value="INCOME">Ingreso</MenuItem><MenuItem value="EXPENSE">Egreso</MenuItem></TextField><TextField label="Descripción" value={form.description} onChange={event => setForm(value => ({ ...value, description: event.target.value }))}/><TextField type="number" label="Importe" value={form.amount} onChange={event => setForm(value => ({ ...value, amount: Number(event.target.value) }))}/><TextField select label="Método" value={form.method} onChange={event => setForm(value => ({ ...value, method: event.target.value as typeof value.method }))}>{[['CASH','Efectivo'],['TRANSFER','Transferencia'],['CARD','Tarjeta'],['OTHER','Otro']].map(option => <MenuItem key={option[0]} value={option[0]}>{option[1]}</MenuItem>)}</TextField></Stack></DialogContent><DialogActions><Button onClick={() => setOpen(false)}>Cancelar</Button><Button variant="contained" disabled={!form.description || form.amount <= 0} onClick={() => void save()}>Guardar</Button></DialogActions></Dialog>
  </Box>
}
