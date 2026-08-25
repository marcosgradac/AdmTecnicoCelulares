import { useEffect, useState } from 'react'
import { AccountBalanceWalletRounded, BuildRounded, PaymentsRounded, PendingActionsRounded, TaskAltRounded, VerifiedRounded } from '@mui/icons-material'
import { Alert, Card, CardContent, Grid, Typography } from '@mui/material'
import { useAuth } from '../../auth/AuthContext'
import { DashboardHeader } from '../../components/dashboard/DashboardHeader'
import { MetricCard } from '../../components/dashboard/MetricCard'
import { QuickActions } from '../../components/dashboard/QuickActions'
import { RecentRepairs } from '../../components/dashboard/RecentRepairs'
import { UiState } from '../../components/common/UiState'
import { IncomeExpenseChart } from '../../components/charts/IncomeExpenseChart'
import { RepairsByStatusChart } from '../../components/charts/RepairsByStatusChart'
import { getDashboardSummary, type DashboardSummary } from '../../services/operations'
import { formatMoney } from '../../utils/format'
import type { RepairStatus } from '../../types'
import type { DashboardRepair } from '../../types/dashboard.types'
import type { WorkflowRepairStatus } from '../../types/repair.types'
import './dashboard.scss'

const statusMap: Record<string, WorkflowRepairStatus> = { RECEIVED:'recibido', REVIEW:'en_revision', BUDGET:'presupuesto_informado', APPROVED:'presupuesto_aceptado', WAITING_PART:'esperando_repuesto', REPAIRING:'en_reparacion', TESTING:'control_calidad', READY:'listo_retirar', DELIVERED:'entregado', CANCELLED:'cancelado', WARRANTY:'garantia' }
const apiStatus: Record<string, RepairStatus> = { RECEIVED:'received', REVIEW:'review', BUDGET:'budget', APPROVED:'approved', WAITING_PART:'waiting_part', REPAIRING:'repairing', TESTING:'testing', READY:'ready', DELIVERED:'delivered', CANCELLED:'cancelled', WARRANTY:'warranty' }

export function DashboardPage() {
  const { user } = useAuth()
  const [summary, setSummary] = useState<DashboardSummary | null>(null), [error, setError] = useState('')
  useEffect(() => { void getDashboardSummary().then(setSummary).catch(() => setError('No pudimos cargar el dashboard.')) }, [])
  if (!summary && !error) return <UiState loading/>
  if (!summary) return <Alert severity="error">{error}</Alert>
  const repairs: DashboardRepair[] = summary.recentRepairs.map(repair => ({ id:repair.id, number:repair.number, client:repair.client.name, device:`${repair.deviceBrand} ${repair.deviceModel}`, issue:repair.issue, status:statusMap[repair.status] ?? 'recibido', receivedAt:repair.createdAt, total:repair.total }))
  const byStatus = summary.byStatus.filter(item => item.value > 0 && apiStatus[item.status]).map(item => ({ status: apiStatus[item.status], value: item.value }))
  return <div className="dashboard-page"><DashboardHeader name={user?.fullName.split(' ')[0] || 'Usuario'}/><QuickActions/>
    <div className="dashboard-metrics dashboard-metrics--six" data-tutorial="dashboard-summary"><MetricCard label="Ingresos" value={formatMoney(summary.monthlyIncome)} icon={<PaymentsRounded/>} tone="success"/><MetricCard label="Egresos" value={formatMoney(summary.monthlyExpenses)} icon={<AccountBalanceWalletRounded/>} tone="warning"/><MetricCard label="Pendiente" value={formatMoney(summary.pending)} icon={<PendingActionsRounded/>} tone="info"/><MetricCard label="Reparaciones activas" value={String(summary.activeRepairs)} icon={<BuildRounded/>} tone="primary"/><MetricCard label="Listas para entregar" value={String(summary.readyRepairs)} icon={<TaskAltRounded/>} tone="success"/><MetricCard label="Garantías activas" value={String(summary.activeWarranties)} icon={<VerifiedRounded/>} tone="info"/></div>
    <Grid container spacing={2.2}><Grid size={{ xs:12, lg:7 }}><Card><CardContent><Typography variant="h2" mb={2}>Ingresos vs Egresos</Typography><IncomeExpenseChart data={summary.cashFlow}/></CardContent></Card></Grid><Grid size={{ xs:12, lg:5 }}><Card><CardContent><Typography variant="h2" mb={2}>Reparaciones por estado</Typography>{byStatus.length ? <RepairsByStatusChart data={byStatus}/> : <UiState title="Sin reparaciones todavía" description="El resumen aparecerá con tu primer ingreso."/>}</CardContent></Card></Grid></Grid>
    <RecentRepairs repairs={repairs}/>
  </div>
}
