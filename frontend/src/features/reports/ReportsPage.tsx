import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Box, Card, CardContent, Chip, Grid, Stack, Typography } from '@mui/material'
import { AccountBalanceWalletRounded, BuildRounded, PaidRounded, PeopleRounded, PriceCheckRounded, TrendingUpRounded } from '@mui/icons-material'
import { Link } from 'react-router-dom'
import { PageHeader } from '../../components/common/PageHeader'
import { StatCard } from '../../components/common/StatCard'
import { UiState } from '../../components/common/UiState'
import { repairStatusConfig } from '../../config/repairStatus'
import { formatDate, formatMoney } from '../../utils/format'
import { CountBarChart, FinanceLineChart } from './components/ReportCharts'
import { PeriodSelector } from './components/PeriodSelector'
import { ReportsSkeleton } from './components/ReportsSkeleton'
import { getReportsOverview, type ReportFilters } from './reports.api'
import type { ReportClient, ReportCount, ReportsOverview } from './types'
import './reports.scss'

const initialFilters: ReportFilters = { period: 'this_month' }
const percentage = (value: number) => new Intl.NumberFormat('es-AR', { style: 'percent', maximumFractionDigits: 1 }).format(value)
const decimal = (value: number) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(value)
const statusLabel = (status: string) => repairStatusConfig[status.toLowerCase() as keyof typeof repairStatusConfig]?.label ?? status

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <Box component="section" className="reports-section"><Box className="reports-section__heading"><Typography variant="h2">{title}</Typography>{description && <Typography color="text.secondary" variant="body2" mt={.4}>{description}</Typography>}</Box>{children}</Box>
}
function ListCard({ title, rows, value }: { title: string; rows: ReportCount[]; value?: (row: ReportCount) => string }) {
  return <Card sx={{ height: '100%' }}><CardContent><Typography variant="h3" mb={1.5}>{title}</Typography>{rows.length ? <Box className="reports-list">{rows.map(row => <Box className="reports-list__row" key={row.label}><span className="reports-list__label">{row.label}</span><strong>{value?.(row) ?? row.value}</strong></Box>)}</Box> : <UiState title="Sin actividad en el período" description="Probá ampliando el rango de fechas."/>}</CardContent></Card>
}
function ClientCard({ title, rows, metric }: { title: string; rows: ReportClient[]; metric: (row: ReportClient) => string }) {
  return <Card sx={{ height: '100%' }}><CardContent><Typography variant="h3" mb={1.5}>{title}</Typography>{rows.length ? <Box className="reports-list">{rows.map((row, index) => <Box className="reports-list__row" key={`${row.name}-${index}`}><span className="reports-list__label">{row.name}</span><strong>{metric(row)}</strong></Box>)}</Box> : <UiState title="Sin clientes para mostrar"/>}</CardContent></Card>
}

