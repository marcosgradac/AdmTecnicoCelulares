import { FilterBar, FormSection } from '../components/admin/AdminPatterns'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import axios from 'axios'
import {
  Alert, Avatar, Box, Button, Card, CardContent, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControl, FormControlLabel, IconButton, InputAdornment, InputLabel, MenuItem, Select,
  Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField,
  Typography, useMediaQuery, useTheme,
} from '@mui/material'
import {
  AddRounded, DeleteOutlineRounded, EditRounded, KeyRounded, SearchRounded,
  VisibilityOffRounded, VisibilityRounded,
} from '@mui/icons-material'
import { PageHeader } from '../components/common/PageHeader'
import { FormDrawer } from '../components/common/FormDrawer'
import { RowActionsMenu } from '../components/common/RowActionsMenu'
import { alpha } from '@mui/material/styles'
import { UiState } from '../components/common/UiState'
import {
  createTeamMember, deleteTeamMember, getTeam, resetTeamMemberPassword, updateTeamMember,
  type CreateTeamMemberInput, type TeamMember, type TeamRole,
} from '../services/team'
import { formatDate } from '../utils/format'

const roleLabel = (role: TeamRole) => role === 'OWNER' ? 'Propietario' : 'Técnico'
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()
const apiMessage = (error: unknown, fallback: string) =>
  axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message ?? fallback : fallback
const emptyCreate: CreateTeamMemberInput & { repeatPassword: string } = {
  firstName: '', lastName: '', email: '', phone: '', password: '', repeatPassword: '', role: 'TECHNICIAN', permissions: ['repairs.view','repairs.create','repairs.update','repairs.changeStatus','repairs.shareTracking','clients.view','clients.create','clients.update','settings.access'],
}
// `reports.view` se retiró temporalmente de esta lista: la pantalla de Reportes ya no existe, así que
// otorgarlo no habilitaba ninguna ruta y podía dejar al técnico en un ciclo de redirecciones.
// El permiso sigue existiendo en el backend y los valores ya guardados no se tocan: el formulario de
// edición parte de `member.permissions`, por lo que un acceso existente se conserva tal cual.
const permissionGroups = [
  { module: 'Reparaciones', options: [['repairs.view','Ver reparaciones'],['repairs.create','Crear reparaciones'],['repairs.update','Editar reparaciones'],['repairs.changeStatus','Cambiar estados'],['repairs.shareTracking','Compartir seguimiento'],['repairs.viewFinancials','Ver importes']] },
  { module: 'Clientes', options: [['clients.view','Ver clientes'],['clients.create','Crear clientes'],['clients.update','Editar clientes']] },
  { module: 'Caja', options: [['cash.view','Ver caja'],['cash.create','Registrar caja']] },
  { module: 'Comercio', options: [['commerce.view','Ver Comercio'],['commerce.sell','Vender en Comercio'],['commerce.manage','Administrar Comercio']] },
  { module: 'Venta de equipos', options: [['equipmentSales.view','Ver Venta de equipos'],['equipmentSales.manage','Administrar equipos para reventa'],['equipmentSales.sell','Vender equipos']] },
  { module: 'Configuración', options: [['settings.access','Acceder a configuración'],['settings.business.update','Editar negocio']] },
] as const
function PermissionFields({ value, onChange, disabled = false }: { value: string[]; onChange: (value: string[]) => void; disabled?: boolean }) {
  const toggle = (permission: string, checked: boolean) => onChange(checked ? [...value, permission] : value.filter(item => item !== permission))
  return <FormSection title="Permisos del técnico" description="Accesos asignados a esta persona.">
    <Box display="grid" gridTemplateColumns={{ xs: 'minmax(0,1fr)', sm: 'repeat(2, minmax(0,1fr))' }} gap={1.5} alignItems="start">
      {permissionGroups.map(group => <Box key={group.module} sx={{ p: 1.5, minWidth: 0, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: '#FAFAFE' }}>
        <Typography variant="subtitle2" fontWeight={800} mb={.5}>{group.module}</Typography>
        <Stack>{group.options.map(([permission, label]) => <FormControlLabel key={permission} sx={{ m: 0, minWidth: 0, '& .MuiFormControlLabel-label': { fontSize: '.85rem', lineHeight: 1.4, overflowWrap: 'anywhere' } }} control={<Checkbox size="small" checked={value.includes(permission)} disabled={disabled} onChange={event => toggle(permission, event.target.checked)} />} label={label} />)}</Stack>
      </Box>)}
    </Box>
  </FormSection>
}
const passwordChecks = (value: string) => [
  { label: '8 caracteres', met: value.length >= 8 },
  { label: '1 mayúscula', met: /[A-Z]/.test(value) },
  { label: '1 minúscula', met: /[a-z]/.test(value) },
  { label: '1 número', met: /\d/.test(value) },
]
const strongPassword = (value: string) => value.length >= 8 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value)
/** Requisitos de la contraseña temporal en formato compacto: cada chip se pinta cuando se cumple. */
function PasswordRules({ value }: { value: string }) {
  return <Stack direction="row" gap={.75} flexWrap="wrap" useFlexGap>{passwordChecks(value).map(check => <Chip key={check.label} size="small" variant="outlined" label={check.label} color={check.met ? 'success' : 'default'} sx={{ fontWeight: 700, ...(check.met ? { bgcolor: 'rgba(40,183,107,.08)' } : { color: 'text.secondary', borderColor: 'divider' }) }} />)}</Stack>
}

