import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Box, Card, CardContent, Container, Divider, LinearProgress, Stack, Typography } from '@mui/material'
import { BuildRounded, CheckRounded, PhoneIphoneRounded } from '@mui/icons-material'
import type { Repair } from '../types'
import { getTrackingRepair } from '../services/repairs'
import { UiState } from '../components/common/UiState'
import { repairStatusConfig, repairStatuses } from '../config/repairStatus'
import { StatusChip } from '../components/common/StatusChip'
import { formatMoney } from '../utils/format'

export function TrackingPage() {
  const { token } = useParams()
  const [repair, setRepair] = useState<Repair | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  useEffect(() => {
    if (!token) return
    setLoading(true); setError(false)
    void getTrackingRepair(token).then(setRepair).catch(() => setError(true)).finally(() => setLoading(false))
  }, [token])
  if (loading) return <Box minHeight="100vh" display="grid" sx={{ placeItems: 'center' }}><UiState loading /></Box>
  if (error || !repair) return <Box minHeight="100vh" display="grid" sx={{ placeItems: 'center' }}><UiState title="Seguimiento no encontrado" description="Revisá que el enlace sea correcto o consultá al servicio técnico." /></Box>
  const current = repairStatusConfig[repair.status].order
  return <Box minHeight="100vh" bgcolor="background.default" py={{ xs: 3, md: 7 }}>
    <Container maxWidth="sm">
      <Stack alignItems="center" textAlign="center" mb={3}><Box width={52} height={52} borderRadius={3.5} bgcolor="primary.main" color="#fff" display="grid" sx={{ placeItems: 'center' }}><PhoneIphoneRounded/></Box><Typography variant="h5" mt={1.2}>CelluFix</Typography><Typography color="text.secondary">Seguimiento de tu reparación</Typography></Stack>
      <Card><CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={2}><Box><Typography variant="overline" color="primary.main">REPARACIÓN #{repair.number}</Typography><Typography variant="h1">{repair.device}</Typography></Box><StatusChip status={repair.status}/></Stack>
        <Box bgcolor="secondary.light" borderRadius={3} p={2} my={3}><Stack direction="row" gap={1.5}><BuildRounded color="info"/><Box><Typography fontWeight={750}>Estado actual</Typography><Typography variant="body2" color="text.secondary">{repairStatusConfig[repair.status].label}. Te avisaremos cuando haya novedades.</Typography></Box></Stack></Box>
        <Typography variant="h2">Progreso</Typography><LinearProgress variant="determinate" value={repairStatusConfig[repair.status].progress} sx={{ height: 8, borderRadius: 8, my: 2, bgcolor: '#EEF0F4', '& .MuiLinearProgress-bar': { borderRadius: 8 } }}/>
        <Stack spacing={1.3}>{repairStatuses.map(status => { const config = repairStatusConfig[status]; const complete = config.order <= current; return <Stack direction="row" alignItems="center" gap={1.4} key={status}><Box width={25} height={25} borderRadius="50%" display="grid" sx={{ placeItems: 'center', bgcolor: complete ? config.color : '#EEF0F4', color: complete ? '#fff' : '#9AA0AE' }}>{complete ? <CheckRounded sx={{ fontSize: 16 }}/> : config.order + 1}</Box><Typography fontWeight={status === repair.status ? 800 : 550} color={complete ? 'text.primary' : 'text.secondary'}>{config.label}</Typography>{status === repair.status && <Typography variant="caption" color="primary.main">Estado actual</Typography>}</Stack>})}</Stack>
        <Divider sx={{ my: 3 }}/><GridSummary label="Trabajo informado" value={repair.issue}/><Stack direction="row" gap={3} mt={2}><GridSummary label="Presupuesto" value={formatMoney(repair.total)}/><GridSummary label="Pagado" value={formatMoney(repair.paid)}/><GridSummary label="Saldo" value={formatMoney(Math.max(0, repair.total - repair.paid))}/></Stack>
      </CardContent></Card>
      <Typography variant="caption" display="block" textAlign="center" color="text.secondary" mt={3}>No necesitás una cuenta. Esta página se actualiza cuando el servicio técnico cambia el estado del equipo.</Typography>
    </Container>
  </Box>
}

function GridSummary({ label, value }: { label: string; value: string }) {
  return <Box flex={1}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography fontWeight={750}>{value}</Typography></Box>
}
