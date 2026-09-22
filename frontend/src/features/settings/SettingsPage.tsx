import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Alert, Avatar, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material'
import { BusinessRounded, ChevronRightRounded, ContactSupportRounded, DeleteOutlineRounded, GroupsRounded, ImageRounded, InfoOutlineRounded, NotificationsRounded, PaymentsRounded, SchoolRounded, SecurityRounded, SettingsRounded, UploadRounded, WorkspacePremiumRounded } from '@mui/icons-material'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { PageHeader } from '../../components/common/PageHeader'
import { deleteBusinessLogo, getSettings, logoutOtherSessions, updateBusiness, uploadBusinessLogo } from './settings.api'
import type { BusinessSettings } from './settings.types'
import { getTeam } from '../../services/team'
import { getSubscription } from '../billing/billing.api'
import type { Subscription } from '../billing/billing.types'
import { SettingsSection } from './SettingsSection'
import { PasswordChangeFlow } from './PasswordChangeFlow'
import './settings.scss'
import { openGuidedTutorial } from '../../components/onboarding/GuidedTutorial'

const statusLabels: Record<Subscription['status'], string> = { TRIALING: 'Prueba gratis', ACTIVE: 'Activa', GRACE: 'En período de gracia', PAST_DUE: 'Pago pendiente', SUSPENDED: 'Suspendida', CANCELED: 'Cancelada' }
const entries = [
  ['negocio', 'Mi negocio', 'Datos y logo de tu servicio', BusinessRounded],
  ['equipo', 'Equipo', 'Miembros y permisos', GroupsRounded],
  ['suscripcion', 'Suscripción', 'Plan y estado de tu cuenta', WorkspacePremiumRounded],
  ['seguridad', 'Seguridad', 'Contraseña y sesiones', SecurityRounded],
  ['reparaciones', 'Reparaciones', 'Preferencias operativas', SettingsRounded],
  ['caja', 'Caja y pagos', 'Medios de pago registrados', PaymentsRounded],
  ['notificaciones', 'Notificaciones', 'Avisos del sistema', NotificationsRounded],
  ['tutorial', 'Tutorial', 'Guía rápida de TecnoDesk', SchoolRounded],
  ['soporte', 'Soporte', 'Ayuda y canales de contacto', ContactSupportRounded],
] as const
const emptyBusiness: BusinessSettings = { name: '', phone: null, address: null, logoUrl: null }
const sameBusiness = (a: BusinessSettings, b: BusinessSettings) => a.name.trim() === b.name.trim() && (a.phone?.trim() || null) === (b.phone?.trim() || null) && (a.address?.trim() || null) === (b.address?.trim() || null)
function ConfirmDialog({ open, title, text, confirmLabel, onClose, onConfirm }: { open: boolean; title: string; text: string; confirmLabel: string; onClose: () => void; onConfirm: () => void }) {
  return <Dialog open={open} onClose={onClose}><DialogTitle>{title}</DialogTitle><DialogContent><Typography>{text}</Typography></DialogContent><DialogActions><Button onClick={onClose}>Cancelar</Button><Button color="error" variant="contained" onClick={onConfirm}>{confirmLabel}</Button></DialogActions></Dialog>
}
function InfoNote({ children }: { children: string }) {
  return <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ p: 1.75, borderRadius: 2, bgcolor: 'action.hover' }}><InfoOutlineRounded color="primary" fontSize="small" /><Typography variant="body2" color="text.secondary">{children}</Typography></Stack>
}
export function SettingsPage() {
  const { user, logout, refreshUser } = useAuth(), navigate = useNavigate(), location = useLocation()
  const logoInput = useRef<HTMLInputElement>(null)
  const [business, setBusiness] = useState(emptyBusiness), [savedBusiness, setSavedBusiness] = useState(emptyBusiness), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [logoSaving, setLogoSaving] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('')
  const [teamCount, setTeamCount] = useState<number | null>(null), [teamError, setTeamError] = useState(false), [subscription, setSubscription] = useState<Subscription | null>(null), [subscriptionError, setSubscriptionError] = useState(false)
  const [confirm, setConfirm] = useState<'logo' | 'sessions' | null>(null)
  const owner = user?.role === 'OWNER'
  const dirty = !sameBusiness(business, savedBusiness)
  const planName = useMemo(() => ({ INITIAL: 'Inicial', PROFESSIONAL: 'Profesional', COMPLETE: 'Completo' } as const), [])
  useEffect(() => { void getSettings().then(data => { setBusiness(data.business); setSavedBusiness(data.business) }).catch(() => setError('No pudimos cargar la configuración.')).finally(() => setLoading(false)) }, [])
  useEffect(() => {
    if (!owner) return
    void getTeam().then(team => setTeamCount(team.filter(member => member.isActive).length)).catch(() => setTeamError(true))
    void getSubscription().then(setSubscription).catch(() => setSubscriptionError(true))
  }, [owner])
  useEffect(() => {
    if (!loading && location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [loading, location.hash])
  const saveBusiness = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    setNotice(''); setError('')
    const name = business.name.trim(), phone = business.phone?.trim() || null, address = business.address?.trim() || null
    if (name.length < 2) return setError('Ingresá un nombre comercial de al menos 2 caracteres.')
    if (name.length > 100) return setError('El nombre comercial no puede superar 100 caracteres.')
    if (address && address.length > 180) return setError('La dirección no puede superar 180 caracteres.')
    if (phone && (!/^[+\d][\d\s().-]*$/.test(phone) || phone.replace(/\D/g, '').length < 6 || phone.replace(/\D/g, '').length > 15)) return setError('Ingresá un WhatsApp válido, con entre 6 y 15 números.')
    setSaving(true)
    try {
      const updated = await updateBusiness({ name, phone, address })
      setBusiness(updated); setSavedBusiness(updated)
      await refreshUser()
      setNotice('Cambios guardados correctamente.')
    } catch (requestError) {
      const response = (requestError as { response?: { status?: number; data?: { message?: string } } }).response
      setError(response?.status === 429 ? 'Hiciste demasiados intentos. Esperá un momento y volvé a probar.' : response?.data?.message || 'No pudimos guardar la información del negocio.')
    } finally { setSaving(false) }
  }
  const changeLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return setError('Seleccioná un archivo PNG, JPG o WEBP.')
    if (file.size > 2 * 1024 * 1024) return setError('El logo no puede superar los 2 MB.')
    setLogoSaving(true); setNotice(''); setError('')
    try {
      const result = await uploadBusinessLogo(file)
      setBusiness(current => ({ ...current, logoUrl: `${result.logoUrl}?v=${Date.now()}` }))
      await refreshUser()
      setNotice('Logo actualizado correctamente.')
    } catch (requestError) {
      setError((requestError as { response?: { data?: { message?: string } } }).response?.data?.message || 'No pudimos subir el logo.')
    } finally { setLogoSaving(false) }
  }
  const removeLogo = async () => {
    setLogoSaving(true); setNotice(''); setError('')
    try {
      await deleteBusinessLogo()
      setBusiness(current => ({ ...current, logoUrl: null }))
      await refreshUser()
      setConfirm(null)
      setNotice('Logo eliminado correctamente.')
    } catch (requestError) {
      setError((requestError as { response?: { data?: { message?: string } } }).response?.data?.message || 'No pudimos eliminar el logo.')
    } finally { setLogoSaving(false) }
  }
  if (loading) return <Box display="grid" minHeight="45vh" sx={{ placeItems: 'center' }}><CircularProgress /></Box>
  return <Box className="settings-page"><PageHeader eyebrow="PREFERENCIAS" title="Configuración" description="Centro de control de tu negocio en TecnoDesk." />
    {(notice || error) && <Alert severity={error ? 'error' : 'success'} onClose={() => { setNotice(''); setError('') }} sx={{ mb: 2 }}>{error || notice}</Alert>}
    <Box className="settings-layout"><nav className="settings-menu">{entries.map(([id, label, description, Icon]) => <button key={id} onClick={() => id === 'soporte' ? navigate('/admin/configuracion/soporte') : navigate(`/admin/configuracion#${id}`)}><span><Icon /><span><strong>{label}</strong><small>{description}</small></span></span><ChevronRightRounded /></button>)}</nav>
    <Stack spacing={2} className="settings-content">
      <SettingsSection id="negocio" title="Mi negocio" description={owner ? 'Estos datos se usan en seguimientos y comprobantes.' : 'Sólo el propietario puede modificar estos datos.'}>
        <Stack spacing={3}>
          <Box className="business-logo"><Avatar variant="rounded" src={business.logoUrl ?? undefined} alt={`Logo de ${business.name || 'tu negocio'}`}><ImageRounded /></Avatar><Box className="business-logo__content"><Typography variant="h6">Logo del negocio</Typography><Typography variant="body2" color="text.secondary">PNG, JPG o WEBP. Tamaño máximo: 2 MB.</Typography>{owner && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} mt={1.5}><input ref={logoInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={changeLogo} /><Button variant="outlined" startIcon={logoSaving ? <CircularProgress size={16} /> : <UploadRounded />} disabled={logoSaving} onClick={() => logoInput.current?.click()}>{business.logoUrl ? 'Cambiar logo' : 'Subir logo'}</Button>{business.logoUrl && <Button color="error" variant="text" startIcon={<DeleteOutlineRounded />} disabled={logoSaving} onClick={() => setConfirm('logo')}>Eliminar logo</Button>}</Stack>}</Box></Box>
          <Box component="form" onSubmit={saveBusiness}><Stack spacing={2}>
            <TextField label="Nombre comercial" value={business.name} disabled={!owner || saving} inputProps={{ maxLength: 100 }} onChange={e => setBusiness(v => ({ ...v, name: e.target.value }))} required />
            <TextField label="WhatsApp" value={business.phone ?? ''} disabled={!owner || saving} inputProps={{ maxLength: 30 }} onChange={e => setBusiness(v => ({ ...v, phone: e.target.value }))} helperText="Se usa para el contacto rápido con clientes." />
            <TextField label="Dirección" value={business.address ?? ''} disabled={!owner || saving} inputProps={{ maxLength: 180 }} onChange={e => setBusiness(v => ({ ...v, address: e.target.value }))} />
            {owner && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
              <Button type="submit" variant="contained" disabled={saving || !dirty} startIcon={saving ? <CircularProgress color="inherit" size={16} /> : undefined} sx={{ alignSelf: 'flex-start' }}>{saving ? 'Guardando…' : dirty ? 'Guardar cambios' : 'Todo guardado'}</Button>
              {dirty && !saving && <Button variant="text" onClick={() => setBusiness(savedBusiness)}>Descartar cambios</Button>}
            </Stack>}
          </Stack></Box>
        </Stack>
      </SettingsSection>
      <SettingsSection id="equipo" title="Equipo" description="Resumen de tus usuarios. La gestión completa se hace en Empleados.">
        {owner ? <Stack spacing={2}>{teamError ? <Typography color="text.secondary">No pudimos cargar el resumen del equipo.</Typography> : <Chip icon={<GroupsRounded />} label={teamCount === null ? 'Cargando…' : `${teamCount} miembro${teamCount === 1 ? '' : 's'} activo${teamCount === 1 ? '' : 's'}`} color="primary" variant="outlined" sx={{ alignSelf: 'flex-start' }} />}<Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}><Button variant="contained" onClick={() => navigate('/admin/empleados')}>Gestionar equipo y permisos</Button></Stack></Stack> : <Typography color="text.secondary">Esta sección está reservada al propietario.</Typography>}
      </SettingsSection>
      <SettingsSection id="suscripcion" title="Suscripción" description="Resumen de tu plan. Para cambiar de plan o pagar, ingresá a Suscripción.">
        {owner ? (subscriptionError ? <Typography color="text.secondary">No pudimos cargar los datos de suscripción.</Typography> : subscription ? <Stack spacing={2}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap"><Chip label={planName[subscription.effectivePlanCode]} color="primary" /><Chip label={statusLabels[subscription.status]} color={subscription.status === 'ACTIVE' ? 'success' : subscription.status === 'TRIALING' ? 'info' : 'warning'} variant="outlined" /></Stack>
          <Typography variant="body2" color="text.secondary">{subscription.status === 'TRIALING' ? `Te quedan ${subscription.daysRemaining} día${subscription.daysRemaining === 1 ? '' : 's'} de prueba.` : subscription.access.expiresAt ? `Vigencia hasta ${new Date(subscription.access.expiresAt).toLocaleDateString('es-AR')}.` : 'Sin vencimiento registrado.'}</Typography>
          <Button variant="contained" sx={{ alignSelf: 'flex-start' }} onClick={() => navigate('/admin/suscripcion')}>Ver planes / Gestionar suscripción</Button>
        </Stack> : <Typography color="text.secondary">Cargando…</Typography>) : <Typography color="text.secondary">Esta sección está reservada al propietario.</Typography>}
      </SettingsSection>
      <SettingsSection id="seguridad" title="Seguridad" description="Contraseña y sesiones de tu usuario.">
        <Stack spacing={3}>
          <Box><Typography variant="h6" mb={1}>Datos personales</Typography><Button variant="outlined" onClick={() => navigate('/admin/perfil')}>Editar mis datos</Button></Box>
          <PasswordChangeFlow onCompleted={() => { logout(); navigate('/login', { replace: true }) }} />
          <Box><Typography variant="h6" mb={1}>Otras sesiones</Typography><Button color="warning" variant="outlined" onClick={() => setConfirm('sessions')}>Cerrar otras sesiones</Button></Box>
        </Stack>
      </SettingsSection>
      <SettingsSection id="reparaciones" title="Reparaciones" description="Preferencias operativas de reparaciones.">
        <InfoNote>Las garantías, el seguimiento público y el estado de cada reparación se configuran al crear o editar la reparación. Todavía no hay preferencias globales para este módulo.</InfoNote>
      </SettingsSection>
      <SettingsSection id="caja" title="Caja y pagos" description="Medios de pago usados en los movimientos.">
        <InfoNote>TecnoDesk registra pagos en efectivo, transferencia, tarjeta u otro medio al momento de cada movimiento o venta. Todavía no se pueden configurar medios de pago personalizados ni pasarelas automáticas.</InfoNote>
      </SettingsSection>
      <SettingsSection id="notificaciones" title="Notificaciones" description="Avisos que envía TecnoDesk.">
        <InfoNote>Hoy TecnoDesk envía correos para validar cambios de contraseña y verificar pagos de suscripción. Las preferencias de notificación personalizadas estarán disponibles más adelante.</InfoNote>
      </SettingsSection>
      <SettingsSection id="tutorial" title="Tutorial de TecnoDesk" description="Volvé a recorrer las funciones principales del sistema."><Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} gap={1.5}><Button variant="outlined" startIcon={<SchoolRounded />} onClick={openGuidedTutorial}>Ver tutorial</Button>{user?.tutorialSeen && <Typography variant="body2" color="success.main" fontWeight={750}>Completado ✓</Typography>}</Stack></SettingsSection>
    </Stack></Box>
    <ConfirmDialog open={confirm === 'logo'} title="Eliminar logo" text="El logo actual se quitará de tu negocio. Esta acción no se puede deshacer." confirmLabel="Eliminar" onClose={() => setConfirm(null)} onConfirm={() => void removeLogo()} />
    <ConfirmDialog open={confirm === 'sessions'} title="Cerrar otras sesiones" text="Se cerrará tu sesión en todos los demás dispositivos. Tendrás que iniciar sesión nuevamente en ellos." confirmLabel="Cerrar sesiones" onClose={() => setConfirm(null)} onConfirm={() => void logoutOtherSessions().then(() => { logout(); navigate('/login', { replace: true }) })} />
  </Box>
}
