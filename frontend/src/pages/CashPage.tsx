import { CashMovementList } from '../components/admin/CashMovementList'
import { ListPagination } from '../components/admin/AdminPatterns'
import { useEffect, useRef, useState } from 'react'
import { Alert, Box, Button, Card, CardContent, Grid, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
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
import type { EquipmentSummary } from '../services/equipmentSales'

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
  const [equipmentSummary, setEquipmentSummary] = useState<EquipmentSummary | null>(null)
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
      setEquipmentSummary(data.equipmentSummary ?? null)
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
    <ToggleButtonGroup exclusive value={origin ?? 'GENERAL'} onChange={(_, value) => selectOrigin(value)} sx={{ mb: 2.5, display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))' } }} aria-label="Origen de caja"><ToggleButton value="GENERAL">General</ToggleButton><ToggleButton value="REPAIR">Reparaciones</ToggleButton><ToggleButton value="EQUIPMENT">Venta de equipos</ToggleButton><ToggleButton value="COMMERCE" disabled={!commerceEnabled}>Comercio</ToggleButton></ToggleButtonGroup>
    {origin === 'COMMERCE' && !commerceEnabled && !subscriptionLoading && <Alert severity="info">Comercio requiere el plan COMPLETE.</Alert>}

    {origin === 'EQUIPMENT' ? <>
      <Grid container spacing={1.5} mb={1.5}>
        <Grid size={{ xs: 6, lg: 3 }}><StatCard label="Ventas realizadas" value={equipmentSummary ? String(equipmentSummary.salesCount) : '—'} icon={<ArrowUpwardRounded />} tone="success" /></Grid>
        <Grid size={{ xs: 6, lg: 3 }}><StatCard label="Invertido en compras" value={equipmentSummary ? formatMoney(equipmentSummary.purchaseInvestment) : '—'} icon={<PaymentsRounded />} /></Grid>
        <Grid size={{ xs: 6, lg: 3 }}><StatCard label="Gastos de reparación" value={equipmentSummary ? formatMoney(equipmentSummary.repairInvestment) : '—'} icon={<ArrowDownwardRounded />} tone="warning" /></Grid>
        <Grid size={{ xs: 6, lg: 3 }}><StatCard label="Ganancia real" value={equipmentSummary ? formatMoney(equipmentSummary.realizedProfit) : '—'} icon={<PendingActionsRounded />} tone="success" /></Grid>
      </Grid><Typography variant="body2" color="text.secondary" mb={2}>Acumulado de equipos registrados, neto de ajustes. Los ingresos compensatorios no cuentan como ventas ni ganancias.</Typography>
    </> : <Grid container spacing={1.5} mb={2.2}><Grid size={{ xs: 6, lg: 3 }}><StatCard label={origin === 'REPAIR' ? 'Caja neta hoy' : 'Ingresos de hoy'} value={formatMoney(origin === 'REPAIR' ? summary.balanceToday : summary.incomeToday)} icon={<ArrowUpwardRounded />} tone="success" /></Grid><Grid size={{ xs: 6, lg: 3 }}><StatCard label={origin === 'REPAIR' ? 'Cobrado' : 'Egresos de hoy'} value={formatMoney(origin === 'REPAIR' ? summary.incomeToday : summary.expenseToday)} icon={<ArrowDownwardRounded />} tone="warning" /></Grid><Grid size={{ xs: 6, lg: 3 }}><StatCard label={origin === 'REPAIR' ? 'Devuelto' : 'Balance'} value={formatMoney(origin === 'REPAIR' ? summary.expenseToday : summary.balanceToday)} icon={<PaymentsRounded />} /></Grid><Grid size={{ xs: 6, lg: 3 }}><StatCard label="Movimientos" value={String(summary.totalMovements)} icon={<PendingActionsRounded />} tone="info" /></Grid>{origin === 'REPAIR' && <Grid size={12}><Typography variant="caption" color="text.secondary">La caja neta descuenta las devoluciones: es el dinero real que dejaron las reparaciones de hoy.</Typography></Grid>}</Grid>}
    <Card><CardContent><Typography variant="h2">Últimos movimientos</Typography><Typography variant="body2" color="text.secondary" mb={2}>{origin ? `Movimientos de ${originLabels[origin]}` : 'Todos los movimientos con su origen identificado'}</Typography>{loading ? <UiState loading/> : error ? <UiState title="No pudimos cargar los movimientos" description={error} action={() => void load()} /> : !movements.length ? <UiState title="Esta caja todavía no tiene movimientos" description="Registrá un ingreso o egreso para comenzar a ver el flujo del negocio." action={canCreate ? () => setOpen(true) : undefined} actionLabel="Registrar movimiento"/> : <CashMovementList movements={movements} />}<ListPagination count={total} page={page} rowsPerPage={10} onPageChange={setPage} /></CardContent></Card>
    <NewCashMovementDrawer key={origin ?? 'GENERAL'} origin={origin === 'COMMERCE' ? 'GENERAL' : origin ?? 'GENERAL'} open={open && canCreate} onClose={() => setOpen(false)} onCreated={() => { setOpen(false); void load() }}/>
  </Box>
}
