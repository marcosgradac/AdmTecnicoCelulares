import { useEffect, useMemo, useState, type FormEvent } from 'react'
import axios from 'axios'
import {
  Alert, Avatar, Box, Button, Card, CardContent, Checkbox, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControl, FormControlLabel, IconButton, InputAdornment, InputLabel, Menu, MenuItem, Select,
  Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField,
  Typography, useMediaQuery, useTheme,
} from '@mui/material'
import {
  AddRounded, EditRounded, KeyRounded, MoreVertRounded, SearchRounded,
  VisibilityOffRounded, VisibilityRounded,
} from '@mui/icons-material'
import { PageHeader } from '../components/common/PageHeader'
import { UiState } from '../components/common/UiState'
import {
  createTeamMember, getTeam, resetTeamMemberPassword, updateTeamMember,
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
const permissionOptions = [
  ['repairs.view','Ver reparaciones'],['repairs.create','Crear reparaciones'],['repairs.update','Editar reparaciones'],['repairs.changeStatus','Cambiar estados'],['repairs.shareTracking','Compartir seguimiento'],['repairs.viewFinancials','Ver importes'],
  ['clients.view','Ver clientes'],['clients.create','Crear clientes'],['clients.update','Editar clientes'],['cash.view','Ver caja'],['cash.create','Registrar caja'],['reports.view','Ver reportes'],['settings.access','Acceder a configuración'],['settings.business.update','Editar negocio'],
] as const
function PermissionFields({ value, onChange, disabled = false }: { value: string[]; onChange: (value: string[]) => void; disabled?: boolean }) { return <Box><Typography fontWeight={800} mb={1}>Permisos del técnico</Typography><Box display="grid" gridTemplateColumns={{ xs: '1fr', sm: '1fr 1fr' }} gap={.5}>{permissionOptions.map(([permission,label]) => <FormControlLabel key={permission} control={<Checkbox checked={value.includes(permission)} disabled={disabled} onChange={e => onChange(e.target.checked ? [...value, permission] : value.filter(item => item !== permission))} />} label={label} />)}</Box></Box> }

export function TeamPage() {
  const theme = useTheme()
  const mobile = useMediaQuery(theme.breakpoints.down('md'))
  const [users, setUsers] = useState<TeamMember[]>([])
  const [filters, setFilters] = useState<{ search: string; role: '' | TeamRole; isActive: '' | 'true' | 'false' }>({ search: '', role: '', isActive: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<TeamMember | null>(null)
  const [resetting, setResetting] = useState<TeamMember | null>(null)
  const [menu, setMenu] = useState<{ anchor: HTMLElement; member: TeamMember } | null>(null)

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
  const actions = (member: TeamMember) => <IconButton aria-label={`Acciones de ${member.fullName}`} onClick={event => setMenu({ anchor: event.currentTarget, member })}><MoreVertRounded /></IconButton>
  const identity = (member: TeamMember) => <Stack direction="row" spacing={1.5} alignItems="center"><Avatar sx={{ bgcolor: member.isActive ? 'primary.main' : 'grey.400' }}>{initials(member.fullName)}</Avatar><Box><Typography fontWeight={800}>{member.fullName}</Typography><Typography variant="caption" color="text.secondary">{member.email}</Typography></Box></Stack>

  return <Box>
    <PageHeader eyebrow="ADMINISTRACIÓN" title="Empleados" description="Administrá las personas que trabajan en tu negocio." action={<Button variant="contained" startIcon={<AddRounded />} onClick={() => setCreateOpen(true)}>Agregar empleado</Button>} />
    {notice && <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert>}
    <Card sx={{ mb: 2 }}><CardContent><Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
      <TextField fullWidth placeholder="Buscar por nombre, email o teléfono" value={filters.search} onChange={event => setFilters(value => ({ ...value, search: event.target.value }))} InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded /></InputAdornment> }} />
      <FormControl sx={{ minWidth: 180 }}><InputLabel>Rol</InputLabel><Select label="Rol" value={filters.role} onChange={event => setFilters(value => ({ ...value, role: event.target.value as '' | TeamRole }))}><MenuItem value="">Todos</MenuItem><MenuItem value="OWNER">Propietario</MenuItem><MenuItem value="TECHNICIAN">Técnico</MenuItem></Select></FormControl>
      <FormControl sx={{ minWidth: 180 }}><InputLabel>Estado</InputLabel><Select label="Estado" value={filters.isActive} onChange={event => setFilters(value => ({ ...value, isActive: event.target.value as '' | 'true' | 'false' }))}><MenuItem value="">Todos</MenuItem><MenuItem value="true">Activo</MenuItem><MenuItem value="false">Inactivo</MenuItem></Select></FormControl>
    </Stack></CardContent></Card>
    {loading ? <UiState loading /> : error ? <UiState title="No pudimos cargar los empleados" description={error} action={() => void load()} /> : users.length === 0 ? <UiState title="No encontramos empleados" description="Probá cambiar los filtros o agregá una persona." /> : mobile
      ? <Stack spacing={1.5}>{users.map(member => <Card key={member.id}><CardContent><Stack direction="row" justifyContent="space-between">{identity(member)}{actions(member)}</Stack><Stack direction="row" gap={1} mt={2} flexWrap="wrap"><Chip size="small" label={roleLabel(member.role)} color={member.role === 'OWNER' ? 'primary' : 'default'} /><Chip size="small" label={member.isActive ? 'Activo' : 'Inactivo'} color={member.isActive ? 'success' : 'default'} /><Chip size="small" label={member.phone || 'Sin teléfono'} /></Stack><Typography variant="caption" color="text.secondary" display="block" mt={1.5}>Alta: {formatDate(member.createdAt)}</Typography></CardContent></Card>)}</Stack>
      : <TableContainer component={Card}><Table><TableHead><TableRow><TableCell>Empleado</TableCell><TableCell>Email</TableCell><TableCell>Teléfono</TableCell><TableCell>Rol</TableCell><TableCell>Estado</TableCell><TableCell>Fecha de alta</TableCell><TableCell align="right">Acciones</TableCell></TableRow></TableHead><TableBody>{users.map(member => <TableRow key={member.id} hover><TableCell>{identity(member)}</TableCell><TableCell>{member.email}</TableCell><TableCell>{member.phone || '—'}</TableCell><TableCell><Chip size="small" label={roleLabel(member.role)} color={member.role === 'OWNER' ? 'primary' : 'default'} /></TableCell><TableCell><Chip size="small" label={member.isActive ? 'Activo' : 'Inactivo'} color={member.isActive ? 'success' : 'default'} /></TableCell><TableCell>{formatDate(member.createdAt)}</TableCell><TableCell align="right">{actions(member)}</TableCell></TableRow>)}</TableBody></Table></TableContainer>}
    <Menu anchorEl={menu?.anchor} open={Boolean(menu)} onClose={() => setMenu(null)}>
      <MenuItem onClick={() => { setEditing(menu?.member ?? null); setMenu(null) }}><EditRounded fontSize="small" sx={{ mr: 1 }} />Editar</MenuItem>
      <MenuItem onClick={() => { setResetting(menu?.member ?? null); setMenu(null) }}><KeyRounded fontSize="small" sx={{ mr: 1 }} />Restablecer contraseña</MenuItem>
    </Menu>
    <CreateMemberDialog open={createOpen} onClose={() => setCreateOpen(false)} onCompleted={() => completed('Empleado creado correctamente.')} />
    <EditMemberDialog member={editing} onClose={() => setEditing(null)} onCompleted={() => completed('Empleado actualizado correctamente.')} />
    <ResetPasswordDialog member={resetting} onClose={() => setResetting(null)} onCompleted={() => completed('Contraseña restablecida correctamente.')} />
  </Box>
}

function PasswordField({ label, value, onChange, show, toggle, error, helperText }: { label: string; value: string; onChange: (value: string) => void; show: boolean; toggle: () => void; error?: boolean; helperText?: string }) {
  return <TextField required label={label} type={show ? 'text' : 'password'} value={value} onChange={event => onChange(event.target.value)} error={error} helperText={helperText} autoComplete="new-password" InputProps={{ endAdornment: <InputAdornment position="end"><IconButton onClick={toggle} aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{show ? <VisibilityOffRounded /> : <VisibilityRounded />}</IconButton></InputAdornment> }} />
}

function CreateMemberDialog({ open, onClose, onCompleted }: { open: boolean; onClose: () => void; onCompleted: () => Promise<void> }) {
  const [form, setForm] = useState(emptyCreate)
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const strong = useMemo(() => form.password.length >= 8 && /[a-z]/.test(form.password) && /[A-Z]/.test(form.password) && /\d/.test(form.password), [form.password])
  const close = () => { if (!saving) { setForm(emptyCreate); setError(''); onClose() } }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving || !strong || form.password !== form.repeatPassword) return
    setSaving(true); setError('')
    try {
      const { repeatPassword: _repeat, ...input } = form
      await createTeamMember(input)
      close(); await onCompleted()
    } catch (submitError) { setError(apiMessage(submitError, 'No pudimos crear el empleado')) }
    finally { setSaving(false) }
  }
  return <Dialog open={open} onClose={close} fullWidth maxWidth="sm"><Box component="form" onSubmit={submit}><DialogTitle>Agregar empleado</DialogTitle><DialogContent><Stack spacing={2} mt={1}>
    {error && <Alert severity="error">{error}</Alert>}<Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><TextField fullWidth required label="Nombre" value={form.firstName} onChange={e => setForm(value => ({ ...value, firstName: e.target.value }))} /><TextField fullWidth required label="Apellido" value={form.lastName} onChange={e => setForm(value => ({ ...value, lastName: e.target.value }))} /></Stack>
    <TextField required label="Email" type="email" value={form.email} onChange={e => setForm(value => ({ ...value, email: e.target.value }))} /><TextField label="Teléfono (opcional)" type="tel" value={form.phone} onChange={e => setForm(value => ({ ...value, phone: e.target.value }))} /><FormControl><InputLabel>Rol</InputLabel><Select label="Rol" value={form.role} onChange={e => setForm(value => ({ ...value, role: e.target.value as TeamRole }))}><MenuItem value="TECHNICIAN">Técnico</MenuItem><MenuItem value="OWNER">Propietario</MenuItem></Select></FormControl>
    <PasswordField label="Contraseña temporal" value={form.password} onChange={password => setForm(value => ({ ...value, password }))} show={show} toggle={() => setShow(value => !value)} error={Boolean(form.password) && !strong} helperText="Mínimo 8 caracteres, mayúscula, minúscula y número" /><PasswordField label="Repetir contraseña" value={form.repeatPassword} onChange={repeatPassword => setForm(value => ({ ...value, repeatPassword }))} show={show} toggle={() => setShow(value => !value)} error={Boolean(form.repeatPassword) && form.password !== form.repeatPassword} helperText={form.repeatPassword && form.password !== form.repeatPassword ? 'Las contraseñas no coinciden' : ''} />{form.role === 'TECHNICIAN' && <PermissionFields value={form.permissions ?? []} onChange={permissions => setForm(value => ({ ...value, permissions }))} />}
  </Stack></DialogContent><DialogActions><Button onClick={close}>Cancelar</Button><Button type="submit" variant="contained" disabled={saving || !form.firstName.trim() || !form.lastName.trim() || !form.email.trim() || !strong || form.password !== form.repeatPassword}>{saving ? 'Creando…' : 'Crear empleado'}</Button></DialogActions></Box></Dialog>
}

