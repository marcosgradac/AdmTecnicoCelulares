import { BuildRounded, FactCheckRounded, PaymentsRounded, TaskAltRounded } from '@mui/icons-material'
import { useAuth } from '../../auth/AuthContext'
import { DashboardHeader } from '../../components/dashboard/DashboardHeader'
import { MetricCard } from '../../components/dashboard/MetricCard'
import { QuickActions } from '../../components/dashboard/QuickActions'
import { RecentRepairs } from '../../components/dashboard/RecentRepairs'
import { dashboardSummary, recentDashboardRepairs } from '../../data/dashboard.mock'
import './dashboard.scss'

export function DashboardPage() {
  const { user } = useAuth()
  const firstName = user?.fullName.split(' ')[0] || 'Marcos'
  return <div className="dashboard-page">
    <DashboardHeader name={firstName} /><QuickActions />
    <div className="dashboard-metrics">
      <MetricCard label="Reparaciones activas" value={String(dashboardSummary.activeRepairs)} icon={<BuildRounded />} tone="primary" />
      <MetricCard label="En revisión" value={String(dashboardSummary.inReview)} icon={<FactCheckRounded />} tone="warning" />
      <MetricCard label="Listos para entregar" value={String(dashboardSummary.ready)} icon={<TaskAltRounded />} tone="success" />
      <MetricCard label="Ingresos del mes" value={`$${dashboardSummary.monthlyIncome.toLocaleString('es-AR')}`} icon={<PaymentsRounded />} tone="info" />
    </div>
    <RecentRepairs repairs={recentDashboardRepairs} />
  </div>
}
