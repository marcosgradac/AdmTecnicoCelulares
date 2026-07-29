import { Box, Button, Card, CardContent, Grid, IconButton, Stack, Typography, useMediaQuery, useTheme } from '@mui/material'
import { AddRounded, ArrowForwardRounded, BuildRounded, CheckCircleRounded, PaymentsRounded, PeopleRounded, PersonAddRounded, ReceiptLongRounded, UpdateRounded } from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { PageHeader } from '../components/common/PageHeader'
import { StatCard } from '../components/common/StatCard'
import { StatusChip } from '../components/common/StatusChip'
import { IncomeExpenseChart } from '../components/charts/IncomeExpenseChart'
import { RepairsByStatusChart } from '../components/charts/RepairsByStatusChart'
import type { Repair } from '../types'
import { getRepairs } from '../services/repairs'
import { getCashMovements, getDashboardSummary, type CashMovement } from '../services/operations'
import { UiState } from '../components/common/UiState'
import { formatDate, formatMoney } from '../utils/format'
import type { RepairStatus } from '../types'
import { repairStatusConfig } from '../config/repairStatus'

export function DashboardPage() {
  const navigate = useNavigate()
  const mobile = useMediaQuery(useTheme().breakpoints.down('sm'))
  const [repairs, setRepairs] = useState<Repair[]>([])
  const [summary, setSummary] = useState({ activeRepairs: 0, repairsToday: 0, monthlyIncome: 0, clients: 0 })
  const [movements, setMovements] = useState<CashMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  useEffect(() => {
    Promise.all([getRepairs(), getDashboardSummary(), getCashMovements()])
      .then(([repairData, summaryData, movementData]) => { setRepairs(repairData); setSummary(summaryData); setMovements(movementData) })
      .catch(() => setError(true)).finally(() => setLoading(false))
  }, [])
  const statusData = Object.entries(repairs.reduce<Record<string, number>>((acc, repair) => ({ ...acc, [repair.status]: (acc[repair.status] || 0) + 1 }), {}))
    .map(([status, value]) => ({ status: status as RepairStatus, value }))
  const cashFlow = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(); date.setMonth(date.getMonth() - (5 - index))
    const month = date.getMonth(); const year = date.getFullYear()
    const values = movements.filter(item => { const itemDate = new Date(item.createdAt); return itemDate.getMonth() === month && itemDate.getFullYear() === year })
    return { label: date.toLocaleDateString('es-AR', { month: 'short' }), income: values.filter(item => item.type === 'INCOME').reduce((sum, item) => sum + item.amount, 0), expense: values.filter(item => item.type === 'EXPENSE').reduce((sum, item) => sum + item.amount, 0) }
  })
  if (loading) return <Card><UiState loading /></Card>
  if (error) return <Card><UiState title="No pudimos cargar el dashboard" description="Verificá la conexión con el servidor y recargá la página." /></Card>
  return (
    <Box>
      <PageHeader eyebrow="RESUMEN GENERAL" title="Dashboard" description="Todo lo importante de tu servicio técnico, en un solo lugar." action={<Button variant="contained" startIcon={<AddRounded />} onClick={() => navigate('/reparaciones/nueva')}>Nueva reparación</Button>} />
      <Grid container spacing={2.2} mb={2.2}>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}><StatCard label="Reparaciones activas" value={String(summary.activeRepairs)} icon={<BuildRounded />} /></Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}><StatCard label="Ingresadas hoy" value={String(summary.repairsToday)} icon={<ReceiptLongRounded />} tone="info" /></Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}><StatCard label="Ingresos del mes" value={formatMoney(summary.monthlyIncome)} icon={<PaymentsRounded />} tone="success" /></Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}><StatCard label="Clientes registrados" value={String(summary.clients)} icon={<PeopleRounded />} tone="warning" /></Grid>
      </Grid>
      <Grid container spacing={2.2} mb={2.2}>
        <Grid size={{ xs: 12, lg: 8 }}><Card><CardContent><Stack direction="row" justifyContent="space-between" mb={2}><Box><Typography variant="h2">Ingresos y egresos</Typography><Typography variant="body2" color="text.secondary">Evolución de los últimos 7 meses</Typography></Box><Button size="small">Este año</Button></Stack><IncomeExpenseChart data={cashFlow} /></CardContent></Card></Grid>
        <Grid size={{ xs: 12, lg: 4 }}><Card sx={{ height: '100%' }}><CardContent><Typography variant="h2">Reparaciones por estado</Typography><Typography variant="body2" color="text.secondary" mb={2}>Distribución actual</Typography><RepairsByStatusChart data={statusData} /></CardContent></Card></Grid>
      </Grid>
      <Grid container spacing={2.2}>
        <Grid size={{ xs: 12, lg: 8 }}><Card><CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}><Box><Typography variant="h2">Reparaciones recientes</Typography><Typography variant="body2" color="text.secondary">Últimos equipos ingresados</Typography></Box><Button endIcon={<ArrowForwardRounded />} onClick={() => navigate('/reparaciones')}>Ver todas</Button></Stack>
          {repairs.length === 0 ? <UiState title="Todavía no hay reparaciones" description="Las reparaciones recientes aparecerán acá." /> : <Stack divider={<Box borderTop="1px solid" borderColor="divider" />}>{repairs.slice(0, 5).map(repair => <Stack key={repair.id} direction="row" alignItems="center" gap={2} py={1.6} onClick={() => navigate(`/reparaciones/${repair.id}`)} sx={{ cursor: 'pointer' }}>
            <Box minWidth={0} flex={1}><Typography fontWeight={750}>#{repair.number} · {repair.device}</Typography><Typography variant="body2" color="text.secondary" noWrap>{repair.clientName} · {repair.issue}</Typography></Box>
            {!mobile && <><Typography variant="body2" color="text.secondary">{formatDate(repair.createdAt)}</Typography><Typography fontWeight={750} minWidth={95} textAlign="right">{formatMoney(repair.total)}</Typography></>}
            <StatusChip status={repair.status}/><IconButton aria-label={`Ver reparación ${repair.id}`}><ArrowForwardRounded /></IconButton>
          </Stack>)}</Stack>}
        </CardContent></Card></Grid>
        <Grid size={{ xs: 12, lg: 4 }}><Card><CardContent><Typography variant="h2">Actividad reciente</Typography><Typography variant="body2" color="text.secondary" mb={2}>Novedades del servicio técnico</Typography>
          {repairs.length === 0 ? <UiState title="Sin actividad reciente"/> : <Stack spacing={2.2}>{repairs.slice(0, 4).map(item => <Stack key={item.id} direction="row" gap={1.5}><Box color="primary.main"><UpdateRounded/></Box><Box><Typography variant="body2" fontWeight={750}>{repairStatusConfig[item.status].label}</Typography><Typography variant="caption" color="text.secondary">#{item.number} · {item.device}</Typography></Box></Stack>)}</Stack>}
        </CardContent></Card></Grid>
      </Grid>
    </Box>
  )
}
