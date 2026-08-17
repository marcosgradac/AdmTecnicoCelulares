import { useEffect, useState } from 'react'
import { BuildRounded, FactCheckRounded, PaymentsRounded, TaskAltRounded } from '@mui/icons-material'
import { Alert } from '@mui/material'
import { useAuth } from '../../auth/AuthContext'
import { DashboardHeader } from '../../components/dashboard/DashboardHeader'
import { MetricCard } from '../../components/dashboard/MetricCard'
import { QuickActions } from '../../components/dashboard/QuickActions'
import { RecentRepairs } from '../../components/dashboard/RecentRepairs'
import { UiState } from '../../components/common/UiState'
import { getDashboardSummary, type DashboardSummary } from '../../services/operations'
import { formatMoney } from '../../utils/format'
import type { DashboardRepair } from '../../types/dashboard.types'
import type { WorkflowRepairStatus } from '../../types/repair.types'
import './dashboard.scss'

const statusMap:Record<string,WorkflowRepairStatus>={RECEIVED:'recibido',REVIEW:'en_revision',BUDGET:'presupuesto_informado',APPROVED:'presupuesto_aceptado',WAITING_PART:'esperando_repuesto',REPAIRING:'en_reparacion',TESTING:'control_calidad',READY:'listo_retirar',DELIVERED:'entregado',CANCELLED:'cancelado',WARRANTY:'garantia'}
export function DashboardPage(){const{user}=useAuth();const[summary,setSummary]=useState<DashboardSummary|null>(null);const[error,setError]=useState('');useEffect(()=>{void getDashboardSummary().then(setSummary).catch(()=>setError('No pudimos cargar el dashboard.'))},[]);if(!summary&&!error)return <UiState loading/>;if(!summary)return <Alert severity="error">{error}</Alert>;const repairs:DashboardRepair[]=summary.recentRepairs.map(repair=>({id:repair.id,number:repair.number,client:repair.client.name,device:`${repair.deviceBrand} ${repair.deviceModel}`,issue:repair.issue,status:statusMap[repair.status]??'recibido',receivedAt:repair.createdAt,total:repair.total}));const inReview=summary.byStatus.find(item=>item.status==='REVIEW')?.value??0;const ready=summary.byStatus.find(item=>item.status==='READY')?.value??0;return <div className="dashboard-page"><DashboardHeader name={user?.fullName.split(' ')[0]||'Usuario'}/><QuickActions/><div className="dashboard-metrics"><MetricCard label="Reparaciones activas" value={String(summary.activeRepairs)} icon={<BuildRounded/>} tone="primary"/><MetricCard label="En revisión" value={String(inReview)} icon={<FactCheckRounded/>} tone="warning"/><MetricCard label="Listos para entregar" value={String(ready)} icon={<TaskAltRounded/>} tone="success"/><MetricCard label="Ingresos del mes" value={formatMoney(summary.monthlyIncome)} icon={<PaymentsRounded/>} tone="info"/></div><RecentRepairs repairs={repairs}/></div>}
