import { Button, Stack, Typography } from '@mui/material'
import { ArrowForwardRounded } from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import { RepairCard } from './RepairCard'
import type { DashboardRepair } from '../../types/dashboard.types'

export function RecentRepairs({ repairs }: { repairs: DashboardRepair[] }) {
  const navigate = useNavigate()
  return <section><div className="dashboard-section-title"><div><Typography variant="h2">Reparaciones recientes</Typography><Typography color="text.secondary" variant="body2">Últimos equipos ingresados</Typography></div><Button endIcon={<ArrowForwardRounded />} onClick={() => navigate('/reparaciones')}>Ver todas</Button></div>
    <Stack spacing={1.5}>{repairs.map(repair => <RepairCard key={repair.id} repair={repair} />)}</Stack>
  </section>
}
