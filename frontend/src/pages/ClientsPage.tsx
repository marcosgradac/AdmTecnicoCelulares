import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AddRounded, ChatRounded, EditRounded, HistoryRounded, OpenInNewRounded, PhoneAndroidRounded } from '@mui/icons-material'
import { Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment, Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, TextField, Typography } from '@mui/material'
import { NewClientDrawer } from '../components/clients/NewClientDrawer'
import { RowActionsMenu } from '../components/common/RowActionsMenu'
import { PageHeader } from '../components/common/PageHeader'
import { TableSkeleton } from '../components/common/TableSkeleton'
import { UiState } from '../components/common/UiState'
import { NewRepairDrawer } from '../components/repairs/NewRepairDrawer'
import { getClientsPage, type ClientRecord } from '../services/operations'
import { formatDate } from '../utils/format'
import { useAuth } from '../auth/AuthContext'
import { canAccess } from '../auth/permissions'

export function ClientsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const canCreate = canAccess(user, 'clients.create'), canUpdate = canAccess(user, 'clients.update'), canCreateRepair = canAccess(user, 'repairs.create')
  const [items, setItems] = useState<ClientRecord[]>([]), [total, setTotal] = useState(0), [page, setPage] = useState(0)
  const [query, setQuery] = useState(''), [search, setSearch] = useState(''), [loading, setLoading] = useState(true)
  const [newOpen, setNewOpen] = useState(false), [editing, setEditing] = useState<ClientRecord>()
  const [created, setCreated] = useState<ClientRecord | null>(null), [repairClient, setRepairClient] = useState<string>()

  useEffect(() => { const timer = setTimeout(() => { setPage(0); setSearch(query.trim()) }, 350); return () => clearTimeout(timer) }, [query])
  const reload = () => getClientsPage({ page: page + 1, pageSize: 10, search }).then(data => { setItems(data.items); setTotal(data.total) })
  useEffect(() => { let active = true; setLoading(true); void getClientsPage({ page: page + 1, pageSize: 10, search }).then(data => { if (active) { setItems(data.items); setTotal(data.total) } }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [page, search])

  return <Box><PageHeader eyebrow="RELACIONES" title="Clientes" description="Información de contacto e historial de cada cliente." action={canCreate?<Button variant="contained" startIcon={<AddRounded />} onClick={() => setNewOpen(true)}>Nuevo cliente</Button>:undefined} /><Card><CardContent>
    <TextField fullWidth value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar por nombre, apellido o teléfono" InputProps={{ startAdornment: <InputAdornment position="start"><PhoneAndroidRounded /></InputAdornment> }} sx={{ mb: 2 }} />
    <TableContainer><Table sx={{ minWidth: { xs: 0, sm: 640 } }}><TableHead><TableRow><TableCell>Cliente</TableCell><TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Teléfono</TableCell><TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Reparaciones</TableCell><TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>Última reparación</TableCell><TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Fecha de alta</TableCell><TableCell align="right">Acciones</TableCell></TableRow></TableHead>
      {loading ? <TableSkeleton columns={6} /> : <TableBody>{items.map(client => { const last = client.repairs[0]; return <TableRow hover key={client.id} onClick={() => navigate(`/admin/clientes/${client.id}`)} sx={{ cursor: 'pointer' }}><TableCell><Typography fontWeight={750}>{client.name}</Typography><Typography variant="caption" color="text.secondary" sx={{ display: { sm: 'none' } }}>{client.phone || 'Sin teléfono'}</Typography></TableCell><TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{client.phone || '—'}</TableCell><TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{client.repairs.length}</TableCell><TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>{last ? `${last.deviceBrand} ${last.deviceModel}` : '—'}</TableCell><TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{formatDate(client.createdAt)}</TableCell><TableCell align="right" onClick={event => event.stopPropagation()}><RowActionsMenu label={`Acciones de ${client.name}`} actions={[{ label: 'Ver cliente', icon: <OpenInNewRounded />, onClick: () => navigate(`/admin/clientes/${client.id}`) }, { label: 'Editar', icon: <EditRounded />, onClick: () => setEditing(client) }, { label: 'Nueva reparación', icon: <AddRounded />, onClick: () => setRepairClient(client.id) }, { label: 'Ver reparaciones', icon: <HistoryRounded />, onClick: () => navigate(`/admin/clientes/${client.id}#reparaciones`) }, { label: 'Enviar WhatsApp', icon: <ChatRounded />, dividerBefore: true, disabled: !client.phone, onClick: () => window.open(`https://wa.me/${client.phone?.replace(/\D/g, '')}`, '_blank') }]} /></TableCell></TableRow> })}</TableBody>}
    </Table></TableContainer>
    {!loading && !items.length && <UiState title={search ? 'No encontramos resultados' : 'No hay clientes todavía'} description={search ? 'Probá cambiando la búsqueda.' : canCreate ? 'Agregá tu primer cliente para comenzar a trabajar con TecnoDesk.' : 'Todavía no hay clientes para mostrar.'} action={search ? () => setQuery('') : canCreate ? () => setNewOpen(true) : undefined} actionLabel={search ? 'Limpiar filtros' : 'Nuevo cliente'} />}
    {total > 10 && <TablePagination component="div" count={total} page={page} onPageChange={(_, next) => setPage(next)} rowsPerPage={10} rowsPerPageOptions={[10]} labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`} />}
  </CardContent></Card><NewClientDrawer open={newOpen} onClose={() => setNewOpen(false)} onCreated={client => { setNewOpen(false); setCreated(client); void reload() }} /><NewClientDrawer open={Boolean(editing)} client={editing} onClose={() => setEditing(undefined)} onCreated={() => { setEditing(undefined); void reload() }} /><Dialog open={Boolean(created)} onClose={() => setCreated(null)}><DialogTitle>Cliente creado correctamente</DialogTitle><DialogContent>¿Querés crear una reparación para este cliente?</DialogContent><DialogActions><Button onClick={() => setCreated(null)}>Ahora no</Button><Button variant="contained" onClick={() => { setRepairClient(created?.id); setCreated(null) }}>Crear reparación</Button></DialogActions></Dialog><NewRepairDrawer open={Boolean(repairClient)} initialClientId={repairClient} onClose={() => setRepairClient(undefined)} onCreated={repair => { setRepairClient(undefined); navigate(`/admin/reparaciones/${repair.id}`) }} /></Box>
}
