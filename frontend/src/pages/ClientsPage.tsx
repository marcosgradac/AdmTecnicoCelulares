import { FilterBar, ListPagination, RecordCard, RecordField } from '../components/admin/AdminPatterns'
import { TABLE_BORDER } from '../theme/tokens'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AddRounded, ChatRounded, DeleteOutlineRounded, EditRounded, HistoryRounded, OpenInNewRounded, PhoneAndroidRounded } from '@mui/icons-material'
import { Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography, Stack, useMediaQuery, useTheme } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { NewClientDrawer } from '../components/clients/NewClientDrawer'
import { DeleteClientDialog } from '../components/clients/DeleteClientDialog'
import { DeviceBrandAvatar } from '../components/common/DeviceBrandAvatar'
import { RowActionsMenu } from '../components/common/RowActionsMenu'
import { PageHeader } from '../components/common/PageHeader'
import { TableSkeleton } from '../components/common/TableSkeleton'
import { UiState } from '../components/common/UiState'
import { NewRepairDrawer } from '../components/repairs/NewRepairDrawer'
import { getClientsPage, type ClientListRecord, type ClientRecord } from '../services/operations'
import { formatDate } from '../utils/format'
import { useAuth } from '../auth/AuthContext'
import { canAccess } from '../auth/permissions'

const clientsHeadCell = { fontSize: 10.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: '#9AA0AE', lineHeight: 1.4, py: 1, background: 'transparent' } as const

