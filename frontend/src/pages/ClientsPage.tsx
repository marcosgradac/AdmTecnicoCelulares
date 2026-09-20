import { FilterBar, RecordCard, RecordField } from '../components/admin/AdminPatterns'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AddRounded, ChatRounded, EditRounded, HistoryRounded, OpenInNewRounded, PhoneAndroidRounded } from '@mui/icons-material'
import { Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment, Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, TextField, Typography, Stack, Chip, useMediaQuery, useTheme } from '@mui/material'
import { NewClientDrawer } from '../components/clients/NewClientDrawer'
import { RowActionsMenu } from '../components/common/RowActionsMenu'
import { PageHeader } from '../components/common/PageHeader'
import { TableSkeleton } from '../components/common/TableSkeleton'
import { UiState } from '../components/common/UiState'
import { NewRepairDrawer } from '../components/repairs/NewRepairDrawer'
import { getClientsPage, type ClientListRecord, type ClientRecord } from '../services/operations'
import { formatDate } from '../utils/format'
import { useAuth } from '../auth/AuthContext'
import { canAccess } from '../auth/permissions'

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

  useEffect(() => { const timer = setTimeout(() => { setPage(0); setSearch(query.trim()) }, 350); return () => clearTimeout(timer) }, [query])
  const reload = () => getClientsPage({ page: page + 1, pageSize: 10, search }).then(data => { setItems(data.items); setTotal(data.total) })
  useEffect(() => { let active = true; setLoading(true); setError(''); void getClientsPage({ page: page + 1, pageSize: 10, search }).then(data => { if (active) { setItems(data.items); setTotal(data.total) } }).catch(() => { if (active) setError('No pudimos cargar los clientes.') }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [page, search, retry])

  const actions = (client: ClientListRecord) => <RowActionsMenu label={`Acciones de ${client.name}`} actions={[{ label: 'Ver cliente', icon: <OpenInNewRounded />, onClick: () => navigate(`/admin/clientes/${client.id}`) }, { label: 'Editar', icon: <EditRounded />, onClick: () => setEditing({ ...client, repairs: [] }) }, { label: 'Nueva reparación', icon: <AddRounded />, onClick: () => setRepairClient(client.id) }, { label: 'Ver reparaciones', icon: <HistoryRounded />, onClick: () => navigate(`/admin/clientes/${client.id}#reparaciones`) }, { label: 'Enviar WhatsApp', icon: <ChatRounded />, dividerBefore: true, disabled: !client.phone, onClick: () => window.open(`https://wa.me/${client.phone?.replace(/\D/g, '')}`, '_blank') }]} />
  return <Box><PageHeader eyebrow="RELACIONES" title="Clientes" description="Información de contacto e historial de cada cliente." action={canCreate?<Button variant="contained" startIcon={<AddRounded />} onClick={() => setNewOpen(true)}>Nuevo cliente</Button>:undefined} /><Card><CardContent>
    <FilterBar onClear={query ? () => setQuery('') : undefined}><TextField fullWidth value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar por nombre, apellido o teléfono" InputProps={{ startAdornment: <InputAdornment position="start"><PhoneAndroidRounded /></InputAdornment> }} /></FilterBar>
    {error ? <UiState title="No pudimos cargar los clientes" description={error} action={() => setRetry(value => value + 1)} /> : mobile ? loading ? <UiState loading /> : <Stack spacing={1.5}>{items.map(client => <RecordCard key={client.id} title={client.name} subtitle={client.phone || 'Sin teléfono'} status={<Chip size="small" label={client.repairCount+' reparaciones'} />} actions={actions(client)} onOpen={() => navigate('/admin/clientes/'+client.id)}><RecordField label="Última reparación">{client.lastRepair ? client.lastRepair.deviceBrand+' '+client.lastRepair.deviceModel : 'Sin reparaciones'}</RecordField><RecordField label="Cliente desde">{formatDate(client.createdAt)}</RecordField></RecordCard>)}</Stack> : (<TableContainer><Table sx={{ minWidth: { xs: 0, sm: 640 } }}><TableHead><TableRow><TableCell>Cliente</TableCell><TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Teléfono</TableCell><TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Reparaciones</TableCell><TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>Última reparación</TableCell><TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Fecha de alta</TableCell><TableCell align="right">Acciones</TableCell></TableRow></TableHead>
      {loading ? <TableSkeleton columns={6} /> : <TableBody>{items.map(client => <TableRow hover key={client.id} onClick={() => navigate(`/admin/clientes/${client.id}`)} sx={{ cursor: 'pointer' }}><TableCell><Typography fontWeight={750}>{client.name}</Typography><Typography variant="caption" color="text.secondary" sx={{ display: { sm: 'none' } }}>{client.phone || 'Sin teléfono'}</Typography></TableCell><TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{client.phone || '—'}</TableCell><TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{client.repairCount}</TableCell><TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>{client.lastRepair ? `${client.lastRepair.deviceBrand} ${client.lastRepair.deviceModel}` : '—'}</TableCell><TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{formatDate(client.createdAt)}</TableCell><TableCell align="right" onClick={event => event.stopPropagation()}>{actions(client)}</TableCell></TableRow>)}</TableBody>}
    </Table></TableContainer>)}
    {!loading && !error && !items.length && <UiState title={search ? 'No encontramos resultados' : 'No hay clientes todavía'} description={search ? 'Probá cambiando la búsqueda.' : canCreate ? 'Agregá tu primer cliente para comenzar a trabajar con TecnoDesk.' : 'Todavía no hay clientes para mostrar.'} action={search ? () => setQuery('') : canCreate ? () => setNewOpen(true) : undefined} actionLabel={search ? 'Limpiar filtros' : 'Nuevo cliente'} />}
    {!error && total > 10 && <TablePagination component="div" count={total} page={page} onPageChange={(_, next) => setPage(next)} rowsPerPage={10} rowsPerPageOptions={[10]} labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`} />}
  </CardContent></Card><NewClientDrawer open={newOpen} onClose={() => setNewOpen(false)} onCreated={client => { setNewOpen(false); setCreated(client); void reload() }} /><NewClientDrawer open={Boolean(editing)} client={editing} onClose={() => setEditing(undefined)} onCreated={() => { setEditing(undefined); void reload() }} /><Dialog open={Boolean(created)} onClose={() => setCreated(null)} fullWidth maxWidth="xs"><DialogTitle>Cliente creado</DialogTitle><DialogContent><Typography>El cliente fue creado correctamente.</Typography><Typography sx={{ mt: 1.5 }}>¿Querés cargar una reparación para este cliente ahora?</Typography></DialogContent><DialogActions><Button onClick={() => setCreated(null)}>Ahora no</Button><Button variant="contained" onClick={() => { setRepairClient(created?.id); setCreated(null) }}>Crear reparación</Button></DialogActions></Dialog><NewRepairDrawer open={Boolean(repairClient)} initialClientId={repairClient} onClose={() => setRepairClient(undefined)} onCreated={repair => { setRepairClient(undefined); navigate(`/admin/reparaciones/${repair.id}`) }} /></Box>
}
