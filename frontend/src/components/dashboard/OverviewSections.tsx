import { ArrowForwardRounded, BuildRounded, CheckCircleOutlineRounded, ChevronRightRounded, Inventory2Rounded, PhoneIphoneRounded } from '@mui/icons-material'
import { Box, Button, Card, CardContent, Chip, List, ListItemButton, Stack, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { DashboardOverview, DashboardOrigin } from '../../services/dashboard'
import { formatMoney } from '../../utils/format'
import { UiState } from '../common/UiState'
import { originLabels } from './OverviewCharts'

export function AttentionPanel({ groups }: { groups: DashboardOverview['attention'] }) {
  return <Card id="necesitan-atencion" sx={{ scrollMarginTop: 90 }}><CardContent>
    <Typography variant="h2">Necesitan atención</Typography><Typography variant="body2" color="text.secondary" mt={.5} mb={2}>Pendientes actuales, sin importar cuándo ingresaron.</Typography>
    {!groups.length ? <UiState icon={<CheckCircleOutlineRounded />} title="Sin pendientes de atención" description="No hay casos en las condiciones revisadas." /> : <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
      {groups.map(group => <Box key={group.key} id={`atencion-${group.key}`} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 3, minWidth: 0, scrollMarginTop: 90 }}>
        <Stack direction="row" alignItems="center" gap={1}><Typography variant="subtitle2" fontWeight={750} sx={{ flex: 1 }}>{group.title}</Typography><Chip size="small" color={group.key === 'delayed' ? 'warning' : 'primary'} label={group.count} /></Stack>
        <List disablePadding sx={{ mt: 1 }}>{group.items.map(item => <ListItemButton key={item.id} component={RouterLink} to={item.href} sx={{ px: 0, py: 1, minHeight: 52, borderRadius: 2, gap: 1 }}><Box minWidth={0} flex={1}><Typography variant="body2" fontWeight={650} sx={{ overflowWrap: 'anywhere' }}>{item.title}</Typography><Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{item.detail}</Typography></Box><ArrowForwardRounded sx={{ fontSize: 16, color: 'text.secondary' }} /></ListItemButton>)}</List>
        <Button component={RouterLink} to={group.href} size="small" endIcon={<ArrowForwardRounded />}>Abrir {group.key === 'equipment' ? 'equipos' : group.key === 'warranty' ? 'garantías' : 'reparaciones'}</Button>
        {group.count > group.items.length && <Typography variant="caption" color="text.secondary" display="block">Mostrando {group.items.length} de {group.count} casos.</Typography>}
      </Box>)}
    </Box>}
  </CardContent></Card>
}

function ModuleCard({ title, href, icon, children }: { title: string; href: string; icon: ReactNode; children: ReactNode }) {
  return <Card><CardContent><Stack direction="row" gap={1} alignItems="center" mb={2}><Box color="primary.main" display="flex">{icon}</Box><Typography variant="h2" fontSize={17}>{title}</Typography></Stack><Stack spacing={1}>{children}</Stack><Button component={RouterLink} to={href} endIcon={<ArrowForwardRounded />} sx={{ mt: 2 }}>Abrir módulo</Button></CardContent></Card>
}
function ModuleValue({ label, value }: { label: string; value: string | number }) {
  return <Stack direction="row" justifyContent="space-between" gap={2}><Typography variant="body2" color="text.secondary">{label}</Typography><Typography variant="body2" fontWeight={750} textAlign="right" sx={{ overflowWrap: 'anywhere', minWidth: 0 }}>{value}</Typography></Stack>
}
export function ModuleSummaries({ modules }: { modules: DashboardOverview['modules'] }) {
  return <Box><Typography variant="h2" mb={.5}>Tus módulos</Typography><Typography variant="body2" color="text.secondary" mb={2}>Operaciones del período y disponibilidad actual.</Typography><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: `repeat(${modules.commerce ? 3 : 2}, minmax(0, 1fr))` }, gap: 2 }}>
    <ModuleCard title="Reparaciones" href="/admin/reparaciones" icon={<BuildRounded />}><ModuleValue label="Ingresaron en el período" value={modules.repairs.received} /><ModuleValue label="Cobrado en el período" value={formatMoney(modules.repairs.income)} /><ModuleValue label="Activas ahora" value={modules.repairs.active} /></ModuleCard>
    {modules.commerce && <ModuleCard title="Comercio" href="/admin/comercio" icon={<Inventory2Rounded />}><ModuleValue label="Ventas del período" value={modules.commerce.sales} /><ModuleValue label="Importe vendido" value={formatMoney(modules.commerce.revenue)} /><ModuleValue label="Margen bruto de ventas" value={formatMoney(modules.commerce.grossProfit)} /><Typography variant="caption" color="text.secondary">Antes de egresos comerciales.</Typography></ModuleCard>}
    <ModuleCard title="Venta de equipos" href="/admin/venta-equipos" icon={<PhoneIphoneRounded />}><ModuleValue label="Ventas registradas en el período" value={modules.equipment.sales} /><ModuleValue label="Ganancia de esas ventas" value={formatMoney(modules.equipment.profit)} /><ModuleValue label="Listos para vender ahora" value={modules.equipment.ready} /><ModuleValue label="Equipos sin vender" value={modules.equipment.inProcess} /></ModuleCard>
  </Box></Box>
}

