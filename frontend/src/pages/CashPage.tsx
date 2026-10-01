import { CashMovementList } from '../components/admin/CashMovementList'
import { RepairCashGroupsList } from '../components/cash/RepairCashGroupsList'
import { LooseMovementsTable } from '../components/cash/LooseMovementsTable'
import { CASH_ORIGIN_LABELS, CashTablePanel } from '../components/cash/cashTableTokens'
import { ListPagination } from '../components/admin/AdminPatterns'
import { useEffect, useRef, useState } from 'react'
import { Alert, Box, Button, Card, CardContent, Grid, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { useSearchParams } from 'react-router-dom'
import { AddRounded, ArrowDownwardRounded, ArrowUpwardRounded, PaymentsRounded, PendingActionsRounded } from '@mui/icons-material'
import { PageHeader } from '../components/common/PageHeader'
import { StatCard } from '../components/common/StatCard'
import { UiState } from '../components/common/UiState'
import { formatMoney } from '../utils/format'
import { getCashMovements, getRepairCashGroups, cashPeriodLabels, cashPeriodSuffix, CASH_PERIODS, type CashMovement, type CashMovementsSummary, type CashPeriod, type LooseRepairMovements, type RepairCashGroup } from '../services/operations'
import { NewCashMovementDrawer } from '../components/cash/NewCashMovementDrawer'
import { useSubscription } from '../features/billing/SubscriptionContext'
import { useAuth } from '../auth/AuthContext'
import { canAccess } from '../auth/permissions'
import type { EquipmentSummary } from '../services/equipmentSales'

const originLabels = CASH_ORIGIN_LABELS

export function CashPage() {
  const { commerceEnabled, loading: subscriptionLoading } = useSubscription()
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const originParam = params.get('origin')
  const origin = originParam === 'REPAIR' || originParam === 'EQUIPMENT' || originParam === 'COMMERCE' ? originParam : undefined
  // El período vive en la URL: sobrevive al refresco, al cambio de caja y al botón atrás.
  // Un valor desconocido (o ausente) cae en Hoy, que es el comportamiento por defecto.
  const periodParam = params.get('period')
  const period: CashPeriod = periodParam && CASH_PERIODS.includes(periodParam as CashPeriod) ? periodParam as CashPeriod : 'TODAY'
  // El alta manual es la misma en las cuatro cajas: basta `cash.create`. El plan de Comercio
  // no oculta el botón (la pestaña ya viene deshabilitada y el backend valida el acceso);
  // si el plan no incluye Comercio, el POST responde con el error de feature y no se crea nada.
  const canCreate = canAccess(user, 'cash.create')
  const [movements, setMovements] = useState<CashMovement[]>([])
  // La caja de reparaciones se lee agrupada: una fila por reparación, con sus movimientos.
  // Las demás cajas (General, Reventa, Comercio) conservan la lista por movimiento.
  const [groups, setGroups] = useState<RepairCashGroup[]>([])
  const [loose, setLoose] = useState<LooseRepairMovements | null>(null)
  const [total, setTotal] = useState(0)
  const [equipmentSummary, setEquipmentSummary] = useState<EquipmentSummary | null>(null)
  const [page, setPage] = useState(0)
  const [summary, setSummary] = useState<CashMovementsSummary>({ income: 0, expense: 0, balance: 0, totalMovements: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const latestRequest = useRef(0)
  const grouped = origin === 'REPAIR'
  const emptySummary = { income: 0, expense: 0, balance: 0, totalMovements: 0 }
  const load = async (requestedPage = page) => {
    const requestId = ++latestRequest.current
    if (subscriptionLoading || origin === 'COMMERCE' && !commerceEnabled) { setLoading(false); setMovements([]); setGroups([]); setLoose(null); setTotal(0); setSummary(emptySummary); return }
    setLoading(true)
    setError('')
    try {
      // Todas las cajas piden el mismo período: tarjetas, listado y grupos quedan alineados.
      const data = grouped
        ? await getRepairCashGroups({ page: requestedPage + 1, pageSize: 10, period })
        : await getCashMovements({ page: requestedPage + 1, pageSize: 10, origin, period })
      if (requestId !== latestRequest.current) return
      // El backend devuelve con qué período calculó la respuesta. Si no coincide con el pedido,
      // es que no reconoce el valor (backend viejo) y nos está mandando otro rango en silencio:
      // mostrar esas cifras bajo el título de otro período sería mentir con la plata del negocio.
      if (data.period !== period) {
        setError('El servidor no reconoce el período seleccionado. Actualizá el backend para ver estos datos.')
        setMovements([]); setGroups([]); setLoose(null); setTotal(0); setSummary(emptySummary); setLoading(false)
        return
      }
      if (requestedPage > 0 && !data.items.length && data.total > 0) {
        setPage(requestedPage - 1)
        return
      }
      // La paginación por grupos cuenta reparaciones, no movimientos.
      if (grouped) { setGroups(data.items as unknown as RepairCashGroup[]); setLoose(data.loose ?? null); setMovements([]) }
      // La tabla principal trae lo vinculado al módulo; los manuales llegan en `loose`.
      else { setMovements(data.items); setGroups([]); setLoose(data.loose ?? null) }
      setTotal(data.total)
      setSummary(data.summary)
      setEquipmentSummary(data.equipmentSummary ?? null)
    } catch {
      if (requestId === latestRequest.current) setError('No pudimos cargar los movimientos.')
    } finally {
      if (requestId === latestRequest.current) setLoading(false)
    }
  }
  useEffect(() => { void load(page); return () => { latestRequest.current++ } }, [page, origin, period, commerceEnabled, subscriptionLoading])
  const selectOrigin = (value: string | null) => { if (!value) return; const next = new URLSearchParams(params); if (value !== 'GENERAL') next.set('origin', value); else next.delete('origin'); setParams(next); setPage(0) }
  // El período se conserva al cambiar de caja: se reescribe el mismo search param.
  const selectPeriod = (value: CashPeriod | null) => { if (!value) return; const next = new URLSearchParams(params); if (value === 'TODAY') next.delete('period'); else next.set('period', value); setParams(next); setPage(0) }
  const suffix = cashPeriodSuffix(period)
  const title = origin ? `Caja de ${originLabels[origin]}` : 'Caja General'
  // Las cuatro cajas arman SIEMPRE las mismas dos tablas independientes, en el mismo orden y con
  // la misma jerarquía: "Últimos movimientos" (sólo lo vinculado) y "Otros movimientos" (sólo lo
  // manual). Cada una es un panel con su propio borde y su propio encabezado.
  const mainTable = grouped
    ? <RepairCashGroupsList groups={groups} />
    : <CashMovementList movements={movements} showOrigin={!origin} />
  // Qué anuncia cada caja. General no tiene entidad propia —sus movimientos vinculados pueden
  // venir de cualquier módulo—, así que se habla de "operaciones". Todas las cajas arman el
  // subtítulo con la misma plantilla y sólo cambian el sustantivo.
  const subtitleNoun = { GENERAL: 'operaciones', REPAIR: 'reparaciones', EQUIPMENT: 'equipos', COMMERCE: 'ventas' }
  const mainSubtitle = `Movimientos vinculados a ${subtitleNoun[origin ?? 'GENERAL']} · ${cashPeriodLabels[period].toLowerCase()}`
  const headerAction = canCreate
    ? <Button variant="contained" startIcon={<AddRounded />} onClick={() => setOpen(true)}>Registrar movimiento</Button>
    : undefined

  return <Box data-tutorial="cash-overview"><PageHeader eyebrow="FINANZAS" title={title} description="Ingresos, egresos y movimientos identificados por origen." action={headerAction} />
    <ToggleButtonGroup exclusive value={origin ?? 'GENERAL'} onChange={(_, value) => selectOrigin(value)} sx={{ mb: 2.5, display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))' } }} aria-label="Origen de caja"><ToggleButton value="GENERAL">General</ToggleButton><ToggleButton value="REPAIR">Reparaciones</ToggleButton><ToggleButton value="EQUIPMENT">Reventa de equipos</ToggleButton><ToggleButton value="COMMERCE" disabled={!commerceEnabled}>Comercio</ToggleButton></ToggleButtonGroup>
    {origin === 'COMMERCE' && !commerceEnabled && !subscriptionLoading && <Alert severity="info">Comercio requiere el plan COMPLETE.</Alert>}
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} gap={1.5} sx={{ mb: 2.5 }}>
      <Typography variant="body2" color="text.secondary">Período</Typography>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={period}
        onChange={(_, value) => selectPeriod(value)}
        aria-label="Período de caja"
        sx={{
          display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(5, auto)' },
          justifyContent: { sm: 'flex-end' }, maxWidth: '100%', overflowX: 'auto',
        }}
      >
        {CASH_PERIODS.map(value => <ToggleButton key={value} value={value} sx={{ whiteSpace: 'nowrap' }}>{cashPeriodLabels[value]}</ToggleButton>)}
      </ToggleButtonGroup>
    </Stack>

    {origin === 'EQUIPMENT' ? <>
      <Grid container spacing={1.5} mb={1.5}>
        <Grid size={{ xs: 6, lg: 3 }}><StatCard label={`Ventas realizadas ${suffix}`} value={equipmentSummary ? String(equipmentSummary.salesCount) : '—'} icon={<ArrowUpwardRounded />} tone="success" /></Grid>
        <Grid size={{ xs: 6, lg: 3 }}><StatCard label={`Invertido en compras ${suffix}`} value={equipmentSummary ? formatMoney(equipmentSummary.purchaseInvestment) : '—'} icon={<PaymentsRounded />} /></Grid>
        <Grid size={{ xs: 6, lg: 3 }}><StatCard label={`Gastos de reparación ${suffix}`} value={equipmentSummary ? formatMoney(equipmentSummary.repairInvestment) : '—'} icon={<ArrowDownwardRounded />} tone="warning" /></Grid>
        <Grid size={{ xs: 6, lg: 3 }}><StatCard label={`Ganancia real ${suffix}`} value={equipmentSummary ? formatMoney(equipmentSummary.realizedProfit) : '—'} icon={<PendingActionsRounded />} tone="success" /></Grid>
      </Grid><Typography variant="body2" color="text.secondary" mb={2}>Del período seleccionado, neto de ajustes. Los ingresos compensatorios no cuentan como ventas ni ganancias.</Typography>
    </> : <Grid container spacing={1.5} mb={2.2}><Grid size={{ xs: 6, lg: 3 }}><StatCard label={`${origin === 'REPAIR' ? 'Caja neta' : 'Ingresos'} ${suffix}`} value={formatMoney(origin === 'REPAIR' ? summary.balance : summary.income)} icon={<ArrowUpwardRounded />} tone="success" /></Grid><Grid size={{ xs: 6, lg: 3 }}><StatCard label={`${origin === 'REPAIR' ? 'Cobrado' : 'Egresos'} ${suffix}`} value={formatMoney(origin === 'REPAIR' ? summary.income : summary.expense)} icon={<ArrowDownwardRounded />} tone="warning" /></Grid><Grid size={{ xs: 6, lg: 3 }}><StatCard label={`${origin === 'REPAIR' ? 'Egresos' : 'Balance'} ${suffix}`} value={formatMoney(origin === 'REPAIR' ? summary.expense : summary.balance)} icon={<PaymentsRounded />} /></Grid><Grid size={{ xs: 6, lg: 3 }}><StatCard label={`Movimientos ${suffix}`} value={String(summary.totalMovements)} icon={<PendingActionsRounded />} tone="info" /></Grid>{origin === 'REPAIR' && <Grid size={12}><Typography variant="caption" color="text.secondary">La caja neta descuenta devoluciones y gastos de garantía: es el dinero real que dejaron las reparaciones del período.</Typography></Grid>}</Grid>}
    {/* Dos tablas independientes: cada una en su propio panel, con borde, título y encabezado
        propios, y espacio vertical entre ambas. No comparten contenedor. */}
    {loading ? <Card><CardContent><UiState loading/></CardContent></Card> : error ? <Card><CardContent><UiState title="No pudimos cargar los movimientos" description={error} action={() => void load()} /></CardContent></Card> : <Stack spacing={3}>
      {/* `grouped` es exactamente la caja de Reparaciones: es la única cuya tabla se agrupa por
          reparación, así que es la única que lleva la línea auxiliar que lo explica. */}
      <CashTablePanel title="Últimos movimientos" description={mainSubtitle} hint={grouped ? 'Una fila por reparación, ordenada por actividad reciente.' : undefined} footer={total > 10 ? <ListPagination count={total} page={page} rowsPerPage={10} onPageChange={setPage} /> : undefined}>
        {mainTable}
      </CashTablePanel>
      <LooseMovementsTable loose={loose} showOrigin={!origin} />
    </Stack>}
    <NewCashMovementDrawer key={origin ?? 'GENERAL'} origin={origin ?? 'GENERAL'} open={open && canCreate} onClose={() => setOpen(false)} onCreated={() => { setOpen(false); void load() }}/>
  </Box>
}
