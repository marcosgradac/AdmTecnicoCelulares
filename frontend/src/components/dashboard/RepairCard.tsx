import { ArrowForwardRounded } from '@mui/icons-material'
import { Card, CardActionArea, CardContent, IconButton, Typography } from '@mui/material'
import { useNavigate } from 'react-router-dom'
import { RepairStatusChip } from '../repairs/RepairStatusChip'
import type { DashboardRepair } from '../../types/dashboard.types'

export function RepairCard({ repair }: { repair: DashboardRepair }) {
  const navigate = useNavigate()
  return <Card className="repair-card"><CardActionArea onClick={() => navigate(`/reparaciones/${repair.id}`)}>
    <CardContent><div className="repair-card__top"><Typography fontWeight={800}>#{repair.number}</Typography><RepairStatusChip status={repair.status} /></div>
      <Typography variant="h3">{repair.client}</Typography><Typography color="text.secondary">{repair.device} · {repair.issue}</Typography>
      <div className="repair-card__bottom"><Typography variant="caption">Ingreso {new Date(repair.receivedAt).toLocaleDateString('es-AR')}</Typography><Typography fontWeight={800}>${repair.total.toLocaleString('es-AR')}</Typography><IconButton size="small" aria-label={`Abrir reparación ${repair.number}`}><ArrowForwardRounded /></IconButton></div>
    </CardContent></CardActionArea></Card>
}