export function TeamPage() {
  const theme = useTheme()
  const mobile = useMediaQuery(theme.breakpoints.down('lg'))
  const [users, setUsers] = useState<TeamMember[]>([])
  const [filters, setFilters] = useState<{ search: string; role: '' | TeamRole; isActive: '' | 'true' | 'false' }>({ search: '', role: '', isActive: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<TeamMember | null>(null)
  const [resetting, setResetting] = useState<TeamMember | null>(null)
  const [deleting, setDeleting] = useState<TeamMember | null>(null)

  const load = async () => {
    setLoading(true); setError('')
    try {
      setUsers(await getTeam({
        search: filters.search.trim() || undefined,
        role: filters.role || undefined,
        isActive: filters.isActive === '' ? undefined : filters.isActive === 'true',
      }))
    } catch (loadError) { setError(apiMessage(loadError, 'No pudimos cargar los empleados')) }
    finally { setLoading(false) }
  }
  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 250)
    return () => window.clearTimeout(timeout)
  }, [filters.search, filters.role, filters.isActive])

  const completed = async (message: string) => { setNotice(message); await load() }
  const actions = (member: TeamMember) => <RowActionsMenu label={`Acciones de ${member.fullName}`} actions={[
    { label: 'Editar', icon: <EditRounded fontSize="small" />, onClick: () => setEditing(member) },
    { label: 'Restablecer contraseña', icon: <KeyRounded fontSize="small" />, onClick: () => setResetting(member) },
    { label: 'Eliminar empleado', icon: <DeleteOutlineRounded fontSize="small" />, destructive: true, hidden: member.role !== 'TECHNICIAN', onClick: () => setDeleting(member) },
  ]} />
  const identity = (member: TeamMember) => <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}><Avatar sx={{ bgcolor: member.isActive ? 'primary.main' : 'grey.400' }}>{initials(member.fullName)}</Avatar><Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}><Typography fontWeight={800}>{member.fullName}</Typography><Typography variant="caption" color="text.secondary">{member.email}</Typography></Box></Stack>

  return <Box>
    <PageHeader eyebrow="ADMINISTRACIÓN" title="Empleados" description="Administrá las personas que trabajan en tu negocio." action={<Button variant="contained" startIcon={<AddRounded />} onClick={() => setCreateOpen(true)}>Agregar empleado</Button>} />
    {notice && <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert>}
    <Card sx={{ mb: 2 }}><CardContent><FilterBar onClear={filters.search || filters.role || filters.isActive ? () => setFilters({ search: '', role: '', isActive: '' }) : undefined}>
      <TextField fullWidth placeholder="Buscar por nombre, email o teléfono" value={filters.search} onChange={event => setFilters(value => ({ ...value, search: event.target.value }))} InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded /></InputAdornment> }} />
      <FormControl sx={{ minWidth: 180 }}><InputLabel>Rol</InputLabel><Select label="Rol" value={filters.role} onChange={event => setFilters(value => ({ ...value, role: event.target.value as '' | TeamRole }))}><MenuItem value="">Todos</MenuItem><MenuItem value="OWNER">Propietario</MenuItem><MenuItem value="TECHNICIAN">Técnico</MenuItem></Select></FormControl>
      <FormControl sx={{ minWidth: 180 }}><InputLabel>Estado</InputLabel><Select label="Estado" value={filters.isActive} onChange={event => setFilters(value => ({ ...value, isActive: event.target.value as '' | 'true' | 'false' }))}><MenuItem value="">Todos</MenuItem><MenuItem value="true">Activo</MenuItem><MenuItem value="false">Inactivo</MenuItem></Select></FormControl>
    </FilterBar></CardContent></Card>
    {loading ? <UiState loading /> : error ? <UiState title="No pudimos cargar los empleados" description={error} action={() => void load()} /> : users.length === 0 ? <UiState title="No encontramos empleados" description="Probá cambiar los filtros o agregá una persona." /> : mobile
      ? <Stack spacing={1.5}>{users.map(member => <Card key={member.id}><CardContent><Stack direction="row" justifyContent="space-between">{identity(member)}{actions(member)}</Stack><Stack direction="row" gap={1} mt={2} flexWrap="wrap"><Chip size="small" label={roleLabel(member.role)} color={member.role === 'OWNER' ? 'primary' : 'default'} /><Chip size="small" label={member.isActive ? 'Activo' : 'Inactivo'} color={member.isActive ? 'success' : 'default'} /><Chip size="small" label={member.phone || 'Sin teléfono'} /></Stack><Typography variant="caption" color="text.secondary" display="block" mt={1.5}>{member.role === 'OWNER' ? 'Acceso completo' : member.permissions.length + ' permisos asignados'} · Alta: {formatDate(member.createdAt)}</Typography></CardContent></Card>)}</Stack>
      : <TableContainer component={Card}><Table><TableHead><TableRow><TableCell>Empleado</TableCell><TableCell>Permisos</TableCell><TableCell>Teléfono</TableCell><TableCell>Rol</TableCell><TableCell>Estado</TableCell><TableCell>Fecha de alta</TableCell><TableCell align="right">Acciones</TableCell></TableRow></TableHead><TableBody>{users.map(member => <TableRow key={member.id} hover><TableCell>{identity(member)}</TableCell><TableCell><Typography variant="body2">{member.role === 'OWNER' ? 'Acceso completo' : member.permissions.length + ' permisos asignados'}</Typography></TableCell><TableCell>{member.phone || '—'}</TableCell><TableCell><Chip size="small" label={roleLabel(member.role)} color={member.role === 'OWNER' ? 'primary' : 'default'} /></TableCell><TableCell><Chip size="small" label={member.isActive ? 'Activo' : 'Inactivo'} color={member.isActive ? 'success' : 'default'} /></TableCell><TableCell>{formatDate(member.createdAt)}</TableCell><TableCell align="right">{actions(member)}</TableCell></TableRow>)}</TableBody></Table></TableContainer>}
    <CreateMemberDrawer open={createOpen} onClose={() => setCreateOpen(false)} onCompleted={() => completed('Empleado creado correctamente.')} />
    <EditMemberDrawer member={editing} onClose={() => setEditing(null)} onCompleted={() => completed('Empleado actualizado correctamente.')} onDelete={member => { setEditing(null); setDeleting(member) }} />
    <ResetPasswordDialog member={resetting} onClose={() => setResetting(null)} onCompleted={() => completed('Contraseña restablecida correctamente.')} />
    <DeleteMemberDialog member={deleting} onClose={() => setDeleting(null)} onCompleted={() => completed('Empleado eliminado correctamente.')} />
  </Box>
}

