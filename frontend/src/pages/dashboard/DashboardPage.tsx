import { MobileCarousel } from '../../components/common/MobileCarousel'
import { MobileChartTabs } from '../../components/dashboard/MobileChartTabs'
import { useEffect, useState } from 'react'
import { AccountBalanceWalletRounded, BuildRounded, PendingActionsRounded, TaskAltRounded } from '@mui/icons-material'
import { Box, Card, CardActionArea, CardContent, Stack, ToggleButton, ToggleButtonGroup, Typography, useMediaQuery, useTheme } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { AdminVisualScope } from '../../components/admin/AdminVisualScope'
import { PageHeader } from '../../components/common/PageHeader'
import { GRADIENT_TEXT_SX } from '../../theme/tokens'
import { StatCard } from '../../components/common/StatCard'
import { UiState } from '../../components/common/UiState'
import { FinancialChart, IncomeAreaChart, RepairStatusChart } from '../../components/dashboard/OverviewCharts'
import { AttentionPanel, ModuleSummaries, RecentActivity } from '../../components/dashboard/OverviewSections'
import { getDashboardOverview, type DashboardOverview, type DashboardPeriod } from '../../services/dashboard'
import { formatMoney } from '../../utils/format'

const periodLabels: Record<DashboardPeriod, string> = { today: 'Hoy', '7d': '7 días', '30d': '30 días', month: 'Este mes' }

