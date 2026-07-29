import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, Grid, InputAdornment, Stack, TextField, Typography } from '@mui/material'
import { AddRounded, ArrowForwardRounded, PeopleRounded, PersonAddRounded, SearchRounded, WalletRounded } from '@mui/icons-material'
import { PageHeader } from '../components/common/PageHeader'
import { StatCard } from '../components/common/StatCard'
import { UiState } from '../components/common/UiState'
import { formatMoney } from '../utils/format'
import { createClient, getClients, type ClientRecord } from '../services/operations'

export function ClientsPage() {
  const navigate = useNavigate()
  const [clients, setClients] = useState<ClientRecord[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '' })
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setClients(await getClients()) } catch { setError('No pudimos cargar los clientes.') } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  const filtered = useMemo(() => clients.filter(client => `${client.name} ${client.phone ?? ''}`.toLowerCase().includes(query.toLowerCase())), [clients, query])
  const pending = clients.reduce((sum, client) => sum + client.repairs.reduce((subtotal, repair) => subtotal + Math.max(0, repair.total - repair.paid), 0), 0)
  const save = async () => {
    try { await createClient({ name: form.name, phone: form.phone || undefined }); setOpen(false); setForm({ name: '', phone: '' }); await load() }
    catch { setError('No se pudo crear el cliente. El teléfono puede estar duplicado.') }
  }
  return <Box>
    <PageHeader eyebrow="RELACIONES" title="Clientes" description="Información de contacto e historial de cada cliente." action={<Button variant="contained" startIcon={<AddRounded />} onClick={() => setOpen(true)}>Nuevo cliente</Button>} />
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    <Grid container spacing={1.5} mb={2.2}><Grid size={{ xs: 12, sm: 4 }}><StatCard label="Total de clientes" value={String(clients.length)} icon={<PeopleRounded />} /></Grid><Grid size={{ xs: 12, sm: 4 }}><StatCard label="Con reparaciones" value={String(clients.filter(client => client.repairs.length).length)} icon={<PersonAddRounded />} tone="info" /></Grid><Grid size={{ xs: 12, sm: 4 }}><StatCard label="Saldo pendiente" value={formatMoney(pending)} icon={<WalletRounded />} tone="warning" /></Grid></Grid>
    <Card><CardContent><TextField fullWidth value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar por nombre o teléfono" InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded /></InputAdornment> }} sx={{ mb: 2 }} />
      {loading ? <UiState loading/> : !filtered.length ? <UiState title={clients.length ? 'Sin resultados' : 'Todavía no hay clientes'} /> : <Stack divider={<Box borderTop="1px solid" borderColor="divider"/>}>{filtered.map(client => { const balance = client.repairs.reduce((sum, repair) => sum + Math.max(0, repair.total - repair.paid), 0); return <Stack key={client.id} direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} gap={2} py={1.8}><Box flex={1}><Typography fontWeight={750}>{client.name}</Typography><Typography variant="body2" color="text.secondary">{client.phone || 'Sin teléfono'}</Typography></Box><Box minWidth={110}><Typography variant="caption" color="text.secondary">Reparaciones</Typography><Typography fontWeight={700}>{client.repairs.length}</Typography></Box><Box minWidth={130}><Typography variant="caption" color="text.secondary">Saldo pendiente</Typography><Typography fontWeight={700} color={balance ? 'error.main' : 'success.main'}>{formatMoney(balance)}</Typography></Box><Button endIcon={<ArrowForwardRounded />} onClick={() => navigate(`/clientes/${client.id}`)}>Ver historial</Button></Stack>})}</Stack>}
    </CardContent></Card>
    <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs"><DialogTitle>Nuevo cliente</DialogTitle><DialogContent><Stack spacing={2} mt={1}><TextField label="Nombre" required value={form.name} onChange={event => setForm(value => ({ ...value, name: event.target.value }))}/><TextField label="Teléfono" value={form.phone} onChange={event => setForm(value => ({ ...value, phone: event.target.value }))}/></Stack></DialogContent><DialogActions><Button onClick={() => setOpen(false)}>Cancelar</Button><Button variant="contained" disabled={form.name.trim().length < 2} onClick={() => void save()}>Crear</Button></DialogActions></Dialog>
  </Box>
}
