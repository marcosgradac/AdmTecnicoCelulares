import { CheckCircleRounded, GroupsRounded, PaymentsRounded, RocketLaunchRounded, StorefrontRounded, TrendingUpRounded } from '@mui/icons-material'
import { Box, Button, Card, CardContent, Chip, Stack, Typography } from '@mui/material'
import { StatCard } from '../../../components/common/StatCard'
import { formatARS, formatDate } from '../../billing/billing.utils'
import { getAdminDashboard, type AccountAccess } from '../platformAdmin.api'
import { usePlatformResource } from '../platformAdmin.hooks'
import { AccessChip, PlatformError, PlatformLoading, RefreshingBar, remainingLabel } from '../platformAdmin.shared'

const AttentionRow = ({ name, access, onOpen }: { name: string; access: AccountAccess; onOpen: () => void }) => (
  <Box display="flex" gap={1.5} flexWrap="wrap" alignItems={{ xs: 'flex-start', sm: 'center' }} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 3, bgcolor: '#FBFBFE' }}>
    <AccessChip access={access} />
    <Box flex={1} minWidth={140}>
      <Typography fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{name}</Typography>
      <Typography variant="caption" color="text.secondary">{remainingLabel(access)}</Typography>
    </Box>
    <Button size="small" onClick={onOpen}>Ver negocio</Button>
  </Box>
)

export function DashboardSection({ refreshToken, onOpenBusiness }: { refreshToken: number; onOpenBusiness: (id: string) => void }) {
  const dashboard = usePlatformResource(getAdminDashboard, `dashboard:${refreshToken}`)
  if (dashboard.loading && !dashboard.data) return <PlatformLoading label="Cargando el resumen de la plataforma…" />
  if (dashboard.error || !dashboard.data) return <PlatformError message={dashboard.error || 'No pudimos leer el resumen de la plataforma.'} onRetry={dashboard.reload} />
  const data = dashboard.data
  const kpis = [
    { label: 'Negocios', value: String(data.clients), helper: `${data.activeBusinesses} activos · ${data.inactiveBusinesses} inactivos`, icon: <StorefrontRounded />, tone: 'primary' as const },
    { label: 'Suscripciones activas', value: String(data.active), helper: `${data.grace} en gracia · ${data.suspended} suspendidas`, icon: <CheckCircleRounded />, tone: 'success' as const },
    { label: 'Trials en curso', value: String(data.trials), helper: 'Período de prueba gratuito', icon: <RocketLaunchRounded />, tone: 'info' as const },
    { label: 'Pagos pendientes', value: String(data.pendingPayments), helper: 'Transferencias por revisar', icon: <PaymentsRounded />, tone: 'warning' as const },
    { label: 'MRR estimado', value: formatARS(data.estimatedMrrARS), helper: 'Según los planes activos', icon: <TrendingUpRounded />, tone: 'primary' as const },
  ]
  return <Stack spacing={3}>
    {dashboard.loading && <RefreshingBar />}
    <Box display="grid" gap={2} gridTemplateColumns={{ xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(5, minmax(0, 1fr))' }}>
      {kpis.map(kpi => <StatCard key={kpi.label} {...kpi} />)}
    </Box>
    <Typography variant="body2" color="text.secondary" display="flex" alignItems="center" gap={.75}>
      <GroupsRounded fontSize="small" sx={{ color: 'primary.main' }} />
      {data.owners} propietarios y {data.technicians} técnicos registrados en la plataforma.
    </Typography>
    <Box display="grid" gap={2} gridTemplateColumns={{ xs: '1fr', lg: 'minmax(0, 1.35fr) minmax(0, 1fr)' }}>
      <Card><CardContent>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1.5}>
          <Box>
            <Typography variant="h3">Necesitan atención</Typography>
            <Typography variant="body2" color="text.secondary" mt={.5}>Cuentas por vencer, en período de gracia o bloqueadas.</Typography>
          </Box>
          <Stack direction="row" gap={1} flexWrap="wrap">
            <Chip size="small" label={`Por vencer: ${data.lifecycle.expiring}`} />
            <Chip size="small" label={`En gracia: ${data.lifecycle.grace}`} />
            <Chip size="small" label={`Bloqueadas: ${data.lifecycle.blocked}`} />
          </Stack>
        </Stack>
        <Stack spacing={1.5} mt={2.5}>
          {data.attention.length
            ? data.attention.map(item => <AttentionRow key={item.business.id} name={item.business.name} access={item.access} onOpen={() => onOpenBusiness(item.business.id)} />)
            : <Typography variant="body2" color="text.secondary">No hay cuentas que necesiten atención inmediata.</Typography>}
        </Stack>
      </CardContent></Card>
      <Card><CardContent>
        <Typography variant="h3">Negocios recientes</Typography>
        <Typography variant="body2" color="text.secondary" mt={.5}>Últimos negocios registrados.</Typography>
        <Stack spacing={1.5} mt={2.5}>
          {data.recentBusinesses.length ? data.recentBusinesses.map(business => (
            <Box key={business.id} display="flex" gap={1.5} flexWrap="wrap" alignItems={{ xs: 'flex-start', sm: 'center' }} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 3, bgcolor: '#FBFBFE' }}>
              <Box flex={1} minWidth={140}>
                <Typography fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{business.name}</Typography>
                <Typography variant="caption" color="text.secondary">Alta: {formatDate(business.createdAt)}</Typography>
              </Box>
              <Chip size="small" variant="outlined" color={business.isActive ? 'success' : 'default'} label={business.isActive ? 'Negocio activo' : 'Negocio inactivo'} />
              <Button size="small" onClick={() => onOpenBusiness(business.id)}>Ver negocio</Button>
            </Box>
          )) : <Typography variant="body2" color="text.secondary">Todavía no hay negocios registrados.</Typography>}
        </Stack>
      </CardContent></Card>
    </Box>
  </Stack>
}
