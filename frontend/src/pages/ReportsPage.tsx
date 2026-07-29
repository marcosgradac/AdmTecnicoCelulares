import { useEffect, useState } from 'react'
import { Box, Card, CardContent, Grid, Stack, Typography } from '@mui/material'
import { BuildRounded, PaymentsRounded, PendingActionsRounded, ReceiptRounded } from '@mui/icons-material'
import { PageHeader } from '../components/common/PageHeader'
import { StatCard } from '../components/common/StatCard'
import { RepairsByStatusChart } from '../components/charts/RepairsByStatusChart'
import { UiState } from '../components/common/UiState'
import { formatMoney } from '../utils/format'
import { getRepairs } from '../services/repairs'
import { getCashMovements } from '../services/operations'
import type { Repair, RepairStatus } from '../types'

export function ReportsPage() {
  const [repairs, setRepairs] = useState<Repair[]>([])
  const [income, setIncome] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  useEffect(() => { Promise.all([getRepairs(), getCashMovements()]).then(([repairData, movements]) => { setRepairs(repairData); setIncome(movements.filter(item => item.type === 'INCOME').reduce((sum, item) => sum + item.amount, 0)) }).catch(() => setError(true)).finally(() => setLoading(false)) }, [])
  if (loading) return <Card><UiState loading/></Card>
  if (error) return <Card><UiState title="No pudimos cargar los reportes"/></Card>
  const statusData = Object.entries(repairs.reduce<Record<string, number>>((acc, repair) => ({ ...acc, [repair.status]: (acc[repair.status] || 0) + 1 }), {})).map(([status, value]) => ({ status: status as RepairStatus, value }))
  const pending = repairs.reduce((sum, repair) => sum + Math.max(0, repair.total - repair.paid), 0)
  const quoted = repairs.filter(repair => repair.total > 0)
  const ticket = quoted.length ? quoted.reduce((sum, repair) => sum + repair.total, 0) / quoted.length : 0
  const services = Object.entries(repairs.reduce<Record<string, number>>((acc, repair) => ({ ...acc, [repair.issue]: (acc[repair.issue] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).slice(0, 5)
  return <Box><PageHeader eyebrow="ANÁLISIS" title="Reportes" description="Indicadores calculados a partir de los datos reales registrados." />
    <Grid container spacing={1.5} mb={2.2}><Grid size={{ xs: 6, md: 3 }}><StatCard label="Ingresos registrados" value={formatMoney(income)} icon={<PaymentsRounded/>} tone="success"/></Grid><Grid size={{ xs: 6, md: 3 }}><StatCard label="Ticket promedio" value={formatMoney(ticket)} icon={<ReceiptRounded/>}/></Grid><Grid size={{ xs: 6, md: 3 }}><StatCard label="Reparaciones" value={String(repairs.length)} icon={<BuildRounded/>} tone="info"/></Grid><Grid size={{ xs: 6, md: 3 }}><StatCard label="Saldos pendientes" value={formatMoney(pending)} icon={<PendingActionsRounded/>} tone="warning"/></Grid></Grid>
    <Grid container spacing={2.2}><Grid size={{ xs: 12, lg: 6 }}><Card><CardContent><Typography variant="h2">Reparaciones por estado</Typography><Typography variant="body2" color="text.secondary" mb={2}>Distribución actual</Typography>{statusData.length ? <RepairsByStatusChart data={statusData}/> : <UiState title="Datos insuficientes"/>}</CardContent></Card></Grid><Grid size={{ xs: 12, lg: 6 }}><Card><CardContent><Typography variant="h2" mb={2}>Servicios más realizados</Typography>{services.length ? <Stack spacing={1.5}>{services.map(([label, value]) => <Stack key={label} direction="row" justifyContent="space-between"><Typography>{label}</Typography><Typography fontWeight={800}>{value}</Typography></Stack>)}</Stack> : <UiState title="Datos insuficientes" description="Se necesitan reparaciones registradas para calcular este reporte."/>}</CardContent></Card></Grid></Grid>
  </Box>
}