function PasswordField({ label, value, onChange, show, toggle, error, helperText }: { label: string; value: string; onChange: (value: string) => void; show: boolean; toggle: () => void; error?: boolean; helperText?: string }) {
  return <TextField required label={label} type={show ? 'text' : 'password'} value={value} onChange={event => onChange(event.target.value)} error={error} helperText={helperText} autoComplete="new-password" InputProps={{ endAdornment: <InputAdornment position="end"><IconButton onClick={toggle} aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{show ? <VisibilityOffRounded /> : <VisibilityRounded />}</IconButton></InputAdornment> }} />
}

function CreateMemberDrawer({ open, onClose, onCompleted }: { open: boolean; onClose: () => void; onCompleted: () => Promise<void> }) {
  const [form, setForm] = useState(emptyCreate)
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const strong = useMemo(() => strongPassword(form.password), [form.password])
  const close = () => { if (!saving) { setForm(emptyCreate); setError(''); onClose() } }
  const submit = async () => {
    if (saving || !strong || form.password !== form.repeatPassword) return
    setSaving(true); setError('')
    try {
      const { repeatPassword: _repeat, ...input } = form
      await createTeamMember(input)
      close(); await onCompleted()
    } catch (submitError) { setError(apiMessage(submitError, 'No pudimos crear el empleado')) }
    finally { setSaving(false) }
  }
  return <FormDrawer open={open} title="Agregar empleado" saving={saving} submitLabel="Crear empleado" submitDisabled={!form.firstName.trim() || !form.lastName.trim() || !form.email.trim() || !strong || form.password !== form.repeatPassword} onClose={close} onSubmit={() => void submit()}>
    {error && <Alert severity="error">{error}</Alert>}
    <FormSection title="Datos personales" description="Información de contacto de la persona.">
      <Box display="grid" gridTemplateColumns={{ xs: 'minmax(0,1fr)', sm: 'repeat(2, minmax(0,1fr))' }} gap={2}>
        <TextField required label="Nombre" value={form.firstName} onChange={e => setForm(value => ({ ...value, firstName: e.target.value }))} />
        <TextField required label="Apellido" value={form.lastName} onChange={e => setForm(value => ({ ...value, lastName: e.target.value }))} />
        <TextField required label="Email" type="email" value={form.email} onChange={e => setForm(value => ({ ...value, email: e.target.value }))} />
        <TextField label="Teléfono (opcional)" type="tel" value={form.phone} onChange={e => setForm(value => ({ ...value, phone: e.target.value }))} />
      </Box>
    </FormSection>
    <FormSection title="Acceso" description="Define el nivel de acceso de esta persona dentro del negocio.">
      <FormControl fullWidth><InputLabel>Rol</InputLabel><Select label="Rol" value={form.role} onChange={e => setForm(value => ({ ...value, role: e.target.value as TeamRole }))}><MenuItem value="TECHNICIAN">Técnico</MenuItem><MenuItem value="OWNER">Propietario</MenuItem></Select></FormControl>
    </FormSection>
    <FormSection title="Contraseña temporal" description="Se comparte con la persona para su primer ingreso.">
      <PasswordField label="Contraseña temporal" value={form.password} onChange={password => setForm(value => ({ ...value, password }))} show={show} toggle={() => setShow(value => !value)} error={Boolean(form.password) && !strong} helperText={form.password && !strong ? 'Todavía no cumple todos los requisitos.' : ''} />
      <PasswordField label="Repetir contraseña" value={form.repeatPassword} onChange={repeatPassword => setForm(value => ({ ...value, repeatPassword }))} show={show} toggle={() => setShow(value => !value)} error={Boolean(form.repeatPassword) && form.password !== form.repeatPassword} helperText={form.repeatPassword && form.password !== form.repeatPassword ? 'Las contraseñas no coinciden' : ''} />
      <PasswordRules value={form.password} />
    </FormSection>
    {form.role === 'TECHNICIAN' && <PermissionFields value={form.permissions ?? []} onChange={permissions => setForm(value => ({ ...value, permissions }))} />}
  </FormDrawer>
}

