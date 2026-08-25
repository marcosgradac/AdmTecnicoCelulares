import { useEffect, useState, type FormEvent } from 'react'
import { Alert, Box, Button, CircularProgress, Stack, TextField, Typography } from '@mui/material'
import { AccountCircleRounded, BusinessRounded, ChevronRightRounded, GroupsRounded, LockRounded, SchoolRounded } from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { PageHeader } from '../../components/common/PageHeader'
import { getSettings, logoutOtherSessions, updateBusiness } from './settings.api'
import type { BusinessSettings } from './settings.types'
import { SettingsSection } from './SettingsSection'
import { PasswordChangeFlow } from './PasswordChangeFlow'
import './settings.scss'
import { openGuidedTutorial } from '../../components/onboarding/GuidedTutorial'

const entries = [
  ['cuenta', 'Mi cuenta', 'Datos personales y seguridad', AccountCircleRounded], ['negocio', 'Mi negocio', 'Información de tu servicio técnico', BusinessRounded], ['empleados', 'Empleados', 'Usuarios y permisos', GroupsRounded], ['tutorial', 'Tutorial', 'Guía rápida de TecnoDesk', SchoolRounded], ['seguridad', 'Seguridad', 'Acceso y contraseña', LockRounded],
] as const
const emptyBusiness: BusinessSettings = { name: '', phone: null, address: null, logoUrl: null }
export function SettingsPage() {
  const { user, logout } = useAuth(), navigate = useNavigate()
  const [business, setBusiness] = useState(emptyBusiness), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('')
  const owner = user?.role === 'OWNER'
  useEffect(() => { void getSettings().then(data => setBusiness(data.business)).catch(() => setError('No pudimos cargar la configuración.')).finally(() => setLoading(false)) }, [])
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
      setBusiness(await updateBusiness({ name, phone, address }))
      setNotice('Cambios guardados correctamente.')
    } catch (requestError) {
      const response = (requestError as { response?: { status?: number; data?: { message?: string } } }).response
      setError(response?.status === 429 ? 'Hiciste demasiados intentos. Esperá un momento y volvé a probar.' : response?.data?.message || 'No pudimos guardar la información del negocio.')
    } finally { setSaving(false) }
  }
  if (loading) return <Box display="grid" minHeight="45vh" sx={{ placeItems: 'center' }}><CircularProgress /></Box>
  return <Box className="settings-page"><PageHeader eyebrow="PREFERENCIAS" title="Configuración" description="Personalizá TecnoDesk y administrá tu negocio con seguridad." />
    {(notice || error) && <Alert severity={error ? 'error' : 'success'} onClose={() => { setNotice(''); setError('') }} sx={{ mb: 2 }}>{error || notice}</Alert>}
    <Box className="settings-layout"><nav className="settings-menu">{entries.map(([id, label, description, Icon]) => <button key={id} onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })}><span><Icon /><span><strong>{label}</strong><small>{description}</small></span></span><ChevronRightRounded /></button>)}</nav>
    <Stack spacing={2} className="settings-content">
      <SettingsSection id="cuenta" title="Mi cuenta" description="Tus datos personales se administran desde el perfil."><Button variant="outlined" onClick={() => navigate('/admin/perfil')}>Editar mis datos</Button></SettingsSection>
      <SettingsSection id="negocio" title="Mi negocio" description={owner ? 'Información real de tu servicio técnico.' : 'Sólo el propietario puede modificar estos datos.'}><Box component="form" onSubmit={saveBusiness}><Stack spacing={2}><TextField label="Nombre comercial" value={business.name} disabled={!owner || saving} inputProps={{ maxLength: 100 }} onChange={e => setBusiness(v => ({ ...v, name: e.target.value }))} /><TextField label="WhatsApp" value={business.phone ?? ''} disabled={!owner || saving} inputProps={{ maxLength: 30 }} onChange={e => setBusiness(v => ({ ...v, phone: e.target.value }))} /><TextField label="Dirección" value={business.address ?? ''} disabled={!owner || saving} inputProps={{ maxLength: 180 }} onChange={e => setBusiness(v => ({ ...v, address: e.target.value }))} />{owner && <Button type="submit" variant="contained" disabled={saving} startIcon={saving ? <CircularProgress color="inherit" size={16} /> : undefined} sx={{ alignSelf: 'flex-start' }}>{saving ? 'Guardando…' : 'Guardar negocio'}</Button>}</Stack></Box></SettingsSection>
      <SettingsSection id="empleados" title="Empleados" description="Usuarios, estado, rol y permisos del equipo.">{owner ? <Button variant="outlined" onClick={() => navigate('/admin/empleados')}>Administrar empleados</Button> : <Typography color="text.secondary">Esta sección está reservada al propietario.</Typography>}</SettingsSection>
      <SettingsSection id="tutorial" title="Tutorial de TecnoDesk" description="Volvé a recorrer las funciones principales del sistema."><Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} gap={1.5}><Button variant="outlined" startIcon={<SchoolRounded />} onClick={openGuidedTutorial}>Ver tutorial</Button>{user?.tutorialSeen && <Typography variant="body2" color="success.main" fontWeight={750}>Completado ✓</Typography>}</Stack></SettingsSection>
      <SettingsSection id="seguridad" title="Seguridad" description="Protegé el acceso a tu cuenta."><Stack spacing={3}><PasswordChangeFlow onCompleted={() => { logout(); navigate('/login', { replace: true }) }} /><Button color="warning" variant="outlined" onClick={() => void logoutOtherSessions().then(() => { logout(); navigate('/login', { replace: true }) })}>Cerrar otras sesiones</Button></Stack></SettingsSection>
    </Stack></Box></Box>
}
