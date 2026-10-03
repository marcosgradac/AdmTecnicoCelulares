import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Avatar, Box, Card, CardContent, Container, Divider, LinearProgress, Stack, Typography } from '@mui/material'
import { BuildRounded, CheckRounded } from '@mui/icons-material'
import type { Repair } from '../types'
import { getTrackingRepair } from '../services/repairs'
import { UiState } from '../components/common/UiState'
import { canonicalStatusConfig, repairFlow, repairStatusConfig, repairStatusLabel } from '../config/repairStatus'
import { StatusChip } from '../components/common/StatusChip'
import { formatMoney } from '../utils/format'
import axios from 'axios'
import { Alert, Button } from '@mui/material'
import { TurnstileWidget } from '../components/security/TurnstileWidget'
import tecnodeskMark from '../assets/brand/tecnodesk-mark.png'

/** Nombre del negocio dueño de la reparación. Nunca el nombre personal del propietario. */
const businessName = (repair: Repair) => repair.business?.name?.trim() || 'TecnoDesk'

/** Estado de error de la consulta pública, distinguido para poder explicar bien cada caso. */
type TrackingError = 'not-found' | 'expired'

/** Mensaje y título de la pantalla de enlace vencido. No revela ningún dato de la reparación. */
const EXPIRED_TITLE = 'Este seguimiento finalizó'
const EXPIRED_DESCRIPTION =
  'El dispositivo fue entregado y este enlace de seguimiento ya venció. Si necesitás asistencia, comunicate con el servicio técnico.'

export function TrackingPage() {
  // El slug del cliente no se usa para nada: sólo el token identifica la reparación.
  const { token } = useParams()
  const [repair, setRepair] = useState<Repair | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<TrackingError | null>(null)
  const [challenge, setChallenge] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState('')
  const [challengeResetKey, setChallengeResetKey] = useState(0)
  const load = (captchaToken?: string) => {
    if (!token) return
    setLoading(true); setError(null)
    void getTrackingRepair(token, captchaToken).then(value => { setRepair(value); setChallenge(false) }).catch(requestError => {
      if (axios.isAxiosError<{ code?: string }>(requestError)) {
        // 410: el enlace existió y terminó. 404: no existe, o ya no está habilitado.
        if (requestError.response?.status === 410 || requestError.response?.data?.code === 'TRACKING_EXPIRED') {
          setError('expired')
          return
        }
        if (requestError.response?.data?.code === 'TURNSTILE_REQUIRED') { setChallenge(true); return }
      }
      setError('not-found')
    }).finally(() => setLoading(false))
  }
  useEffect(() => {
    load()
    // El token de la URL es la única dependencia que debe disparar la carga inicial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])
  if (loading) return <Box minHeight="100vh" display="grid" sx={{ placeItems: 'center' }}><UiState loading /></Box>
  if (challenge) return <Box minHeight="100vh" display="grid" sx={{ placeItems: 'center' }}><Container maxWidth="xs"><Stack spacing={2} textAlign="center"><Alert severity="info">Necesitamos verificar esta consulta antes de mostrar el seguimiento.</Alert><TurnstileWidget onToken={setTurnstileToken} resetKey={challengeResetKey} /><Button variant="contained" disabled={!turnstileToken} onClick={() => { load(turnstileToken); setTurnstileToken(''); setChallengeResetKey(value => value + 1) }}>Continuar</Button></Stack></Container></Box>
  // Enlace vencido: pantalla propia, sin ningún dato de la reparación ni del cliente.
  if (error === 'expired') return <Box minHeight="100vh" display="grid" sx={{ placeItems: 'center' }}><UiState title={EXPIRED_TITLE} description={EXPIRED_DESCRIPTION}/></Box>
  if (error === 'not-found' || !repair) return <Box minHeight="100vh" display="grid" sx={{ placeItems: 'center' }}><UiState title="Seguimiento no encontrado" description="Revisá que el enlace sea correcto o consultá al servicio técnico." /></Box>
  const current = canonicalStatusConfig(repair.status).order
  const currentStep = canonicalStatusConfig(repair.status).label
  const saldo = Math.max(0, repair.total - repair.paid)
  return <Box minHeight="100vh" bgcolor="background.default" py={{ xs: 3, md: 7 }}>
    <Container maxWidth="sm">
      <Stack alignItems="center" textAlign="center" mb={3}>{repair.business?.logoUrl ? <Box component="img" src={repair.business.logoUrl} alt={`Logo de ${businessName(repair)}`} width={72} height={72} sx={{ objectFit: 'contain' }}/> : <Box component="img" src={tecnodeskMark} alt="TecnoDesk" width={64} height={64} sx={{ objectFit: 'contain' }}/>}<Typography variant="h5" mt={1.2}>{businessName(repair)}</Typography><Typography color="text.secondary">Seguimiento de tu reparación</Typography></Stack>
      <Card><CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={2}><Box><Typography variant="overline" color="primary.main">REPARACIÓN #{repair.number}</Typography><Typography variant="h1">{repair.device}</Typography></Box><StatusChip status={repair.status}/></Stack>
        <Box bgcolor="secondary.light" borderRadius={3} p={2} my={3}><Stack direction="row" gap={1.5}><BuildRounded color="info"/><Box><Typography fontWeight={750}>Estado actual</Typography><Typography variant="body2" color="text.secondary">{repairStatusConfig[repair.status].label}. Te avisaremos cuando haya novedades.</Typography></Box></Stack></Box>
        <Typography variant="h2">Progreso</Typography><LinearProgress variant="determinate" value={repairStatusConfig[repair.status].progress} sx={{ height: 8, borderRadius: 8, my: 2, bgcolor: '#EEF0F4', '& .MuiLinearProgress-bar': { borderRadius: 8 } }}/>
        <Stack spacing={1.3}>{repairFlow.map(status => { const config = repairStatusConfig[status]; const complete = config.order <= current; return <Stack direction="row" alignItems="center" gap={1.4} key={status}><Box width={25} height={25} borderRadius="50%" display="grid" sx={{ placeItems: 'center', bgcolor: complete ? config.color : '#EEF0F4', color: complete ? '#fff' : '#9AA0AE' }}>{complete ? <CheckRounded sx={{ fontSize: 16 }}/> : config.order + 1}</Box><Typography fontWeight={status === currentStep ? 800 : 550} color={complete ? 'text.primary' : 'text.secondary'}>{config.label}</Typography>{status === currentStep && <Typography variant="caption" color="primary.main">Estado actual</Typography>}</Stack>})}</Stack>
        <Divider sx={{ my: 3 }}/><GridSummary label="Trabajo informado" value={repair.issue}/><Stack direction="row" gap={3} mt={2}><GridSummary label="Presupuesto" value={formatMoney(repair.total)}/><GridSummary label="Pagado" value={formatMoney(repair.paid)} color="success.main"/><GridSummary label="Saldo" value={formatMoney(saldo)} color={saldo > 0 ? 'warning.main' : 'success.main'}/></Stack>
      </CardContent></Card>
      <Typography variant="caption" display="block" textAlign="center" color="text.secondary" mt={3}>No necesitás una cuenta. Esta página se actualiza cuando el servicio técnico cambia el estado del equipo. · <Link to="/politica-de-privacidad">Privacidad</Link></Typography>
    </Container>
  </Box>
}

function GridSummary({ label, value, color }: { label: string; value: string; color?: string }) {
  return <Box flex={1} minWidth={0}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography fontWeight={750} color={color} sx={{ overflowWrap: 'anywhere' }}>{value}</Typography></Box>
}