function EditMemberDrawer({ member, onClose, onCompleted, onDelete }: { member: TeamMember | null; onClose: () => void; onCompleted: () => Promise<void>; onDelete: (member: TeamMember) => void }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', role: 'TECHNICIAN' as TeamRole, isActive: true, permissions: [] as string[] })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (member) setForm({ firstName: member.firstName ?? '', lastName: member.lastName ?? '', phone: member.phone ?? '', role: member.role, isActive: member.isActive, permissions: member.permissions }) }, [member])
  const close = () => { if (!saving) { setError(''); onClose() } }
  const submit = async () => {
    if (!member || saving) return
    const relevantChange = member.isActive !== form.isActive || (member.role === 'OWNER' && form.role === 'TECHNICIAN')
    if (relevantChange && !window.confirm('¿Confirmás este cambio de rol o estado?')) return
    setSaving(true); setError('')
    try { await updateTeamMember(member.id, form); onClose(); await onCompleted() }
    catch (submitError) { setError(apiMessage(submitError, 'No pudimos actualizar el empleado')) }
    finally { setSaving(false) }
  }
  return <FormDrawer open={Boolean(member)} title="Editar empleado" saving={saving} submitLabel="Guardar cambios" submitDisabled={!form.firstName.trim() || !form.lastName.trim()} onClose={close} onSubmit={() => void submit()}>
    {error && <Alert severity="error">{error}</Alert>}
    <FormSection title="Datos personales" description="Información de contacto de la persona.">
      <Box display="grid" gridTemplateColumns={{ xs: 'minmax(0,1fr)', sm: 'repeat(2, minmax(0,1fr))' }} gap={2}>
        <TextField required label="Nombre" value={form.firstName} onChange={e => setForm(value => ({ ...value, firstName: e.target.value }))} />
        <TextField required label="Apellido" value={form.lastName} onChange={e => setForm(value => ({ ...value, lastName: e.target.value }))} />
        <TextField label="Teléfono" type="tel" sx={{ gridColumn: { sm: 'span 2' } }} value={form.phone} onChange={e => setForm(value => ({ ...value, phone: e.target.value }))} />
      </Box>
    </FormSection>
    <FormSection title="Acceso" description="Define el nivel de acceso de esta persona dentro del negocio.">
      <Box display="grid" gridTemplateColumns={{ xs: 'minmax(0,1fr)', sm: 'repeat(2, minmax(0,1fr))' }} gap={2}>
        <FormControl fullWidth><InputLabel>Rol</InputLabel><Select label="Rol" value={form.role} onChange={e => setForm(value => ({ ...value, role: e.target.value as TeamRole }))}><MenuItem value="TECHNICIAN">Técnico</MenuItem><MenuItem value="OWNER">Propietario</MenuItem></Select></FormControl>
        <FormControl fullWidth><InputLabel>Estado</InputLabel><Select label="Estado" value={form.isActive ? 'active' : 'inactive'} onChange={e => setForm(value => ({ ...value, isActive: e.target.value === 'active' }))}><MenuItem value="active">Activo</MenuItem><MenuItem value="inactive">Inactivo</MenuItem></Select></FormControl>
      </Box>
    </FormSection>
    {form.role === 'TECHNICIAN' && <PermissionFields value={form.permissions} onChange={permissions => setForm(value => ({ ...value, permissions }))} />}
    {member?.role === 'TECHNICIAN' && <Box sx={{ p: 2, minWidth: 0, border: '1px solid', borderColor: theme => alpha(theme.palette.error.main, .32), borderRadius: 2, bgcolor: theme => alpha(theme.palette.error.main, .04) }}>
      <Typography fontWeight={800} color="error.main">Zona de peligro</Typography>
      <Typography variant="body2" color="text.secondary" mb={1.5}>El empleado perderá el acceso, pero su nombre seguirá visible en el historial.</Typography>
      <Button color="error" variant="outlined" startIcon={<DeleteOutlineRounded />} onClick={() => onDelete(member)}>Eliminar empleado</Button>
    </Box>}
  </FormDrawer>
}

