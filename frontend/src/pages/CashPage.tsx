import { useEffect, useRef, useState } from 'react'
import { Alert, Box, Button, Card, CardContent, Chip, Grid, Stack, TablePagination, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { useSearchParams } from 'react-router-dom'
import { AddRounded, ArrowDownwardRounded, ArrowUpwardRounded, PaymentsRounded, PendingActionsRounded } from '@mui/icons-material'
import { PageHeader } from '../components/common/PageHeader'
import { StatCard } from '../components/common/StatCard'
import { UiState } from '../components/common/UiState'
import { formatMoney } from '../utils/format'
import { getCashMovements, type CashMovement, type CashMovementsSummary } from '../services/operations'
import { NewCashMovementDrawer } from '../components/cash/NewCashMovementDrawer'
import { useSubscription } from '../features/billing/SubscriptionContext'
import { useAuth } from '../auth/AuthContext'
import { canAccess } from '../auth/permissions'

const originLabels = { GENERAL: 'General', REPAIR: 'Reparaciones', EQUIPMENT: 'Venta de equipos', COMMERCE: 'Comercio' }

export function CashPage() {
  const { commerceEnabled, loading: subscriptionLoading } = useSubscription()
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const originParam = params.get('origin')
  const origin = originParam === 'REPAIR' || originParam === 'EQUIPMENT' || originParam === 'COMMERCE' ? originParam : undefined
  const canCreate = canAccess(user, 'cash.create') && origin !== 'COMMERCE'
  const [movements, setMovements] = useState<CashMovement[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [summary, setSummary] = useState<CashMovementsSummary>({ incomeToday: 0, expenseToday: 0, balanceToday: 0, totalMovements: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const latestRequest = useRef(0)
  const load = async (requestedPage = page) => {
    const requestId = ++latestRequest.current
    if (subscriptionLoading || origin === 'COMMERCE' && !commerceEnabled) { setLoading(false); setMovements([]); setTotal(0); setSummary({ incomeToday: 0, expenseToday: 0, balanceToday: 0, totalMovements: 0 }); return }
    setLoading(true)
    setError('')
    try {
      const data = await getCashMovements({ page: requestedPage + 1, pageSize: 10, origin })
      if (requestId !== latestRequest.current) return
      if (requestedPage > 0 && !data.items.length && data.total > 0) {
        setPage(requestedPage - 1)
        return
      }
      setMovements(data.items)
      setTotal(data.total)
      setSummary(data.summary)
    } catch {
      if (requestId === latestRequest.current) setError('No pudimos cargar los movimientos.')
    } finally {
      if (requestId === latestRequest.current) setLoading(false)
    }
  }
  useEffect(() => { void load(page); return () => { latestRequest.current++ } }, [page, origin, commerceEnabled, subscriptionLoading])
  const selectOrigin = (value: string | null) => { if (!value) return; const next = new URLSearchParams(params); if (value !== 'GENERAL') next.set('origin', value); else next.delete('origin'); setParams(next); setPage(0) }
  const title = origin ? `Caja de ${originLabels[origin]}` : 'Caja General'
  return <Box data-tutorial="cash-overview"><PageHeader eyebrow="FINANZAS" title={title} description="Ingresos, egresos y movimientos identificados por origen." action={canCreate ? <Button variant="contained" startIcon={<AddRounded />} onClick={() => setOpen(true)}>Registrar movimiento</Button> : undefined} />
    <ToggleButtonGroup exclusive value={origin ?? 'GENERAL'} onChange={(_, value) => selectOrigin(value)} sx={{ mb: 2, flexWrap: 'wrap' }} aria-label="Origen de caja"><ToggleButton value="GENERAL">General</ToggleButton><ToggleButton value="REPAIR">Reparaciones</ToggleButton><ToggleButton value="EQUIPMENT">Venta de equipos</ToggleButton><ToggleButton value="COMMERCE" disabled={!commerceEnabled}>Comercio</ToggleButton></ToggleButtonGroup>
    {origin === 'COMMERCE' && !commerceEnabled && !subscriptionLoading && <Alert severity="info">Comercio requiere el plan COMPLETE.</Alert>}
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    <Grid container spacing={1.5} mb={2.2}><Grid size={{ xs: 6, lg: 3 }}><StatCard label="Ingresos de hoy" value={formatMoney(summary.incomeToday)} icon={<ArrowUpwardRounded />} tone="success" /></Grid><Grid size={{ xs: 6, lg: 3 }}><StatCard label="Egresos de hoy" value={formatMoney(summary.expenseToday)} icon={<ArrowDownwardRounded />} tone="warning" /></Grid><Grid size={{ xs: 6, lg: 3 }}><StatCard label="Balance" value={formatMoney(summary.balanceToday)} icon={<PaymentsRounded />} /></Grid><Grid size={{ xs: 6, lg: 3 }}><StatCard label="Movimientos" value={String(summary.totalMovements)} icon={<PendingActionsRounded />} tone="info" /></Grid></Grid>
    <Card><CardContent><Typography variant="h2">Últimos movimientos</Typography><Typography variant="body2" color="text.secondary" mb={2}>{origin ? `Movimientos de ${originLabels[origin]}` : 'Todos los movimientos con su origen identificado'}</Typography>{loading ? <UiState loading/> : !movements.length ? <UiState title="Esta caja todavía no tiene movimientos" description="Registrá un ingreso o egreso para comenzar a ver el flujo del negocio." action={canCreate ? () => setOpen(true) : undefined} actionLabel="Registrar movimiento"/> : <Stack divider={<Box borderTop="1px solid" borderColor="divider"/>}>{movements.map(item => <Stack key={item.id} direction="row" alignItems="center" gap={1.5} py={1.7}><Box color={item.type === 'INCOME' ? 'success.main' : 'error.main'}>{item.type === 'INCOME' ? <ArrowUpwardRounded/> : <ArrowDownwardRounded/>}</Box><Box flex={1}><Typography variant="body2" fontWeight={750}>{item.description}</Typography><Typography variant="caption" color="text.secondary">{originLabels[item.origin]} · {item.clientName || 'Movimiento de caja'} · {new Date(item.createdAt).toLocaleString('es-AR')}</Typography></Box><Chip label={`${item.type === 'INCOME' ? '+' : '-'}${formatMoney(item.amount)}`} color={item.type === 'INCOME' ? 'success' : 'error'} variant="outlined"/></Stack>)}</Stack>}{total > 0 && <TablePagination component="div" count={total} page={page} onPageChange={(_, next) => setPage(next)} rowsPerPage={10} rowsPerPageOptions={[10]} labelRowsPerPage="Movimientos por página" labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`} getItemAriaLabel={type => ({ first: 'Primera página', last: 'Última página', next: 'Página siguiente', previous: 'Página anterior' })[type]}/>}</CardContent></Card>
    <NewCashMovementDrawer key={origin ?? 'GENERAL'} origin={origin === 'COMMERCE' ? 'GENERAL' : origin ?? 'GENERAL'} open={open && canCreate} onClose={() => setOpen(false)} onCreated={() => { setOpen(false); void load() }}/>
  </Box>
}