function DashboardContent() {
  const { user } = useAuth()
  const mobile = useMediaQuery(useTheme().breakpoints.down('md'))
  const [period, setPeriod] = useState<DashboardPeriod>('month')
  const [summary, setSummary] = useState<DashboardOverview | null>(null)
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError(''); setSummary(null)
    void getDashboardOverview(period, controller.signal).then(data => {
      if (!controller.signal.aborted) setSummary(data)
    }).catch(() => {
      if (!controller.signal.aborted) setError('No pudimos cargar el resumen de tu negocio.')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [period, retry])

  const metrics = summary ? [
    { label: 'Resultado de Caja', value: formatMoney(summary.financial.balance), helper: `${periodLabels[period]} · ingresos menos egresos`, icon: <AccountBalanceWalletRounded />, tone: summary.financial.balance < 0 ? 'error' as const : 'success' as const, valueColor: summary.financial.balance < 0 ? 'error.main' as const : summary.financial.balance > 0 ? 'success.main' as const : 'text.primary' as const, to: '/admin/caja' },
    { label: 'Reparaciones activas', value: String(summary.current.activeRepairs), helper: 'Ahora · sin entregadas', icon: <BuildRounded />, tone: 'info' as const, to: '/admin/reparaciones' },
    { label: 'Listos para entregar', value: String(summary.current.readyRepairs), helper: 'Ahora · pendientes de retiro', icon: <TaskAltRounded />, tone: 'success' as const, to: '/admin/reparaciones?status=ready' },
    { label: 'Saldo pendiente', value: formatMoney(summary.current.pending), helper: 'Ahora · total por cobrar en reparaciones', icon: <PendingActionsRounded />, tone: 'warning' as const, to: '#atencion-pending' },
  ] : []
  return <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: { xs: 2, sm: 3 }, minWidth: 0 }}>
    <Box><PageHeader eyebrow="CENTRO DE CONTROL" title={`Inicio · ${user?.fullName.split(' ')[0] || 'Tu negocio'}`} description="Tus números, el trabajo pendiente y los próximos pasos en un solo lugar." action={<ToggleButtonGroup exclusive value={period} onChange={(_, next: DashboardPeriod | null) => { if (next) setPeriod(next) }} aria-label="Período del resumen" sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', width: '100%' }}>{Object.entries(periodLabels).map(([value, label]) => <ToggleButton key={value} value={value} sx={{ px: { xs: 1, sm: 2 }, fontSize: 12, whiteSpace: 'nowrap' }}>{label}</ToggleButton>)}</ToggleButtonGroup>} /></Box>
    {loading ? <UiState loading /> : error || !summary ? <UiState title="No pudimos cargar Inicio" description={error} action={() => setRetry(value => value + 1)} /> : <>
      <Box data-tutorial="dashboard-summary" sx={{minWidth:0}}><MobileCarousel label="Resumen del dashboard" desktopSx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5, '@media (max-width: 340px)': { gridTemplateColumns: '1fr' } }}>{metrics.map(metric => <CardActionArea key={metric.label} component={metric.to.startsWith('#') ? 'a' : RouterLink} {...(metric.to.startsWith('#') ? { href: summary.current.pending ? metric.to : '#necesitan-atencion' } : { to: metric.to })} sx={{ borderRadius: 3, minWidth: 0, height: '100%' }}><StatCard {...metric} /></CardActionArea>)}</MobileCarousel></Box>
      <MobileChartTabs financial={<Card><CardContent><Typography variant="h2" sx={GRADIENT_TEXT_SX}>Ingresos y egresos</Typography><Typography variant="body2" color="text.secondary" mt={.5}>{periodLabels[period]} · movimientos de Caja por {period === 'today' ? 'hora' : 'día'}.</Typography><Stack direction="row" flexWrap="wrap" gap={3} my={2}><Box><Typography variant="caption" color="text.secondary">Ingresos</Typography><Typography fontWeight={800} sx={{ color: 'var(--td-success, #168047)' }}>{formatMoney(summary.financial.income)}</Typography></Box><Box><Typography variant="caption" color="text.secondary">Egresos</Typography><Typography fontWeight={800} sx={{ color: 'var(--td-error, #C62828)' }}>{formatMoney(summary.financial.expense)}</Typography></Box></Stack>
        {summary.charts ? <FinancialChart data={summary.charts.cashFlow} /> : <Typography variant="body2" color="text.secondary">Tu plan incluye el resumen de Caja. Los gráficos detallados están disponibles en Profesional y Completo.</Typography>}
        <Typography variant="caption" color="text.secondary" display="block" mt={2}>El resultado de Caja refleja cobros y pagos; no equivale a la ganancia contable.</Typography>
      </CardContent></Card>} states={summary.charts ? <Card><CardContent><Typography variant="h2" sx={GRADIENT_TEXT_SX}>Estados de reparación</Typography><Typography variant="body2" color="text.secondary" mt={.5} mb={2}>Todos los registros, según su estado actual.</Typography><RepairStatusChart data={summary.charts.byStatus} /></CardContent></Card> : undefined} areas={summary.charts && summary.charts.incomeByArea.length > 1 ? <Card><CardContent><Typography variant="h2" sx={GRADIENT_TEXT_SX}>Ingresos por área</Typography><Typography variant="body2" color="text.secondary" mt={.5} mb={2}>{periodLabels[period]} · origen de los ingresos.</Typography><IncomeAreaChart data={summary.charts.incomeByArea} /></CardContent></Card> : undefined} />
      <AttentionPanel groups={summary.attention} />
      {!mobile && summary.charts && <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: summary.charts.incomeByArea.length > 1 ? 'repeat(2, minmax(0, 1fr))' : '1fr' }, gap: 2 }}><Card><CardContent><Typography variant="h2" sx={GRADIENT_TEXT_SX}>Estados de reparación</Typography><Typography variant="body2" color="text.secondary" mt={.5} mb={2}>Todos los registros, según su estado actual.</Typography><RepairStatusChart data={summary.charts.byStatus} /></CardContent></Card>{summary.charts.incomeByArea.length > 1 && <Card><CardContent><Typography variant="h2" sx={GRADIENT_TEXT_SX}>Ingresos por área</Typography><Typography variant="body2" color="text.secondary" mt={.5} mb={2}>{periodLabels[period]} · origen de los ingresos.</Typography><IncomeAreaChart data={summary.charts.incomeByArea} /></CardContent></Card>}</Box>}
      <ModuleSummaries modules={summary.modules} />
      <RecentActivity items={summary.activity} />
    </>}
  </Box>
}

export function DashboardPage() { return <AdminVisualScope enabled><DashboardContent /></AdminVisualScope> }