function DeleteMemberDialog({ member, onClose, onCompleted }: { member: TeamMember | null; onClose: () => void; onCompleted: () => Promise<void> }) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const close = () => { if (!deleting) { setError(''); onClose() } }
  const confirm = async () => {
    if (!member || deleting) return
    setDeleting(true); setError('')
    try {
      await deleteTeamMember(member.id)
      onClose()
      await onCompleted()
    } catch (deleteError) { setError(apiMessage(deleteError, 'No pudimos eliminar el empleado')) }
    finally { setDeleting(false) }
  }
  return <Dialog open={Boolean(member)} onClose={close} fullWidth maxWidth="xs"><DialogTitle>Eliminar empleado</DialogTitle><DialogContent><Stack spacing={2} mt={1}>{error && <Alert severity="error">{error}</Alert>}<Typography>¿Querés eliminar a <strong>{member?.fullName}</strong>?</Typography><Alert severity="warning">Perderá el acceso inmediatamente y dejará de aparecer en la lista. Su nombre se conservará en reparaciones y registros históricos.</Alert></Stack></DialogContent><DialogActions><Button onClick={close} disabled={deleting}>Cancelar</Button><Button color="error" variant="contained" onClick={() => void confirm()} disabled={deleting} startIcon={deleting ? <CircularProgress color="inherit" size={16} /> : <DeleteOutlineRounded />}>{deleting ? 'Eliminando…' : 'Sí, eliminar'}</Button></DialogActions></Dialog>
}