export function ClientsPage() {
  const mobile = useMediaQuery(useTheme().breakpoints.down('md'))
  const [error, setError] = useState(''), [retry, setRetry] = useState(0)
  const navigate = useNavigate()
  const { user } = useAuth()
  const canCreate = canAccess(user, 'clients.create')
  const [items, setItems] = useState<ClientListRecord[]>([]), [total, setTotal] = useState(0), [page, setPage] = useState(0)
  const [query, setQuery] = useState(''), [search, setSearch] = useState(''), [loading, setLoading] = useState(true)
  const [newOpen, setNewOpen] = useState(false), [editing, setEditing] = useState<ClientRecord>()
  const [created, setCreated] = useState<ClientRecord | null>(null), [repairClient, setRepairClient] = useState<string>()
  const [deleting, setDeleting] = useState<ClientListRecord | null>(null)

  useEffect(() => { const timer = setTimeout(() => { setPage(0); setSearch(query.trim()) }, 350); return () => clearTimeout(timer) }, [query])
  const reload = () => { setLoading(true); setRetry(value => value + 1) }
  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    void getClientsPage({ page: page + 1, pageSize: 10, search }).then(data => {
      if (!active) return
      const lastPage = Math.max(0, Math.ceil(data.total / 10) - 1)
      setTotal(data.total)
      if (page > lastPage) { setItems([]); setPage(lastPage) }
      else setItems(data.items)
    }).catch(() => { if (active) setError('No pudimos cargar los clientes.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [page, search, retry])

  const actions = (client: ClientListRecord) => <RowActionsMenu label={`Acciones de ${client.name}`} actions={[
    { label: 'Ver cliente', icon: <OpenInNewRounded />, onClick: () => navigate(`/admin/clientes/${client.id}`) },
    { label: 'Editar', icon: <EditRounded />, hidden: !canAccess(user, 'clients.update'), onClick: () => setEditing({ ...client, deletedAt: null, repairs: [] }) },
    { label: 'Nueva reparación', icon: <AddRounded />, hidden: !canAccess(user, 'repairs.create'), onClick: () => setRepairClient(client.id) },
    { label: 'Ver reparaciones', icon: <HistoryRounded />, onClick: () => navigate(`/admin/clientes/${client.id}#reparaciones`) },
    { label: 'Enviar WhatsApp', icon: <ChatRounded />, dividerBefore: true, disabled: !client.phone, onClick: () => window.open(`https://wa.me/${client.phone?.replace(/\D/g, '')}`, '_blank') },
    { label: 'Eliminar cliente', icon: <DeleteOutlineRounded />, destructive: true, dividerBefore: true, hidden: !canAccess(user, 'clients.delete'), onClick: () => setDeleting(client) },
  ]} />
  return <Box><PageHeader eyebrow="RELACIONES" title="Clientes" description="Información de contacto e historial de cada cliente." action={canCreate?<Button variant="contained" startIcon={<AddRounded />} onClick={() => setNewOpen(true)}>Nuevo cliente</Button>:undefined} /><Card><CardContent>
    <FilterBar onClear={query ? () => setQuery('') : undefined}><TextField fullWidth value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar por nombre, apellido o teléfono" InputProps={{ startAdornment: <InputAdornment position="start"><PhoneAndroidRounded /></InputAdornment> }} /></FilterBar>
    {error ? <UiState title="No pudimos cargar los clientes" description={error} action={() => setRetry(value => value + 1)} /> : mobile ? loading ? <UiState loading /> : <Stack spacing={1.5}>{items.map(client => <RecordCard key={client.id} title={client.name} subtitle={client.phone || 'Sin teléfono'} actions={actions(client)} onOpen={() => navigate('/admin/clientes/'+client.id)}><RecordField label="Reparaciones" color={client.repairCount ? undefined : 'text.disabled'}>{client.repairCount}</RecordField><RecordField label="Última reparación" color={client.lastRepair ? undefined : 'text.disabled'} leading={client.lastRepair ? <DeviceBrandAvatar brand={client.lastRepair.deviceBrand} size={32} /> : undefined}>{client.lastRepair ? client.lastRepair.deviceBrand+' '+client.lastRepair.deviceModel : 'Sin reparaciones'}</RecordField><RecordField label="Cliente desde">{formatDate(client.createdAt)}</RecordField></RecordCard>)}</Stack> : (<TableContainer><Table sx={{ minWidth: 960, '& .MuiTableCell-root': { px: 1.5, py: 1.25, borderBottom: '1px solid ' + TABLE_BORDER }, '& .MuiTableCell-head': clientsHeadCell }}><TableHead><TableRow><TableCell sx={{ minWidth: 0 }}>Cliente</TableCell><TableCell sx={{ width: 170 }}>Contacto</TableCell><TableCell align="right" sx={{ width: 120 }}>Reparaciones</TableCell><TableCell sx={{ width: 210 }}>Última reparación</TableCell><TableCell sx={{ width: 130 }}>Registro</TableCell><TableCell align="right" sx={{ width: 56, px: 1 }}>Acción</TableCell></TableRow></TableHead>
      {loading ? <TableSkeleton columns={6} /> : <TableBody>{items.map(client => <TableRow key={client.id} onClick={() => navigate(`/admin/clientes/${client.id}`)} sx={{ cursor: 'pointer', transition: 'background-color .15s ease', '&:hover': { backgroundColor: theme => alpha(theme.palette.primary.main, 0.035) }, '& .MuiIconButton-root': { color: 'text.secondary' }, '&:hover .MuiIconButton-root svg': { color: 'primary.main' }, '&:last-child td': { borderBottomWidth: 0 } }}><TableCell sx={{ minWidth: 0 }}><Typography variant="body2" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{client.name}</Typography></TableCell><TableCell>{client.phone ? <Typography variant="body2" fontWeight={500} color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{client.phone}</Typography> : <Typography variant="caption" color="text.disabled">Sin teléfono</Typography>}</TableCell><TableCell align="right"><Typography variant="body2" fontWeight={600} color={client.repairCount ? 'text.primary' : 'text.disabled'} sx={{ fontVariantNumeric: 'tabular-nums' }}>{client.repairCount}</Typography></TableCell><TableCell sx={{ maxWidth: 210, minWidth: 0 }}>{client.lastRepair ? <Stack direction="row" spacing={1} alignItems="center"><DeviceBrandAvatar brand={client.lastRepair.deviceBrand} size={30} /><Typography variant="body2" fontWeight={600} sx={{ overflowWrap: 'anywhere' }}>{`${client.lastRepair.deviceBrand} ${client.lastRepair.deviceModel}`}</Typography></Stack> : <Typography variant="caption" color="text.disabled">Sin reparaciones</Typography>}</TableCell><TableCell><Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatDate(client.createdAt)}</Typography></TableCell><TableCell align="right" onClick={event => event.stopPropagation()}>{actions(client)}</TableCell></TableRow>)}</TableBody>}
    </Table></TableContainer>)}
    {!loading && !error && !items.length && <UiState title={search ? 'No encontramos resultados' : 'No hay clientes todavía'} description={search ? 'Probá cambiando la búsqueda.' : canCreate ? 'Agregá tu primer cliente para comenzar a trabajar con TecnoDesk.' : 'Todavía no hay clientes para mostrar.'} action={search ? () => setQuery('') : canCreate ? () => setNewOpen(true) : undefined} actionLabel={search ? 'Limpiar filtros' : 'Nuevo cliente'} />}
    {!error && <ListPagination count={total} page={page} rowsPerPage={10} onPageChange={setPage} />}
    <DeleteClientDialog client={deleting} onClose={() => setDeleting(null)} onDeleted={() => { setDeleting(null); reload() }} />
  </CardContent></Card><NewClientDrawer open={newOpen} onClose={() => setNewOpen(false)} onCreated={client => { setNewOpen(false); setCreated(client); void reload() }} /><NewClientDrawer open={Boolean(editing)} client={editing} onClose={() => setEditing(undefined)} onCreated={() => { setEditing(undefined); void reload() }} /><Dialog open={Boolean(created)} onClose={() => setCreated(null)} fullWidth maxWidth="xs"><DialogTitle>Cliente creado</DialogTitle><DialogContent><Typography>El cliente fue creado correctamente.</Typography><Typography sx={{ mt: 1.5 }}>¿Querés cargar una reparación para este cliente ahora?</Typography></DialogContent><DialogActions><Button onClick={() => setCreated(null)}>Ahora no</Button><Button variant="contained" onClick={() => { setRepairClient(created?.id); setCreated(null) }}>Crear reparación</Button></DialogActions></Dialog><NewRepairDrawer open={Boolean(repairClient)} initialClientId={repairClient} onClose={() => setRepairClient(undefined)} onCreated={repair => { setRepairClient(undefined); navigate(`/admin/reparaciones/${repair.id}`) }} /></Box>
}