function EditMemberDialog({ member, onClose, onCompleted }: { member: TeamMember | null; onClose: () => void; onCompleted: () => Promise<void> }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', role: 'TECHNICIAN' as TeamRole, isActive: true, permissions: [] as string[] })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (member) setForm({ firstName: member.firstName ?? '', lastName: member.lastName ?? '', phone: member.phone ?? '', role: member.role, isActive: member.isActive, permissions: member.permissions }) }, [member])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!member || saving) return
    const relevantChange = member.isActive !== form.isActive || (member.role === 'OWNER' && form.role === 'TECHNICIAN')
    if (relevantChange && !window.confirm('¿Confirmás este cambio de rol o estado?')) return
    setSaving(true); setError('')
    try { await updateTeamMember(member.id, form); onClose(); await onCompleted() }
    catch (submitError) { setError(apiMessage(submitError, 'No pudimos actualizar el empleado')) }
    finally { setSaving(false) }
  }
  return <Dialog open={Boolean(member)} onClose={() => !saving && onClose()} fullWidth maxWidth="sm"><Box component="form" onSubmit={submit}><DialogTitle>Editar empleado</DialogTitle><DialogContent><Stack spacing={2} mt={1}>
    {error && <Alert severity="error">{error}</Alert>}<Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><TextField fullWidth required label="Nombre" value={form.firstName} onChange={e => setForm(value => ({ ...value, firstName: e.target.value }))} /><TextField fullWidth required label="Apellido" value={form.lastName} onChange={e => setForm(value => ({ ...value, lastName: e.target.value }))} /></Stack><TextField label="Teléfono" type="tel" value={form.phone} onChange={e => setForm(value => ({ ...value, phone: e.target.value }))} /><FormControl><InputLabel>Rol</InputLabel><Select label="Rol" value={form.role} onChange={e => setForm(value => ({ ...value, role: e.target.value as TeamRole }))}><MenuItem value="TECHNICIAN">Técnico</MenuItem><MenuItem value="OWNER">Propietario</MenuItem></Select></FormControl><FormControl><InputLabel>Estado</InputLabel><Select label="Estado" value={form.isActive ? 'active' : 'inactive'} onChange={e => setForm(value => ({ ...value, isActive: e.target.value === 'active' }))}><MenuItem value="active">Activo</MenuItem><MenuItem value="inactive">Inactivo</MenuItem></Select></FormControl>{form.role === 'TECHNICIAN' && <PermissionFields value={form.permissions} onChange={permissions => setForm(value => ({ ...value, permissions }))} />}
  </Stack></DialogContent><DialogActions><Button onClick={onClose}>Cancelar</Button><Button type="submit" variant="contained" disabled={saving || !form.firstName.trim() || !form.lastName.trim()}>{saving ? 'Guardando…' : 'Guardar cambios'}</Button></DialogActions></Box></Dialog>
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