function ResetPasswordDialog({ member, onClose, onCompleted }: { member: TeamMember | null; onClose: () => void; onCompleted: () => Promise<void> }) {
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const strong = password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password)
  const close = () => { if (!saving) { setPassword(''); setRepeat(''); setError(''); onClose() } }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!member || saving || !strong || password !== repeat || !window.confirm('¿Confirmás el restablecimiento de contraseña?')) return
    setSaving(true); setError('')
    try { await resetTeamMemberPassword(member.id, password); close(); await onCompleted() }
    catch (submitError) { setError(apiMessage(submitError, 'No pudimos restablecer la contraseña')) }
    finally { setSaving(false) }
  }
  return <Dialog open={Boolean(member)} onClose={close} fullWidth maxWidth="xs"><Box component="form" onSubmit={submit}><DialogTitle>Restablecer contraseña</DialogTitle><DialogContent><Stack spacing={2} mt={1}><Typography color="text.secondary">Definí una contraseña temporal para {member?.fullName}. No se enviará por correo.</Typography>{error && <Alert severity="error">{error}</Alert>}<PasswordField label="Nueva contraseña temporal" value={password} onChange={setPassword} show={show} toggle={() => setShow(value => !value)} error={Boolean(password) && !strong} helperText="Mínimo 8 caracteres, mayúscula, minúscula y número" /><PasswordField label="Repetir contraseña" value={repeat} onChange={setRepeat} show={show} toggle={() => setShow(value => !value)} error={Boolean(repeat) && password !== repeat} helperText={repeat && password !== repeat ? 'Las contraseñas no coinciden' : ''} /></Stack></DialogContent><DialogActions><Button onClick={close}>Cancelar</Button><Button type="submit" variant="contained" disabled={saving || !strong || password !== repeat}>{saving ? 'Guardando…' : 'Restablecer'}</Button></DialogActions></Box></Dialog>
}
