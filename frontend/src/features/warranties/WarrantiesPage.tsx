import { Fragment, useCallback, useEffect, useState } from 'react'
import { Box, Button, Card, CardContent, Chip, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, Grid, MenuItem, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography, useMediaQuery, useTheme, type ChipProps } from '@mui/material'
import { AddRounded, CheckCircleRounded, DeleteOutlineRounded, EditRounded, ExpandMoreRounded, OpenInNewRounded, VerifiedRounded, WarningAmberRounded } from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../../components/common/PageHeader'
import { StatCard } from '../../components/common/StatCard'
import { UiState } from '../../components/common/UiState'
import { ListPagination, RecordCard, RecordField } from '../../components/admin/AdminPatterns'
import { formatDate } from '../../utils/format'
import { WarrantyClaimDrawer } from './WarrantyClaimDrawer'
import { deleteWarranty, getWarranties, updateWarrantyClaim, type WarrantyClaim, type WarrantyClaimStatus, type WarrantyRepair } from './warranties.api'
import { WarrantyEditDrawer } from './WarrantyEditDrawer'
import { RowActionsMenu } from '../../components/common/RowActionsMenu'

const day = 86_400_000
const PER_PAGE = 10
const claimLabels: Record<WarrantyClaimStatus, string> = { OPEN: 'Abierto', IN_REVIEW: 'En revisión', RESOLVED: 'Resuelto', REJECTED: 'Rechazado' }

type WarrantyState = 'pending' | 'active' | 'expiring' | 'expired'
const stateConfig: Record<WarrantyState, { label: string; color: ChipProps['color'] }> = {
  pending: { label: 'Pendiente de entrega', color: 'default' },
  active: { label: 'Activa', color: 'success' },
  expiring: { label: 'Próxima a vencer', color: 'warning' },
  expired: { label: 'Vencida', color: 'error' },
}
const stateOf = (item: WarrantyRepair, now: number): WarrantyState => {
  if (!item.warrantyStartedAt || !item.warrantyExpiresAt) return 'pending'
  const expires = new Date(item.warrantyExpiresAt).getTime()
  if (expires < now) return 'expired'
  return expires - now <= 7 * day ? 'expiring' : 'active'
}
const validityOf = (item: WarrantyRepair, now: number): { primary: string; secondary?: string; tone?: string } => {
  if (!item.warrantyStartedAt || !item.warrantyExpiresAt) return { primary: `Duración configurada: ${item.warrantyDurationDays ?? '—'} días` }
  const expires = new Date(item.warrantyExpiresAt).getTime()
  if (expires < now) return { primary: `Venció el ${formatDate(item.warrantyExpiresAt)}`, tone: 'error.main' }
  const left = Math.max(1, Math.ceil((expires - now) / day))
  return { primary: `Vence el ${formatDate(item.warrantyExpiresAt)}`, secondary: `${left} ${left === 1 ? 'día restante' : 'días restantes'}` }
}
const pendingClaims = (item: WarrantyRepair) => item.warrantyClaims.filter(claim => claim.status === 'OPEN' || claim.status === 'IN_REVIEW').length