export function ReportsPage() {
  const [draft, setDraft] = useState<ReportFilters>(initialFilters)
  const [applied, setApplied] = useState<ReportFilters>(initialFilters)
  const [data, setData] = useState<ReportsOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const load = useCallback((signal?: AbortSignal) => { setLoading(true); setError(false); return getReportsOverview(applied, signal).then(setData).catch(requestError => { if (requestError?.code !== 'ERR_CANCELED') setError(true) }).finally(() => { if (!signal?.aborted) setLoading(false) }) }, [applied])
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort() }, [load])
  const activity = useMemo(() => data ? data.summary.repairsIncoming + data.summary.collected + data.summary.expenses : 0, [data])

  return <Box className="reports-page"><PageHeader eyebrow="ANÁLISIS" title="Estadísticas y reportes" description="Indicadores reales del negocio, calculados en el servidor y aislados por cuenta." action={<PeriodSelector draft={draft} applied={applied} onDraftChange={setDraft} onApply={() => setApplied(draft)}/>}/>
    {loading && !data ? <ReportsSkeleton/> : error && !data ? <Card><UiState title="No pudimos cargar los reportes" description="Revisá la conexión e intentá nuevamente." action={() => void load()}/></Card> : data && <>
      {error && <Alert severity="warning" action={<Chip label="Reintentar" onClick={() => void load()}/>}>No se pudo actualizar el reporte. Se muestran los últimos datos disponibles.</Alert>}
      <Typography variant="body2" color="text.secondary" mb={2}>Período UTC: {formatDate(data.period.from)} al {formatDate(data.period.to)}</Typography>
      {!activity && <Alert severity="info" sx={{ mb: 2 }}>No hubo reparaciones, pagos ni egresos en este período.</Alert>}
      <Grid container spacing={1.5}>
        <Grid size={{ xs: 6, lg: 3 }}><StatCard label="Cobrado" value={formatMoney(data.summary.collected)} icon={<PaidRounded/>} tone="success"/></Grid>
        <Grid size={{ xs: 6, lg: 3 }}><StatCard label="Por cobrar" value={formatMoney(data.summary.receivable)} icon={<AccountBalanceWalletRounded/>} tone="warning"/></Grid>
        <Grid size={{ xs: 6, lg: 3 }}><StatCard label="Facturación generada" value={formatMoney(data.finance.billed)} icon={<TrendingUpRounded/>}/></Grid>
        <Grid size={{ xs: 6, lg: 3 }}><StatCard label="Gastos" value={formatMoney(data.finance.expenses)} icon={<AccountBalanceWalletRounded/>} tone="warning"/></Grid>
        <Grid size={{ xs: 6, lg: 3 }}><StatCard label="Ticket promedio" value={formatMoney(data.summary.averageTicket)} icon={<PriceCheckRounded/>} tone="info"/></Grid>
        <Grid size={{ xs: 6, lg: 3 }}><StatCard label="Ingresadas" value={String(data.summary.repairsIncoming)} icon={<BuildRounded/>}/></Grid>
        <Grid size={{ xs: 6, lg: 3 }}><StatCard label="Entregadas" value={String(data.summary.repairsDelivered)} icon={<TrendingUpRounded/>} tone="success"/></Grid>
        <Grid size={{ xs: 6, lg: 3 }}><StatCard label="Clientes nuevos" value={String(data.summary.newClients)} helper={`${data.summary.recurrentClients} recurrentes`} icon={<PeopleRounded/>} tone="info"/></Grid>
      </Grid>

      <Section title="Finanzas" description="Facturación, cobros, saldos y gastos registrados en TecnoDesk."><Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 8 }}><Card><CardContent><Typography variant="h3" mb={2}>Evolución del período</Typography>{data.finance.timeline.length ? <FinanceLineChart data={data.finance.timeline}/> : <UiState title="Sin movimientos financieros"/>}</CardContent></Card></Grid>
        <Grid size={{ xs: 12, lg: 4 }}><Card sx={{ height: '100%' }}><CardContent><Typography variant="h3" mb={1.5}>Resumen financiero</Typography><Box className="reports-list">
          {[['Facturación generada', formatMoney(data.finance.billed)], ['Cobrado', formatMoney(data.finance.collected)], ['Pendiente', formatMoney(data.finance.outstanding)], ['Egresos', formatMoney(data.finance.expenses)], ['Mano de obra', formatMoney(data.finance.laborCost)], ['Pagos completos', String(data.finance.fullyPaid)], ['Pagos parciales', String(data.finance.partiallyPaid)]].map(([label, value]) => <Box className="reports-list__row" key={label}><span>{label}</span><strong>{value}</strong></Box>)}
        </Box></CardContent></Card></Grid>
        <Grid size={{ xs: 12 }}><ListCard title="Cobros por medio de pago" rows={data.finance.paymentMethods.filter(item => item.value > 0)} value={row => formatMoney(row.value)}/></Grid>
      </Grid></Section>

      <Section title="Reparaciones"><Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 6 }}><Card><CardContent><Typography variant="h3" mb={2}>Por estado</Typography><CountBarChart data={data.repairs.byStatus.filter(item => item.value).map(item => ({ ...item, label: statusLabel(item.label) }))}/><Box className="reports-status-links">{data.repairs.byStatus.filter(item => item.value).map(item => <Chip component={Link} clickable to={`/admin/reparaciones?status=${item.label.toLowerCase()}`} key={item.label} label={`${statusLabel(item.label)} · ${item.value}`}/>)}</Box></CardContent></Card></Grid>
        <Grid size={{ xs: 12, lg: 6 }}><Card sx={{ height: '100%' }}><CardContent><Typography variant="h3" mb={1.5}>Operación</Typography><Box className="reports-list">{[['Activas', data.summary.repairsActive], ['Vencidas', data.repairs.overdue], ['Canceladas', data.repairs.cancelled], ['Tiempo medio de entrega', `${decimal(data.repairs.averageDeliveryHours)} h`]].map(([label, value]) => <Box className="reports-list__row" key={label}><span>{label}</span><strong>{value}</strong></Box>)}</Box></CardContent></Card></Grid>
        <Grid size={{ xs: 12, md: 4 }}><ListCard title="Problemas frecuentes" rows={data.repairs.topIssues}/></Grid><Grid size={{ xs: 12, md: 4 }}><ListCard title="Marcas" rows={data.repairs.topBrands}/></Grid><Grid size={{ xs: 12, md: 4 }}><ListCard title="Modelos" rows={data.repairs.topModels}/></Grid>
        <Grid size={{ xs: 12, md: 6 }}><ListCard title="Servicios más realizados" rows={data.repairs.topServices}/></Grid><Grid size={{ xs: 12, md: 6 }}><Card><CardContent><Typography variant="h3" mb={2}>Ingresos de reparaciones por fecha</Typography>{data.repairs.timeline.length ? <CountBarChart data={data.repairs.timeline}/> : <UiState title="Sin reparaciones en el período"/>}</CardContent></Card></Grid>
      </Grid></Section>


      <Section title="Clientes"><Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}><ClientCard title="Más reparaciones" rows={data.clients.topByRepairs} metric={row => String(row.repairs)}/></Grid><Grid size={{ xs: 12, md: 4 }}><ClientCard title="Mayor facturación" rows={data.clients.topByBilled} metric={row => formatMoney(row.billed)}/></Grid><Grid size={{ xs: 12, md: 4 }}><ClientCard title="Mayor saldo pendiente" rows={data.clients.topOutstanding} metric={row => formatMoney(row.outstanding)}/></Grid>
      </Grid></Section>
      <Section title="Empleados"><Alert severity="info">{data.employees.reason}</Alert></Section>
    </>}
  </Box>
}