const movementTz = 'America/Argentina/Buenos_Aires'
const movementDate = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: movementTz })
const movementTime = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: movementTz })
const movementDateText = (value: string) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Fecha no disponible' : movementDate.format(date) }
const movementTimeText = (value: string) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : movementTime.format(date) }
const originTone: Record<DashboardOrigin, { bgcolor: string; color: string }> = { REPAIR: { bgcolor: 'rgba(91,63,214,.10)', color: '#5B3FD6' }, COMMERCE: { bgcolor: 'rgba(40,121,194,.12)', color: '#2879C2' }, EQUIPMENT: { bgcolor: 'rgba(31,146,84,.12)', color: '#1F9254' }, GENERAL: { bgcolor: 'rgba(166,107,0,.12)', color: '#A66B00' } }
const activityColumns = { xs: 'auto minmax(0, 1fr) auto', md: 'minmax(0, 2.2fr) minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, .9fr) minmax(0, 1.05fr) 28px' } as const
const activityHeadCell = { fontSize: 10.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: '#9AA0AE', lineHeight: 1.4 } as const

export function RecentActivity({ items }: { items: DashboardOverview['activity'] }) {
  return <Card><CardContent>
    <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" gap={1} mb={2}>
      <Box minWidth={0}><Typography variant="h2">Últimos movimientos</Typography><Typography variant="body2" color="text.secondary" mt={.5}>Los movimientos más recientes del período seleccionado.</Typography></Box>
      <Button component={RouterLink} to="/admin/caja" size="small" endIcon={<ArrowForwardRounded sx={{ fontSize: 16 }} />} sx={{ whiteSpace: 'nowrap', px: 1.25 }}>Ver movimientos</Button>
    </Stack>
    {!items.length ? <UiState title="Sin actividad en este período" description="Acá aparecerán los movimientos reales de Caja." /> : <>
      <Box sx={{ display: { xs: 'none', md: 'grid' }, gridTemplateColumns: activityColumns, gap: 1.5, px: 2, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography variant="caption" sx={activityHeadCell}>Movimiento</Typography>
        <Typography variant="caption" sx={activityHeadCell}>Origen</Typography>
        <Typography variant="caption" sx={activityHeadCell}>Fecha y hora</Typography>
        <Typography variant="caption" sx={activityHeadCell}>Tipo</Typography>
        <Typography variant="caption" sx={{ ...activityHeadCell, textAlign: 'right' }}>Importe</Typography>
        <Typography variant="caption" sx={{ ...activityHeadCell, textAlign: 'right' }}>Acción</Typography>
      </Box>
      <List disablePadding sx={{ display: 'grid', gap: { xs: 1.5, md: 0 }, py: 0 }}>{items.map(item => {
        const income = item.type === 'INCOME'
        return <ListItemButton key={item.id} component={RouterLink} to={item.href} sx={{ display: 'grid', gridTemplateColumns: activityColumns, gap: { xs: 1, md: 1.5 }, alignItems: 'center', px: { xs: 1.5, md: 2 }, py: { xs: 1.25, md: 1.5 }, border: { xs: '1px solid', md: 0 }, borderBottom: '1px solid', borderColor: 'divider', borderRadius: { xs: 2, md: 0 }, minWidth: 0, transition: 'background-color .15s ease', '&:last-child': { borderBottomWidth: { md: 0 } }, '&:hover svg': { color: 'primary.main' } }}>
          <Box sx={{ gridArea: { xs: '1 / 1 / 2 / 3', md: '1 / 1 / 2 / 2' }, minWidth: 0 }}><Typography variant="body2" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{item.description}</Typography></Box>
          <Box sx={{ gridArea: { xs: '2 / 1 / 3 / 2', md: '1 / 2 / 2 / 3' }, minWidth: 0, display: 'flex', alignItems: 'center' }}><Chip size="small" label={originLabels[item.origin]} sx={{ height: 22, fontSize: 11, fontWeight: 700, bgcolor: originTone[item.origin].bgcolor, color: originTone[item.origin].color, '& .MuiChip-label': { px: .9 } }} /></Box>
          <Box sx={{ gridArea: { xs: '2 / 3 / 3 / 4', md: '1 / 3 / 2 / 4' }, minWidth: 0, display: 'flex', flexDirection: { xs: 'row', md: 'column' }, gap: { xs: .5, md: 0 }, alignItems: 'baseline', justifyContent: { xs: 'flex-end', md: 'flex-start' } }}>
            <Typography variant="caption" fontWeight={600}>{movementDateText(item.createdAt)}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ '&::before': { content: { xs: '"· "', md: '""' }, color: 'text.disabled', mr: { xs: .5, md: 0 } } }}>{movementTimeText(item.createdAt)}</Typography>
          </Box>
          <Box sx={{ gridArea: { xs: '2 / 2 / 3 / 3', md: '1 / 4 / 2 / 5' }, minWidth: 0, display: 'flex', alignItems: 'center' }}><Chip size="small" color={income ? 'success' : 'error'} label={income ? 'Ingreso' : 'Egreso'} sx={{ height: 22, fontSize: 11, fontWeight: 700, '& .MuiChip-label': { px: .9 } }} /></Box>
          <Box sx={{ gridArea: { xs: '1 / 3 / 2 / 4', md: '1 / 5 / 2 / 6' }, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}><Typography variant="body2" fontWeight={800} color={income ? 'success.main' : 'error.main'} sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{income ? '+' : '−'}{formatMoney(item.amount)}</Typography></Box>
          <Box sx={{ gridArea: { md: '1 / 6 / 2 / 7' }, display: { xs: 'none', md: 'flex' }, alignItems: 'center', justifyContent: 'flex-end' }}><ChevronRightRounded sx={{ fontSize: 18, color: 'text.secondary' }} /></Box>
        </ListItemButton>
      })}</List>
    </>}
  </CardContent></Card>
}
