import { useState } from 'react'
import { SearchRounded, WorkspacePremiumRounded } from '@mui/icons-material'
import { Alert, Box, Button, FormControl, InputAdornment, InputLabel, MenuItem, Pagination, Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography, useMediaQuery, useTheme } from '@mui/material'
import { FilterBar, RecordCard, RecordField } from '../../../components/admin/AdminPatterns'
import { TableSkeleton } from '../../../components/common/TableSkeleton'
import { formatARS, formatDate } from '../../billing/billing.utils'
import { getAdminSubscriptions, type AdminSubscriptionRow, type SubscriptionStatus } from '../platformAdmin.api'
import { usePlatformResource } from '../platformAdmin.hooks'
import { PaymentStatusChip, PlatformEmpty, PlatformError, PlatformLoading, RefreshingBar, SubscriptionStatusChip, subscriptionPeriodLabel } from '../platformAdmin.shared'
import { SubscriptionDetailDialog } from '../SubscriptionDetailDialog'

const pageSize = 10
const statusOptions: Array<[SubscriptionStatus, string]> = [['TRIALING', 'En prueba'], ['ACTIVE', 'Activas'], ['GRACE', 'En gracia'], ['SUSPENDED', 'Suspendidas']]

const ownerEmail = (row: AdminSubscriptionRow) => row.business.users[0]?.email ?? 'Sin propietario'
const lastPayment = (row: AdminSubscriptionRow) => row.payments[0] ?? null

function SubscriptionTable({ rows, loading, onOpen }: { rows: AdminSubscriptionRow[]; loading: boolean; onOpen: (id: string) => void }) {
  return <TableContainer>
    <Table size="small" sx={{ minWidth: 900 }}>
      <TableHead><TableRow>
        <TableCell>Negocio</TableCell><TableCell>Propietario</TableCell><TableCell>Plan</TableCell><TableCell>Estado</TableCell><TableCell>Vigencia</TableCell><TableCell>Último pago</TableCell><TableCell align="right">Acciones</TableCell>
      </TableRow></TableHead>
      <TableBody>
        {loading ? <TableSkeleton columns={7} /> : rows.map(row => {
          const payment = lastPayment(row)
          return <TableRow key={row.id} hover sx={{ cursor: 'pointer' }} onClick={() => onOpen(row.id)}>
            <TableCell><Typography fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{row.business.name}</Typography><Typography variant="caption" color="text.secondary">{row.business.users.length} propietario(s) · {row.business.isActive ? 'negocio activo' : 'negocio inactivo'}</Typography></TableCell>
            <TableCell sx={{ overflowWrap: 'anywhere' }}>{ownerEmail(row)}</TableCell>
            <TableCell>{row.plan.name}<Typography variant="caption" color="text.secondary" display="block">{formatARS(row.plan.priceARS)}</Typography></TableCell>
            <TableCell><SubscriptionStatusChip status={row.status} /></TableCell>
            <TableCell>{subscriptionPeriodLabel(row)}</TableCell>
            <TableCell>{payment ? <><Typography variant="body2">{formatARS(payment.reportedAmount)}</Typography><Typography variant="caption" color="text.secondary">{formatDate(payment.reviewedAt ?? payment.createdAt)}</Typography></> : <Typography variant="body2" color="text.secondary">Sin pagos aprobados</Typography>}</TableCell>
            <TableCell align="right" onClick={event => { event.stopPropagation(); onOpen(row.id) }}><WorkspacePremiumRounded fontSize="small" sx={{ color: 'primary.main' }} /></TableCell>
          </TableRow>
        })}
      </TableBody>
    </Table>
  </TableContainer>
}

