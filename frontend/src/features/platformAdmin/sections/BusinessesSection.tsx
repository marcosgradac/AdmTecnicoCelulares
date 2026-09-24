import { useState } from 'react'
import { AutorenewRounded, BlockRounded, CalendarMonthRounded, LockOpenRounded, SearchRounded, StorefrontRounded } from '@mui/icons-material'
import { Alert, Box, Button, FormControl, InputAdornment, InputLabel, MenuItem, Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography, useMediaQuery, useTheme } from '@mui/material'
import { FilterBar, ListPagination, RecordCard, RecordField } from '../../../components/admin/AdminPatterns'
import { RowActionsMenu, type RowAction } from '../../../components/common/RowActionsMenu'
import { TableSkeleton } from '../../../components/common/TableSkeleton'
import { formatDate } from '../../billing/billing.utils'
import { getAdminBusinesses, type AdminBusiness, type BusinessSort, type LifecycleFilter } from '../platformAdmin.api'
import { usePlatformResource } from '../platformAdmin.hooks'
import { AccessChip, PlatformEmpty, PlatformError, PlatformLoading, RefreshingBar, remainingLabel } from '../platformAdmin.shared'
import { BusinessDetailDialog } from '../BusinessDetailDialog'
import { useBusinessLifecycleActions, type Target } from '../platformAdmin.dialogs'

const pageSize = 10
const lifecycleOptions: Array<[LifecycleFilter, string]> = [['ACTIVE', 'Activos'], ['EXPIRING', 'Por vencer'], ['GRACE', 'En gracia'], ['BLOCKED', 'Bloqueados'], ['TODAY', 'Vencen hoy'], ['WEEK', 'Vencen esta semana'], ['NO_EXPIRY', 'Sin vencimiento']]
const sortOptions: Array<[BusinessSort, string]> = [['EXPIRY_ASC', 'Vencen primero'], ['REMAINING_DESC', 'Más días restantes'], ['RECENT', 'Más recientes'], ['OLDEST', 'Más antiguos'], ['NAME', 'Nombre']]

const asTarget = (row: AdminBusiness): Target => ({ id: row.id, name: row.name, access: row.access, graceDaysOverride: row.subscription?.graceDaysOverride ?? null })

type LifecycleActions = ReturnType<typeof useBusinessLifecycleActions>

const rowActions = (row: AdminBusiness, onOpen: () => void, actions: LifecycleActions): RowAction[] => {
  const target = asTarget(row)
  return [
    { label: 'Ver negocio', icon: <StorefrontRounded fontSize="small" />, onClick: onOpen },
    { label: 'Renovar 30 días', icon: <AutorenewRounded fontSize="small" />, onClick: () => actions.openRenew(target) },
    { label: 'Cambiar vencimiento', icon: <CalendarMonthRounded fontSize="small" />, onClick: () => actions.openExpiry(target) },
    row.access.status === 'BLOCKED'
      ? { label: 'Desbloquear', icon: <LockOpenRounded fontSize="small" />, onClick: () => actions.openUnblock(target), dividerBefore: true }
      : { label: 'Bloquear', icon: <BlockRounded fontSize="small" />, onClick: () => actions.openBlock(target), destructive: true, dividerBefore: true },
  ]
}

function BusinessTable({ rows, loading, onOpen, actions }: { rows: AdminBusiness[]; loading: boolean; onOpen: (id: string) => void; actions: LifecycleActions }) {
  return <TableContainer>
    <Table size="small" sx={{ minWidth: 820 }}>
      <TableHead><TableRow>
        <TableCell>Negocio</TableCell><TableCell>Propietario</TableCell><TableCell>Plan</TableCell><TableCell>Estado</TableCell><TableCell>Vencimiento</TableCell><TableCell>Tiempo restante</TableCell><TableCell align="right">Acciones</TableCell>
      </TableRow></TableHead>
      <TableBody>
        {loading ? <TableSkeleton columns={7} /> : rows.map(row => {
          const owner = row.users[0]
          return <TableRow key={row.id} hover sx={{ cursor: 'pointer' }} onClick={() => onOpen(row.id)}>
            <TableCell><Typography fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{row.name}</Typography><Typography variant="caption" color="text.secondary">{row._count.users} usuarios · {row._count.repairs} reparaciones · {row._count.clients} clientes</Typography></TableCell>
            <TableCell>{owner?.name ?? 'Sin propietario'}<Typography variant="caption" color="text.secondary" display="block" sx={{ overflowWrap: 'anywhere' }}>{owner?.email}</Typography></TableCell>
            <TableCell>{row.subscription?.plan.name ?? 'Sin plan'}</TableCell>
            <TableCell><AccessChip access={row.access} /></TableCell>
            <TableCell>{formatDate(row.access.expiresAt)}</TableCell>
            <TableCell>{remainingLabel(row.access)}</TableCell>
            <TableCell align="right" onClick={event => event.stopPropagation()}><RowActionsMenu label={`Acciones de ${row.name}`} actions={rowActions(row, () => onOpen(row.id), actions)} /></TableCell>
          </TableRow>
        })}
      </TableBody>
    </Table>
  </TableContainer>
}

