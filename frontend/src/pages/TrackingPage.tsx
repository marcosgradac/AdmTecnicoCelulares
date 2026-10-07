import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Box, Card, CardContent, Container, Divider, Stack, Typography } from '@mui/material'
import { CheckRounded, PaymentsRounded } from '@mui/icons-material'
import type { Repair } from '../types'
import { getTrackingRepair } from '../services/repairs'
import { UiState } from '../components/common/UiState'
import { canonicalStatus, canonicalStatusConfig, isSpecialStatus, repairFlow, repairStatusConfig } from '../config/repairStatus'
import { formatDate, formatMoney } from '../utils/format'
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
  const current = repairFlow.indexOf(status)
  const saldo = Math.max(0, repair.total - repair.paid)
  // El dato explícito manda; no adivinamos marcas a partir del modelo.
  const brand = repair.deviceBrand?.trim()
  const knownBrand = findKnownDeviceBrand(brand)
  const brandLabel = knownBrand || (brand && brand.toLowerCase() !== 'otra' ? brand : repair.deviceModel || repair.device)
  const logo = knownBrand ? deviceBrandLogo(knownBrand) : null
  const tone = knownBrand ? deviceBrandTone(knownBrand) : { background: '#F1F3F7', color: '#627087' }
  const StatusIcon = statusConfig.icon
  const cardSx = { border: '1px solid #E5EAF2', borderRadius: 3, boxShadow: '0 3px 14px #25395904', bgcolor: '#fff' }
  return <Box component="main" minHeight="100vh" sx={{ bgcolor: '#F5F7FB', color: '#24334A', pb: 2 }}>
    <Box component="header" sx={{ position: 'relative', overflow: 'hidden', pt: { xs: 2.5, sm: 3 }, pb: 2.5, bgcolor: '#F0F3FC', '&::before': { content: '""', position: 'absolute', width: '85%', height: 160, bgcolor: '#DFE9FC', borderRadius: '50%', top: -90, left: '-18%', transform: 'rotate(-8deg)' }, '&::after': { content: '""', position: 'absolute', width: '80%', height: 140, bgcolor: '#E9E3F8', borderRadius: '50%', top: -80, right: '-22%', transform: 'rotate(12deg)' } }}>
      <Stack alignItems="center" textAlign="center" sx={{ position: 'relative', zIndex: 1, px: 2 }}>
        <Box sx={{ width: { xs: 64, sm: 76 }, height: { xs: 64, sm: 76 }, borderRadius: '50%', overflow: 'hidden', bgcolor: '#fff', border: '1px solid #E1E6F0', boxShadow: '0 4px 14px #26375B0A' }}>
          <Box component="img" src={repair.business?.logoUrl || tecnodeskMark} alt={repair.business?.logoUrl ? `Logo de ${businessName(repair)}` : 'TecnoDesk'} sx={{ width: '100%', height: '100%', borderRadius: '50%', display: 'block', objectFit: repair.business?.logoUrl ? 'cover' : 'contain', objectPosition: 'center' }} />
        </Box>
        <Typography component="h1" sx={{ fontSize: { xs: 21, sm: 24 }, fontWeight: 800, mt: 1, overflowWrap: 'anywhere' }}>{businessName(repair)}</Typography>
        <Typography sx={{ fontSize: 13, color: '#748098', mt: .3 }}>Seguimiento de tu reparación</Typography>
      </Stack>
    </Box>
    <Container sx={{ maxWidth: '660px !important', px: { xs: 2, sm: 3 }, mt: 2 }}>
      <Stack gap={1.5}>
        <Card sx={{ ...cardSx, bgcolor: '#F0F6FF', borderColor: '#DCE8FB' }}>
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
            <Stack direction="row" gap={1.5} alignItems="center">
              <Box sx={{ width: 42, height: 42, flexShrink: 0, borderRadius: '50%', bgcolor: '#E0EBFF', color: '#4779CA', display: 'grid', placeItems: 'center' }}><StatusIcon sx={{ fontSize: 23 }} /></Box>
              <Box minWidth={0}><Typography sx={{ fontSize: 10, letterSpacing: '.07em', fontWeight: 750, color: '#6882A9' }}>ESTADO ACTUAL</Typography><Typography component="h2" sx={{ fontSize: 18, fontWeight: 800, mt: .2 }}>{statusConfig.label}</Typography><Typography sx={{ fontSize: 12, color: '#657B9B', mt: .4 }}>Te avisaremos cuando haya novedades.</Typography></Box>
            </Stack>
          </CardContent>
        </Card>
        <Card sx={cardSx}>
          <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
            <Typography component="h2" sx={{ fontSize: 12, fontWeight: 750, mb: 1.5 }}>Progreso</Typography>
            <Box component="ol" aria-label="Progreso de la reparación" sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', p: 0, m: 0, listStyle: 'none' }}>
              {repairFlow.map((step, index) => {
                const active = !special && index === current
                const complete = !special && index < current
                return <Box component="li" key={step} aria-current={active ? 'step' : undefined} title={repairStatusConfig[step].label} sx={{ position: 'relative', textAlign: 'center', '&::after': index < repairFlow.length - 1 ? { content: '""', position: 'absolute', height: 2, left: 'calc(50% + 12px)', right: 'calc(-50% + 12px)', top: 11, bgcolor: complete ? '#7293DF' : '#E4E9F1' } : {} }}>
                  <Box sx={{ position: 'relative', zIndex: 1, mx: 'auto', width: 24, height: 24, borderRadius: '50%', border: '2px solid', borderColor: active || complete ? '#6686D6' : '#DFE5EE', bgcolor: active || complete ? '#6686D6' : '#fff', color: '#fff', display: 'grid', placeItems: 'center', boxShadow: active ? '0 0 0 3px #E9EEFC' : 'none' }}>{complete ? <CheckRounded sx={{ fontSize: 15 }} /> : active ? <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#fff' }} /> : null}</Box>
                  <Typography sx={{ fontSize: { xs: 9, sm: 11 }, lineHeight: 1.3, mt: 1, px: .2, fontWeight: active ? 800 : 550, color: active ? '#4A64AE' : complete ? '#586A88' : '#8E99AC' }}>{repairStatusConfig[step].label}</Typography>
                </Box>
              })}
            </Box>
            {special && <Typography sx={{ fontSize: 11, color: '#748098', mt: 1.25 }}>{statusConfig.label}: fuera del progreso habitual.</Typography>}
          </CardContent>
        </Card>
        <Card sx={cardSx}>
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
            <Stack direction="row" gap={1.5} alignItems="center">
              <Box sx={{ width: 52, minHeight: 52, flexShrink: 0, borderRadius: 2.5, bgcolor: tone.background, color: tone.color, display: 'grid', placeItems: 'center', p: .75 }}>
                {logo ? <Box component="svg" aria-label={brandLabel} role="img" viewBox="0 0 24 24" sx={{ width: 35, height: 35, fill: logo.color }}><path d={logo.path} /></Box> : <Typography sx={{ fontSize: 10, fontWeight: 800, textAlign: 'center', overflowWrap: 'anywhere', width: '100%' }}>{brandLabel}</Typography>}
              </Box>
              <Box minWidth={0} flex={1}>
                <Stack direction="row" alignItems="baseline" justifyContent="space-between" gap={1} flexWrap="wrap"><Typography component="h2" sx={{ fontSize: { xs: 15, sm: 17 }, fontWeight: 800, overflowWrap: 'anywhere' }}>{repair.device}</Typography><Typography sx={{ fontSize: 10, color: '#7B879C', whiteSpace: 'nowrap', bgcolor: '#F3F5F9', borderRadius: 1, px: .75, py: .25 }}>#REP-{String(repair.number).padStart(5, '0')}</Typography></Stack>
                <Typography sx={{ fontSize: 12, color: '#748098', mt: .5, lineHeight: 1.5, overflowWrap: 'anywhere' }}>{repair.issue}</Typography>
              </Box>
            </Stack>
          </CardContent>
        </Card>
        <Card sx={cardSx}>
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}><Stack gap={1.25}>
            <InfoRow label="Fecha de ingreso" value={formatDate(repair.createdAt)} />
            <InfoRow label="Última actualización" value={formatDate(repair.updatedAt)} />
            <InfoRow label="Entrega estimada" value={repair.estimatedDeliveryDate ? formatDate(repair.estimatedDeliveryDate) : 'A confirmar'} />
          </Stack></CardContent>
        </Card>
        <Card sx={{ ...cardSx, bgcolor: '#EDF8F1', borderColor: '#D7EBDD' }}>
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}><Stack gap={1.25}>
            <Stack direction="row" alignItems="center" gap={1}><PaymentsRounded sx={{ fontSize: 21, color: '#448665' }} /><Box flex={1}><InfoRow label="Presupuesto" value={formatMoney(repair.total)} emphasis /></Box></Stack>
            <Divider sx={{ borderColor: '#D8EBDF' }} />
            <InfoRow label="Pagado" value={formatMoney(repair.paid)} color="#36805A" />
            <InfoRow label="Saldo pendiente" value={formatMoney(saldo)} color={saldo > 0 ? '#C83E3E' : '#36805A'} emphasis />
          </Stack></CardContent>
        </Card>
      </Stack>
      <Typography sx={{ fontSize: 10, textAlign: 'center', color: '#8A95A7', mt: 2, lineHeight: 1.7 }}>No necesitás una cuenta. El seguimiento se actualiza con las novedades del taller. · <Link to="/politica-de-privacidad">Privacidad</Link></Typography>
    </Container>
  </Box>
}

function InfoRow({ label, value, color, emphasis = false }: { label: string; value: string; color?: string; emphasis?: boolean }) {
  return <Stack direction="row" justifyContent="space-between" alignItems="baseline" gap={1.5}><Typography sx={{ fontSize: 12, color: '#6C7C8E', fontWeight: emphasis ? 750 : 500 }}>{label}</Typography><Typography sx={{ fontSize: 12, textAlign: 'right', fontWeight: emphasis ? 800 : 600, color: color || '#35485A', overflowWrap: 'anywhere' }}>{value}</Typography></Stack>
}
