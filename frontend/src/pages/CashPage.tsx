import { useEffect, useState } from 'react'
import { Alert, Box, Button, Card, CardContent, Chip, Grid, Stack, TablePagination, Typography } from '@mui/material'
import { AddRounded, ArrowDownwardRounded, ArrowUpwardRounded, PaymentsRounded, PendingActionsRounded } from '@mui/icons-material'
import { PageHeader } from '../components/common/PageHeader'
import { StatCard } from '../components/common/StatCard'
import { UiState } from '../components/common/UiState'
import { formatMoney } from '../utils/format'
import { getCashMovements, type CashMovement, type CashMovementsSummary } from '../services/operations'
import { NewCashMovementDrawer } from '../components/cash/NewCashMovementDrawer'

export function CashPage() {
  const [movements, setMovements] = useState<CashMovement[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [summary, setSummary] = useState<CashMovementsSummary>({ incomeToday: 0, expenseToday: 0, balanceToday: 0, totalMovements: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const load = async (requestedPage = page) => {
    setLoading(true)
    setError('')
    try {
      const data = await getCashMovements({ page: requestedPage + 1, pageSize: 10 })
      if (requestedPage > 0 && !data.items.length && data.total > 0) {
        setPage(requestedPage - 1)
        return
      }
      setMovements(data.items)
      setTotal(data.total)
      setSummary(data.summary)
    } catch {
      setError('No pudimos cargar los movimientos.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load(page) }, [page])
  return <Box data-tutorial="cash-overview"><PageHeader eyebrow="FINANZAS" title="Caja" description="Ingresos, egresos y movimientos del servicio técnico." action={<Button variant="contained" startIcon={<AddRounded />} onClick={() => setOpen(true)}>Registrar movimiento</Button>} />
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    <Grid container spacing={1.5} mb={2.2}><Grid size={{ xs: 6, lg: 3 }}><StatCard label="Ingresos de hoy" value={formatMoney(summary.incomeToday)} icon={<ArrowUpwardRounded />} tone="success" /></Grid><Grid size={{ xs: 6, lg: 3 }}><StatCard label="Egresos de hoy" value={formatMoney(summary.expenseToday)} icon={<ArrowDownwardRounded />} tone="warning" /></Grid><Grid size={{ xs: 6, lg: 3 }}><StatCard label="Balance" value={formatMoney(summary.balanceToday)} icon={<PaymentsRounded />} /></Grid><Grid size={{ xs: 6, lg: 3 }}><StatCard label="Movimientos" value={String(summary.totalMovements)} icon={<PendingActionsRounded />} tone="info" /></Grid></Grid>
    <Card><CardContent><Typography variant="h2">Últimos movimientos</Typography><Typography variant="body2" color="text.secondary" mb={2}>Pagos de reparaciones y operaciones manuales</Typography>{loading ? <UiState loading/> : !movements.length ? <UiState title="Tu caja todavía no tiene movimientos" description="Registrá un ingreso o egreso para comenzar a ver el flujo del negocio." action={() => setOpen(true)} actionLabel="Registrar movimiento"/> : <Stack divider={<Box borderTop="1px solid" borderColor="divider"/>}>{movements.map(item => <Stack key={item.id} direction="row" alignItems="center" gap={1.5} py={1.7}><Box color={item.type === 'INCOME' ? 'success.main' : 'error.main'}>{item.type === 'INCOME' ? <ArrowUpwardRounded/> : <ArrowDownwardRounded/>}</Box><Box flex={1}><Typography variant="body2" fontWeight={750}>{item.description}</Typography><Typography variant="caption" color="text.secondary">{item.clientName || 'Movimiento de caja'} · {new Date(item.createdAt).toLocaleString('es-AR')}</Typography></Box><Chip label={`${item.type === 'INCOME' ? '+' : '-'}${formatMoney(item.amount)}`} color={item.type === 'INCOME' ? 'success' : 'error'} variant="outlined"/></Stack>)}</Stack>}{total > 0 && <TablePagination component="div" count={total} page={page} onPageChange={(_, next) => setPage(next)} rowsPerPage={10} rowsPerPageOptions={[10]} labelRowsPerPage="Movimientos por página" labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`} getItemAriaLabel={type => ({ first: 'Primera página', last: 'Última página', next: 'Página siguiente', previous: 'Página anterior' })[type]}/>}</CardContent></Card>
    <NewCashMovementDrawer open={open} onClose={() => setOpen(false)} onCreated={() => { setOpen(false); void load() }}/>
  </Box>
}