function BusinessCard({ row, onOpen, actions }: { row: AdminBusiness; onOpen: () => void; actions: LifecycleActions }) {
  return <RecordCard title={row.name} subtitle={row.users[0]?.email ?? 'Sin propietario'} status={<AccessChip access={row.access} />} onOpen={onOpen} actions={<RowActionsMenu label={`Acciones de ${row.name}`} actions={rowActions(row, onOpen, actions)} />}>
    <RecordField label="Plan">{row.subscription?.plan.name ?? 'Sin plan'}</RecordField>
    <RecordField label="Vencimiento">{formatDate(row.access.expiresAt)}</RecordField>
    <RecordField label="Tiempo restante">{remainingLabel(row.access)}</RecordField>
    <RecordField label="Uso">{row._count.users} usuarios · {row._count.repairs} reparaciones</RecordField>
  </RecordCard>
}

export function BusinessesSection({ refreshToken, onDataChanged }: { refreshToken: number; onDataChanged: () => void }) {
  const theme = useTheme()
  const mobile = useMediaQuery(theme.breakpoints.down('md'))
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [lifecycle, setLifecycle] = useState<'' | LifecycleFilter>('')
  const [sort, setSort] = useState<BusinessSort>('EXPIRY_ASC')
  const [page, setPage] = useState(1)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const list = usePlatformResource(
    () => getAdminBusinesses({ page, pageSize, search: query || undefined, lifecycle: lifecycle || undefined, sort }),
    `businesses:${page}:${query}:${lifecycle}:${sort}:${refreshToken}`,
  )
  const actions = useBusinessLifecycleActions(message => { setNotice(message); onDataChanged() })
  const data = list.data
  const rows = data?.items ?? []
  const hasFilters = Boolean(query || lifecycle || sort !== 'EXPIRY_ASC')
  const clearFilters = () => { setSearch(''); setQuery(''); setLifecycle(''); setSort('EXPIRY_ASC'); setPage(1) }
  return <Stack spacing={2.5}>
    {notice && <Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert>}
    <Box component="form" onSubmit={event => { event.preventDefault(); setPage(1); setQuery(search.trim()) }}>
      <FilterBar onClear={hasFilters ? clearFilters : undefined}>
        <TextField size="small" label="Buscar negocio" placeholder="Negocio, propietario o email" value={search} onChange={event => setSearch(event.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded /></InputAdornment> }} />
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel id="businesses-lifecycle">Vigencia</InputLabel>
          <Select labelId="businesses-lifecycle" label="Vigencia" value={lifecycle} onChange={event => { setLifecycle(event.target.value as '' | LifecycleFilter); setPage(1) }}>
            <MenuItem value="">Todas</MenuItem>
            {lifecycleOptions.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 190 }}>
          <InputLabel id="businesses-sort">Orden</InputLabel>
          <Select labelId="businesses-sort" label="Orden" value={sort} onChange={event => { setSort(event.target.value as BusinessSort); setPage(1) }}>
            {sortOptions.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
          </Select>
        </FormControl>
        <Button type="submit" variant="contained" startIcon={<SearchRounded />}>Buscar</Button>
      </FilterBar>
    </Box>
    {list.loading && !data ? <PlatformLoading label="Cargando negocios…" />
      : list.error ? <PlatformError message={list.error} onRetry={list.reload} />
        : <Stack spacing={2}>
          {list.loading && <RefreshingBar />}
          {data && data.total > 0 && <Typography variant="body2" color="text.secondary">{data.total} {data.total === 1 ? 'negocio' : 'negocios'} encontrados</Typography>}
          {rows.length === 0
            ? <PlatformEmpty title={hasFilters ? 'Sin resultados con estos filtros' : 'Todavía no hay negocios'} description={hasFilters ? 'Probá con otro estado de vigencia o limpiá los filtros para ver todos los negocios.' : 'Cuando se registre el primer negocio, vas a verlo acá con su plan y su vigencia.'} />
            : mobile
              ? <Stack spacing={1.5}>{rows.map(row => <BusinessCard key={row.id} row={row} onOpen={() => setDetailId(row.id)} actions={actions} />)}</Stack>
              : <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, bgcolor: 'background.paper', overflow: 'hidden' }}><BusinessTable rows={rows} loading={list.loading} onOpen={setDetailId} actions={actions} /></Box>}
        </Stack>}
    {data && <ListPagination count={data.total} page={data.page - 1} rowsPerPage={pageSize} onPageChange={next => setPage(next + 1)} />}
    <BusinessDetailDialog businessId={detailId} onClose={() => setDetailId(null)} onChanged={onDataChanged} />
    {actions.element}
  </Stack>
}


