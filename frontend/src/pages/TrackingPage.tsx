import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Box, Card, CardContent, Container, Divider, LinearProgress, Stack, Typography } from '@mui/material'
import { CheckRounded } from '@mui/icons-material'
import type { Repair } from '../types'
import { getTrackingRepair } from '../services/repairs'
import { UiState } from '../components/common/UiState'
import { canonicalStatus, canonicalStatusConfig, isSpecialStatus, repairFlow, repairStatusConfig } from '../config/repairStatus'
import { StatusChip } from '../components/common/StatusChip'
import { formatMoney } from '../utils/format'
import axios from 'axios'
import { Alert, Button } from '@mui/material'
import { TurnstileWidget } from '../components/security/TurnstileWidget'
import { deviceBrandLogo, deviceBrandTone, findKnownDeviceBrand } from '../config/deviceBrands'
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
  const status = canonicalStatus(repair.status)
  const statusConfig = canonicalStatusConfig(repair.status)
  const special = isSpecialStatus(status)
  const current = statusConfig.order
  const saldo = Math.max(0, repair.total - repair.paid)
  const brand = trackingBrand(repair)
  const brandLogo = brand.known ? deviceBrandLogo(brand.label) : null
  const brandTone = brand.known ? deviceBrandTone(brand.label) : { background: '#F1F3F7', color: '#596579' }
  const StatusIcon = statusConfig.icon
  return <Box component="main" minHeight="100vh" sx={{ bgcolor: '#F6F7FB', py: { xs: 3, md: 5 }, color: '#18243B' }}>
    <Container maxWidth="sm" sx={{ px: { xs: 2, sm: 3 } }}>
      <Stack alignItems="center" textAlign="center" mb={{ xs: 3, sm: 4 }}>
        <Box sx={{ width: { xs: 68, sm: 80 }, height: { xs: 68, sm: 80 }, p: 1.25, borderRadius: '50%', bgcolor: '#fff', border: '1px solid #E5E9F2', boxShadow: '0 4px 16px #24355008', display: 'grid', placeItems: 'center' }}>
          <Box component="img" src={repair.business?.logoUrl || tecnodeskMark} alt={repair.business?.logoUrl ? `Logo de ${businessName(repair)}` : 'TecnoDesk'} sx={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </Box>
        <Typography component="h1" sx={{ fontSize: { xs: 23, sm: 27 }, fontWeight: 800, mt: 1.75, overflowWrap: 'anywhere' }}>{businessName(repair)}</Typography>
        <Typography sx={{ color: '#6B7689', fontSize: 14, mt: .5 }}>Seguimiento de tu reparación</Typography>
      </Stack>
      <Card sx={{ bgcolor: '#fff', border: '1px solid #E7EAF1', borderRadius: 5, boxShadow: '0 12px 40px #24355008' }}>
        <CardContent sx={{ p: { xs: 2.5, sm: 4 }, '&:last-child': { pb: { xs: 2.5, sm: 4 } } }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1.25}>
            <Typography sx={{ fontSize: 11, letterSpacing: '0.09em', fontWeight: 800, color: '#727D90' }}>REPARACIÓN #{repair.number}</Typography>
            <StatusChip status={repair.status} />
          </Stack>
          <Typography component="h2" sx={{ fontSize: { xs: 28, sm: 34 }, lineHeight: 1.2, letterSpacing: '-0.035em', fontWeight: 800, mt: 2.5, overflowWrap: 'anywhere' }}>{repair.device}</Typography>
          <Stack direction="row" alignItems="center" gap={1} sx={{ mt: 1.25, mb: 3 }}>
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, px: 1.5, py: .8, bgcolor: brandTone.background, color: brandTone.color, borderRadius: 2, minWidth: 0 }}>
              {brandLogo && <Box component="svg" aria-hidden="true" viewBox="0 0 24 24" sx={{ width: 25, height: 25, flexShrink: 0, fill: brandLogo.color }}><path d={brandLogo.path} /></Box>}
              <Typography sx={{ fontSize: 12, fontWeight: 750, overflowWrap: 'anywhere' }}>{brand.label}</Typography>
            </Box>
          </Stack>
          <Stack direction="row" gap={1.5} sx={{ bgcolor: '#EFF6FF', border: '1px solid #DFEBFD', borderRadius: 3, p: 2 }}>
            <StatusIcon sx={{ color: '#4775BE', fontSize: 24, mt: .25 }} />
            <Box minWidth={0}><Typography sx={{ fontSize: 13, fontWeight: 800, color: '#315B99' }}>Estado actual</Typography><Typography sx={{ fontSize: 14, lineHeight: 1.65, color: '#506789', mt: .5 }}>{statusConfig.label}. Te avisaremos cuando haya novedades.</Typography></Box>
          </Stack>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mt={3.5}>
            <Typography component="h3" sx={{ fontSize: 16, fontWeight: 800 }}>Progreso</Typography>
            <Typography sx={{ fontSize: 12, color: '#728096' }}>{special ? statusConfig.label : `${statusConfig.progress}%`}</Typography>
          </Stack>
          <LinearProgress aria-label="Progreso de la reparación" variant="determinate" value={special ? 0 : statusConfig.progress} sx={{ height: 7, borderRadius: 8, mt: 1.5, mb: 2, bgcolor: '#EDF0F6', '& .MuiLinearProgress-bar': { borderRadius: 8, bgcolor: '#6B58CF' } }} />
          <Stack component="ol" sx={{ m: 0, p: 0, listStyle: 'none' }}>
            {repairFlow.map(step => {
              const config = repairStatusConfig[step]
              const active = !special && step === status
              const complete = !special && config.order < current
              return <Stack component="li" direction="row" alignItems="center" gap={1.5} key={step} aria-current={active ? 'step' : undefined} sx={{ py: 1, px: 1.25, borderRadius: 2.5, bgcolor: active ? '#F1EFFB' : 'transparent' }}>
                <Box sx={{ width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0, bgcolor: active ? '#6B58CF' : complete ? '#ECF6F0' : '#F0F2F6', color: active ? '#fff' : complete ? '#398460' : '#9BA4B3' }}>{complete || active ? <CheckRounded sx={{ fontSize: 17 }} /> : <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'currentColor' }} />}</Box>
                <Typography sx={{ flex: 1, fontSize: 13, fontWeight: active ? 800 : 550, color: active ? '#5845AF' : complete ? '#445169' : '#8791A2' }}>{config.label}</Typography>
                {active && <Typography sx={{ fontSize: 10, fontWeight: 750, color: '#6B58CF', flexShrink: 0 }}>Actual</Typography>}
              </Stack>
            })}
          </Stack>
          {special && <Typography sx={{ fontSize: 12, color: '#6B7689', mt: 1 }}>Esta reparación está en estado {statusConfig.label.toLowerCase()}, fuera del progreso habitual.</Typography>}
          <Divider sx={{ my: 3, borderColor: '#EDF0F5' }} />
          <GridSummary label="Trabajo informado" value={repair.issue} />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: { xs: 2, sm: 1.5 }, mt: 2.5, p: 2, borderRadius: 3, bgcolor: '#F8F9FC', border: '1px solid #EDF0F5' }}>
            <GridSummary label="Presupuesto" value={formatMoney(repair.total)} />
            <GridSummary label="Pagado" value={formatMoney(repair.paid)} color="#278152" />
            <GridSummary label="Saldo" value={formatMoney(saldo)} color={saldo > 0 ? '#B56714' : '#278152'} />
          </Box>
        </CardContent>
      </Card>
      <Typography variant="caption" display="block" textAlign="center" sx={{ color: '#7B8596', mt: 3, px: 1, lineHeight: 1.8 }}>No necesitás una cuenta. Esta página se actualiza cuando el servicio técnico cambia el estado del equipo. · <Link to="/politica-de-privacidad">Privacidad</Link></Typography>
    </Container>
  </Box>
}

/** Prioriza la marca explícita; sólo infiere prefijos inequívocos si falta ese dato. */
function trackingBrand(repair: Repair): { label: string; known: boolean } {
  const explicit = repair.deviceBrand?.trim()
  if (explicit && explicit.toLowerCase() !== 'otra') {
    const known = findKnownDeviceBrand(explicit)
    return { label: known || explicit, known: Boolean(known) }
  }
  const prefix = repair.device.trim().match(/^(samsung|motorola|moto|apple|iphone|ipad|xiaomi|redmi|poco|tcl|alcatel|huawei|honor|nokia|oppo|realme|vivo|sony|asus|oneplus)\b/i)?.[1]
  const known = prefix ? findKnownDeviceBrand(prefix) : null
  return { label: known || repair.deviceModel?.trim() || repair.device, known: Boolean(known) }
}

function GridSummary({ label, value, color }: { label: string; value: string; color?: string }) {
  return <Box minWidth={0}><Typography sx={{ fontSize: 11, color: '#788397', mb: .65 }}>{label}</Typography><Typography sx={{ fontSize: 14, fontWeight: 750, color: color || '#26344C', overflowWrap: 'anywhere', lineHeight: 1.6 }}>{value}</Typography></Box>
}
