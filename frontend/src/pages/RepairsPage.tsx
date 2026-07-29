import { useCallback, useEffect, useMemo, useState } from 'react'
import { Box, Button, Card, CardContent, Chip, Grid, IconButton, InputAdornment, LinearProgress, Stack, TextField, Tooltip, Typography } from '@mui/material'
import { AddRounded, ContentCopyRounded, OpenInNewRounded, SearchRounded, WhatsApp } from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import type { Repair, RepairStatus } from '../types'
import { getRepairs } from '../services/repairs'
import { repairStatusConfig, repairStatuses } from '../config/repairStatus'
import { formatDate, formatMoney } from '../utils/format'
import { PageHeader } from '../components/common/PageHeader'
import { StatusChip } from '../components/common/StatusChip'
import { StatCard } from '../components/common/StatCard'
import { UiState } from '../components/common/UiState'

export function RepairsPage() {
  const navigate = useNavigate()
  const [repairs, setRepairs] = useState<Repair[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<RepairStatus | 'all'>('all')
  const load = useCallback(async () => {
    setLoading(true); setError(false)
    try {
      setRepairs(await getRepairs())
    } catch { setError(true) } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  const filtered = useMemo(() => repairs.filter(repair => {
    const matchesFilter = filter === 'all' || repair.status === filter
    const text = `${repair.id} ${repair.clientName} ${repair.device} ${repair.issue}`.toLowerCase()
    return matchesFilter && text.includes(query.trim().toLowerCase())
  }), [repairs, filter, query])
  const count = (statuses: RepairStatus[]) => repairs.filter(repair => statuses.includes(repair.status)).length
  return (
    <Box>
      <PageHeader eyebrow="GESTIÓN DE TALLER" title="Reparaciones" description="Seguimiento claro de cada equipo, presupuesto y pago." action={<Button variant="contained" startIcon={<AddRounded />} onClick={() => navigate('/reparaciones/nueva')}>Nueva reparación</Button>} />
      <Grid container spacing={1.5} mb={2.2}>
        <Grid size={{ xs: 6, lg: 3 }}><StatCard label="Total activas" value={String(count(repairStatuses.slice(0, 7)))} icon={<OpenInNewRounded />} /></Grid>
        <Grid size={{ xs: 6, lg: 3 }}><StatCard label="En revisión" value={String(count(['review']))} icon={<SearchRounded />} tone="info" /></Grid>
        <Grid size={{ xs: 6, lg: 3 }}><StatCard label="En reparación" value={String(count(['repairing']))} icon={<OpenInNewRounded />} tone="warning" /></Grid>
        <Grid size={{ xs: 6, lg: 3 }}><StatCard label="Listas para retirar" value={String(count(['ready']))} icon={<OpenInNewRounded />} tone="success" /></Grid>
      </Grid>
      <Card sx={{ mb: 2.2 }}><CardContent>
        <TextField fullWidth value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por número, cliente, equipo o problema" InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded /></InputAdornment> }} />
        <Stack direction="row" gap={1} mt={2} sx={{ overflowX: 'auto', pb: 0.5 }}>
          <Chip clickable label="Todas" onClick={() => setFilter('all')} color={filter === 'all' ? 'primary' : 'default'} />
          {repairStatuses.map(status => <Chip clickable key={status} label={repairStatusConfig[status].label} onClick={() => setFilter(status)} sx={filter === status ? { color: '#fff', bgcolor: repairStatusConfig[status].color } : { flexShrink: 0 }} />)}
        </Stack>
      </CardContent></Card>
      {loading ? <Card><UiState loading /></Card> : error ? <Card><UiState title="No pudimos cargar las reparaciones" description="Revisá la conexión con el servidor e intentá nuevamente." action={() => void load()} /></Card> : !filtered.length ? <Card><UiState title={repairs.length ? 'No encontramos resultados' : 'Todavía no hay reparaciones'} description={repairs.length ? 'Probá con otra búsqueda o filtro.' : 'Creá la primera reparación para comenzar.'} /></Card> : (
        <Stack spacing={1.5}>{filtered.map(repair => {
          const pending = Math.max(0, repair.total - repair.paid)
          const tracking = `${window.location.origin}/seguimiento/${repair.trackingToken}`
          return <Card key={repair.id}><CardContent>
            <Stack direction={{ xs: 'column', md: 'row' }} gap={2.5} alignItems={{ md: 'center' }}>
              <Box flex={1} minWidth={0}>
                <Stack direction="row" alignItems="center" gap={1} mb={0.7}><Typography variant="caption" color="primary.main" fontWeight={800}>REPARACIÓN #{repair.number}</Typography><StatusChip status={repair.status} /></Stack>
                <Typography variant="h2">{repair.device}</Typography><Typography variant="body2" color="text.secondary">{repair.clientName} · {repair.issue}</Typography>
                <Typography variant="caption" color="text.secondary">Ingreso: {formatDate(repair.createdAt)} · Última actualización: hoy</Typography>
                <LinearProgress variant="determinate" value={repairStatusConfig[repair.status].progress} sx={{ mt: 1.5, maxWidth: 420, height: 6, borderRadius: 6, bgcolor: '#EEF0F4', '& .MuiLinearProgress-bar': { bgcolor: repairStatusConfig[repair.status].color } }} />
              </Box>
              <Grid container spacing={1.5} minWidth={{ md: 360 }} flex={{ md: '0 0 auto' }}>
                <Grid size={4}><Typography variant="caption" color="text.secondary">Total</Typography><Typography fontWeight={750}>{formatMoney(repair.total)}</Typography></Grid>
                <Grid size={4}><Typography variant="caption" color="text.secondary">Pagado</Typography><Typography fontWeight={750} color="success.main">{formatMoney(repair.paid)}</Typography></Grid>
                <Grid size={4}><Typography variant="caption" color="text.secondary">Saldo</Typography><Typography fontWeight={800} color={pending ? 'error.main' : 'success.main'}>{formatMoney(pending)}</Typography></Grid>
              </Grid>
              <Stack direction="row" gap={1}>
                <Tooltip title="Copiar seguimiento"><IconButton aria-label={`Copiar seguimiento de la reparación ${repair.id}`} onClick={() => void navigator.clipboard?.writeText(tracking)}><ContentCopyRounded /></IconButton></Tooltip>
                {repair.phone && <Tooltip title="WhatsApp"><IconButton aria-label={`Contactar a ${repair.clientName} por WhatsApp`} component="a" target="_blank" href={`https://wa.me/${repair.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${repair.clientName}, podés seguir tu reparación acá: ${tracking}`)}`}><WhatsApp /></IconButton></Tooltip>}
                <Button variant="outlined" onClick={() => navigate(`/reparaciones/${repair.id}`)}>Ver reparación</Button>
              </Stack>
            </Stack>
          </CardContent></Card>
        })}</Stack>
      )}
    </Box>
  )
}