function SubscriptionCard({ row, onOpen }: { row: AdminSubscriptionRow; onOpen: () => void }) {
  const payment = lastPayment(row)
  return <RecordCard title={row.business.name} subtitle={ownerEmail(row)} status={<SubscriptionStatusChip status={row.status} />} onOpen={onOpen}>
    <RecordField label="Plan">{row.plan.name}</RecordField>
    <RecordField label="Vigencia">{subscriptionPeriodLabel(row)}</RecordField>
    <RecordField label="Último pago">{payment ? `${formatARS(payment.reportedAmount)} · ${formatDate(payment.reviewedAt ?? payment.createdAt)}` : 'Sin pagos aprobados'}</RecordField>
    <RecordField label="Estado del pago">{payment ? <PaymentStatusChip status={payment.status} /> : '—'}</RecordField>
  </RecordCard>
}

export function SubscriptionsSection({ refreshToken, onDataChanged }: { refreshToken: number; onDataChanged: () => void }) {
  const theme = useTheme()
  const mobile = useMediaQuery(theme.breakpoints.down('md'))
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'' | SubscriptionStatus>('')
  const [page, setPage] = useState(1)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const list = usePlatformResource(
    () => getAdminSubscriptions({ status: status || undefined, search: query || undefined }),
    `subscriptions:${query}:${status}:${refreshToken}`,
  )
  const rows = list.data ?? []
  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  const current = Math.min(page, pages)
  const visible = rows.slice((current - 1) * pageSize, current * pageSize)
  const hasFilters = Boolean(query || status)
  const clearFilters = () => { setSearch(''); setQuery(''); setStatus(''); setPage(1) }
  return <Stack spacing={2.5}>
    {notice && <Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert>}
    <Box component="form" onSubmit={event => { event.preventDefault(); setPage(1); setQuery(search.trim()) }}>
      <FilterBar onClear={hasFilters ? clearFilters : undefined}>
        <TextField size="small" label="Buscar suscripción" placeholder="Negocio o email del propietario" value={search} onChange={event => setSearch(event.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded /></InputAdornment> }} />
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel id="subscriptions-status">Estado</InputLabel>
          <Select labelId="subscriptions-status" label="Estado" value={status} onChange={event => { setStatus(event.target.value as '' | SubscriptionStatus); setPage(1) }}>
            <MenuItem value="">Todos</MenuItem>
            {statusOptions.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
          </Select>
        </FormControl>
        <Button type="submit" variant="contained" startIcon={<SearchRounded />}>Buscar</Button>
      </FilterBar>
    </Box>
    {list.loading && !list.data ? <PlatformLoading label="Cargando suscripciones…" />
      : list.error ? <PlatformError message={list.error} onRetry={list.reload} />
        : <Stack spacing={2}>
          {list.loading && <RefreshingBar />}
          {rows.length > 0 && <Typography variant="body2" color="text.secondary">{rows.length} {rows.length === 1 ? 'suscripción' : 'suscripciones'}</Typography>}
          {rows.length === 0
            ? <PlatformEmpty title={hasFilters ? 'Sin suscripciones con estos filtros' : 'Todavía no hay suscripciones'} description={hasFilters ? 'Probá con otro estado o limpiá los filtros para ver todas.' : 'Cuando un negocio se registre, su suscripción va a aparecer acá.'} />
            : mobile
              ? <Stack spacing={1.5}>{visible.map(row => <SubscriptionCard key={row.id} row={row} onOpen={() => setDetailId(row.id)} />)}</Stack>
              : <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, bgcolor: 'background.paper', overflow: 'hidden' }}><SubscriptionTable rows={visible} loading={list.loading} onOpen={setDetailId} /></Box>}
        </Stack>}
    {pages > 1 && <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
      <Typography variant="caption" color="text.secondary">Página {current} de {pages}</Typography>
      <Pagination count={pages} page={current} onChange={(_, value) => setPage(value)} shape="rounded" />
    </Stack>}
    <SubscriptionDetailDialog subscriptionId={detailId} onClose={() => setDetailId(null)} onChanged={() => { setNotice('Suscripción actualizada.'); onDataChanged() }} />
  </Stack>
}