function ClaimsSummary({ item, expanded, onToggle }: { item: WarrantyRepair; expanded: boolean; onToggle: () => void }) {
  const total = item.warrantyClaims.length, open = pendingClaims(item)
  if (!total) return <Typography variant="body2" color="text.secondary">Sin reclamos</Typography>
  return <Button size="small" color={open ? 'warning' : 'inherit'} onClick={onToggle} aria-expanded={expanded} endIcon={<ExpandMoreRounded sx={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />} sx={{ px: 1, minHeight: 32, fontWeight: 650, whiteSpace: 'nowrap' }}>
    {total} {total === 1 ? 'reclamo' : 'reclamos'}{open ? ` · ${open} sin resolver` : ''}
  </Button>
}

function ClaimList({ item, onUpdate }: { item: WarrantyRepair; onUpdate: (claim: WarrantyClaim, status: WarrantyClaimStatus) => void }) {
  return <Stack spacing={1.2}>{item.warrantyClaims.map(claim => <Stack key={claim.id} direction={{ xs: 'column', sm: 'row' }} gap={1.5} alignItems={{ sm: 'center' }}>
    <Box flex={1} minWidth={0}><Typography variant="body2" fontWeight={650}>{claim.description}</Typography><Typography variant="caption" color="text.secondary">{formatDate(claim.createdAt)}</Typography></Box>
    <TextField select size="small" value={claim.status} onChange={event => onUpdate(claim, event.target.value as WarrantyClaimStatus)} sx={{ minWidth: 150 }}>{Object.entries(claimLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
  </Stack>)}</Stack>
}

export function WarrantiesPage() {
  const navigate = useNavigate()
  const mobile = useMediaQuery(useTheme().breakpoints.down('md'))
  const [items, setItems] = useState<WarrantyRepair[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [selected, setSelected] = useState<string>(), [editing, setEditing] = useState<WarrantyRepair | null>(null), [removing, setRemoving] = useState<WarrantyRepair | null>(null)
  const [page, setPage] = useState(0), [expanded, setExpanded] = useState<string | null>(null)
  const load = useCallback(async () => { setLoading(true); setError(''); try { setItems(await getWarranties()) } catch { setError('No pudimos cargar las garantías.') } finally { setLoading(false) } }, [])
  useEffect(() => { void load() }, [load])
  const now = Date.now(), active = items.filter(item => item.warrantyExpiresAt && new Date(item.warrantyExpiresAt).getTime() >= now), expiring = active.filter(item => new Date(item.warrantyExpiresAt!).getTime() - now <= 7 * day), openClaims = items.flatMap(item => item.warrantyClaims).filter(claim => ['OPEN', 'IN_REVIEW'].includes(claim.status))
  const pages = Math.max(1, Math.ceil(items.length / PER_PAGE)), current = Math.min(page, pages - 1), pageItems = items.slice(current * PER_PAGE, current * PER_PAGE + PER_PAGE)
  const updateClaim = async (claim: WarrantyClaim, status: WarrantyClaimStatus) => { await updateWarrantyClaim(claim.id, { status }); await load() }
  const toggle = (id: string) => setExpanded(value => value === id ? null : id)
  const actions = (item: WarrantyRepair) => { const state = stateOf(item, now); return <RowActionsMenu label={`Acciones de garantía #${item.number}`} actions={[{ label: 'Ver reparación', icon: <OpenInNewRounded />, onClick: () => navigate(`/admin/reparaciones/${item.id}`) }, { label: 'Editar garantía', icon: <EditRounded />, onClick: () => setEditing(item) }, { label: 'Registrar reclamo', icon: <AddRounded />, disabled: state === 'pending' || state === 'expired', onClick: () => setSelected(item.id) }, { label: 'Eliminar garantía', icon: <DeleteOutlineRounded />, destructive: true, dividerBefore: true, onClick: () => setRemoving(item) }]} /> }
  return <Box><PageHeader eyebrow="POSTVENTA" title="Garantías" description="Controlá vigencias y reclamos sin perder el vínculo con la reparación original." />
    <Grid container spacing={1.5} mb={2.2}><Grid size={{ xs: 6, lg: 3 }}><StatCard label="Garantías activas" value={String(active.length)} icon={<VerifiedRounded />} /></Grid><Grid size={{ xs: 6, lg: 3 }}><StatCard label="Vencen en 7 días" value={String(expiring.length)} icon={<WarningAmberRounded />} tone="warning" /></Grid><Grid size={{ xs: 6, lg: 3 }}><StatCard label="Reclamos abiertos" value={String(openClaims.length)} icon={<AddRounded />} tone="info" /></Grid><Grid size={{ xs: 6, lg: 3 }}><StatCard label="Finalizadas" value={String(items.length - active.length)} icon={<CheckCircleRounded />} tone="success" /></Grid></Grid>
    {loading ? <Card><UiState loading /></Card> : error ? <Card><UiState title="No pudimos cargar las garantías" description={error} action={() => void load()} /></Card> : !items.length ? <Card><UiState icon={<VerifiedRounded sx={{ fontSize: 44, color: 'primary.light' }} />} title="Todavía no hay garantías configuradas" description="Podés definir una garantía al crear una reparación. Empezará automáticamente cuando la marques como Entregada." /></Card> : <Card><CardContent>
      {mobile ? <Stack spacing={1.5}>{pageItems.map(item => { const state = stateOf(item, now), validity = validityOf(item, now); return <RecordCard key={item.id} title={`${item.deviceBrand} ${item.deviceModel}`} subtitle={`Reparación #${item.number} · ${item.client.name}${item.client.phone ? ` · ${item.client.phone}` : ''}`} status={<Chip size="small" color={stateConfig[state].color} label={stateConfig[state].label} />} actions={actions(item)}>
        <RecordField label="Vigencia" color={validity.tone}>{validity.primary}{validity.secondary && <Typography component="span" variant="caption" display="block" color="text.secondary" fontWeight={500}>{validity.secondary}</Typography>}</RecordField>
        <RecordField label="Reclamos">{item.warrantyClaims.length ? `${item.warrantyClaims.length} ${item.warrantyClaims.length === 1 ? 'reclamo' : 'reclamos'}` : 'Sin reclamos'}{pendingClaims(item) > 0 && <Typography component="span" variant="caption" display="block" color="warning.main" fontWeight={500}>{pendingClaims(item)} sin resolver</Typography>}</RecordField>
        {item.warrantyClaims.length > 0 && <Box sx={{ gridColumn: '1 / -1' }}><ClaimsSummary item={item} expanded={expanded === item.id} onToggle={() => toggle(item.id)} /><Collapse in={expanded === item.id} unmountOnExit><Box pt={1.2}><ClaimList item={item} onUpdate={(claim, status) => void updateClaim(claim, status)} /></Box></Collapse></Box>}
      </RecordCard> })}</Stack> : <TableContainer><Table sx={{ minWidth: 820 }}>
        <TableHead><TableRow><TableCell>Reparación</TableCell><TableCell>Cliente</TableCell><TableCell>Equipo</TableCell><TableCell>Estado</TableCell><TableCell>Vigencia</TableCell><TableCell>Reclamos</TableCell><TableCell align="right">Acciones</TableCell></TableRow></TableHead>
        <TableBody>{pageItems.map(item => { const state = stateOf(item, now), validity = validityOf(item, now); return <Fragment key={item.id}>
          <TableRow hover>
            <TableCell><Typography variant="body2" fontWeight={750} sx={{ whiteSpace: 'nowrap' }}>Reparación #{item.number}</Typography>{item.warrantyConditions && <Tooltip title={item.warrantyConditions}><Typography variant="caption" color="text.secondary" sx={{ display: 'block', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.warrantyConditions}</Typography></Tooltip>}</TableCell>
            <TableCell><Typography variant="body2" fontWeight={650}>{item.client.name}</Typography>{item.client.phone && <Typography variant="caption" color="text.secondary" display="block">{item.client.phone}</Typography>}</TableCell>
            <TableCell sx={{ whiteSpace: 'nowrap' }}>{item.deviceBrand} {item.deviceModel}</TableCell>
            <TableCell><Chip size="small" color={stateConfig[state].color} label={stateConfig[state].label} /></TableCell>
            <TableCell sx={{ whiteSpace: 'nowrap' }}><Typography variant="body2" fontWeight={650} color={validity.tone}>{validity.primary}</Typography>{validity.secondary && <Typography variant="caption" color="text.secondary" display="block">{validity.secondary}</Typography>}</TableCell>
            <TableCell><ClaimsSummary item={item} expanded={expanded === item.id} onToggle={() => toggle(item.id)} /></TableCell>
            <TableCell align="right">{actions(item)}</TableCell>
          </TableRow>
          {item.warrantyClaims.length > 0 && <TableRow><TableCell colSpan={7} sx={{ py: 0, bgcolor: '#FAF9FF', borderBottom: expanded === item.id ? undefined : 0 }}><Collapse in={expanded === item.id} unmountOnExit><Box py={1.5}><ClaimList item={item} onUpdate={(claim, status) => void updateClaim(claim, status)} /></Box></Collapse></TableCell></TableRow>}
        </Fragment> })}</TableBody>
      </Table></TableContainer>}
      <ListPagination count={items.length} page={current} rowsPerPage={PER_PAGE} onPageChange={setPage} />
    </CardContent></Card>}
    <WarrantyClaimDrawer open={Boolean(selected)} repairId={selected} onClose={() => setSelected(undefined)} onCreated={() => { setSelected(undefined); void load() }} />
    <WarrantyEditDrawer warranty={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load() }} />
    <Dialog open={Boolean(removing)} onClose={() => setRemoving(null)}><DialogTitle>Eliminar garantía</DialogTitle><DialogContent><Typography>Esta acción eliminará la garantía asociada a la reparación, pero la reparación y sus datos se conservarán.</Typography></DialogContent><DialogActions><Button onClick={() => setRemoving(null)}>Cancelar</Button><Button color="error" variant="contained" onClick={() => { if (removing) void deleteWarranty(removing.id).then(() => { setRemoving(null); void load() }) }}>Eliminar garantía</Button></DialogActions></Dialog>
  </Box>
}
