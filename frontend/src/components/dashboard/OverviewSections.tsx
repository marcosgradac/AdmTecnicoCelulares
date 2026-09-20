import { ArrowForwardRounded, BuildRounded, CheckCircleOutlineRounded, Inventory2Rounded, PhoneIphoneRounded } from '@mui/icons-material'
import { Box, Button, Card, CardContent, Chip, List, ListItemButton, Stack, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { DashboardOverview } from '../../services/dashboard'
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

export function RecentActivity({ items }: { items: DashboardOverview['activity'] }) {
  return <Card><CardContent><Typography variant="h2">Actividad reciente</Typography><Typography variant="body2" color="text.secondary" mt={.5} mb={2}>Últimos 6 movimientos registrados en el período.</Typography>
    {!items.length ? <UiState title="Sin actividad en este período" description="Acá aparecerán los movimientos reales de Caja." /> : <List disablePadding>{items.map(item => <ListItemButton component={RouterLink} to={item.href} key={item.id} sx={{ px: { xs: 1, sm: 2 }, py: 1.5, gap: 1, alignItems: 'flex-start', flexDirection: { xs: 'column', sm: 'row' }, borderBottom: '1px solid', borderColor: 'divider', '&:last-child': { borderBottom: 0 }, borderRadius: 2 }}>
      <Box minWidth={0} flex={1}><Typography variant="body2" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{item.description}</Typography><Typography variant="caption" color="text.secondary">{originLabels[item.origin]} · {new Date(item.createdAt).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}</Typography></Box><Typography fontWeight={750} color={item.type === 'INCOME' ? 'success.main' : 'error.main'}>{item.type === 'INCOME' ? '+' : '−'}{formatMoney(item.amount)}</Typography>
    </ListItemButton>)}</List>}
  </CardContent></Card>
}
