import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Alert, Avatar, Box, Button, CircularProgress, Stack, TextField, Typography } from '@mui/material'
import { AccountCircleRounded, BusinessRounded, ChevronRightRounded, ContactSupportRounded, DeleteOutlineRounded, GroupsRounded, ImageRounded, SchoolRounded, UploadRounded } from '@mui/icons-material'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { PageHeader } from '../../components/common/PageHeader'
import { deleteBusinessLogo, getSettings, logoutOtherSessions, updateBusiness, uploadBusinessLogo } from './settings.api'
import type { BusinessSettings } from './settings.types'
import { SettingsSection } from './SettingsSection'
import { PasswordChangeFlow } from './PasswordChangeFlow'
import './settings.scss'
import { openGuidedTutorial } from '../../components/onboarding/GuidedTutorial'

const entries = [
  ['negocio', 'Mi negocio', 'Información de tu servicio técnico', BusinessRounded], ['cuenta', 'Mi cuenta', 'Datos personales y seguridad', AccountCircleRounded], ['empleados', 'Empleados', 'Usuarios y permisos', GroupsRounded], ['tutorial', 'Tutorial', 'Guía rápida de TecnoDesk', SchoolRounded], ['soporte', 'Soporte', 'Ayuda y canales de contacto', ContactSupportRounded],
] as const
const emptyBusiness: BusinessSettings = { name: '', phone: null, address: null, logoUrl: null }
export function SettingsPage() {
  const { user, logout, refreshUser } = useAuth(), navigate = useNavigate(), location = useLocation()
  const logoInput = useRef<HTMLInputElement>(null)
  const [business, setBusiness] = useState(emptyBusiness), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [logoSaving, setLogoSaving] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('')
  const owner = user?.role === 'OWNER'
  useEffect(() => { void getSettings().then(data => setBusiness(data.business)).catch(() => setError('No pudimos cargar la configuración.')).finally(() => setLoading(false)) }, [])
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
      setBusiness(await updateBusiness({ name, phone, address }))
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
      setNotice('Logo eliminado correctamente.')
    } catch (requestError) {
      setError((requestError as { response?: { data?: { message?: string } } }).response?.data?.message || 'No pudimos eliminar el logo.')
    } finally { setLogoSaving(false) }
  }
  if (loading) return <Box display="grid" minHeight="45vh" sx={{ placeItems: 'center' }}><CircularProgress /></Box>
  return <Box className="settings-page"><PageHeader eyebrow="PREFERENCIAS" title="Configuración" description="Personalizá TecnoDesk y administrá tu negocio con seguridad." />
    {(notice || error) && <Alert severity={error ? 'error' : 'success'} onClose={() => { setNotice(''); setError('') }} sx={{ mb: 2 }}>{error || notice}</Alert>}
    <Box className="settings-layout"><nav className="settings-menu">{entries.map(([id, label, description, Icon]) => <button key={id} onClick={() => id === 'soporte' ? navigate('/admin/configuracion/soporte') : navigate(`/admin/configuracion#${id}`)}><span><Icon /><span><strong>{label}</strong><small>{description}</small></span></span><ChevronRightRounded /></button>)}</nav>
    <Stack spacing={2} className="settings-content">
      <SettingsSection id="negocio" title="Mi negocio" description={owner ? 'Información real de tu servicio técnico.' : 'Sólo el propietario puede modificar estos datos.'}><Stack spacing={3}><Box className="business-logo"><Avatar variant="rounded" src={business.logoUrl ?? undefined} alt={`Logo de ${business.name || 'tu negocio'}`}><ImageRounded /></Avatar><Box className="business-logo__content"><Typography variant="h6">Logo del negocio</Typography><Typography variant="body2" color="text.secondary">PNG, JPG o WEBP. Tamaño máximo: 2 MB.</Typography>{owner && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} mt={1.5}><input ref={logoInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={changeLogo} /><Button variant="outlined" startIcon={logoSaving ? <CircularProgress size={16} /> : <UploadRounded />} disabled={logoSaving} onClick={() => logoInput.current?.click()}>{business.logoUrl ? 'Cambiar logo' : 'Subir logo'}</Button>{business.logoUrl && <Button color="error" variant="text" startIcon={<DeleteOutlineRounded />} disabled={logoSaving} onClick={() => void removeLogo()}>Eliminar logo</Button>}</Stack>}</Box></Box><Box component="form" onSubmit={saveBusiness}><Stack spacing={2}><TextField label="Nombre comercial" value={business.name} disabled={!owner || saving} inputProps={{ maxLength: 100 }} onChange={e => setBusiness(v => ({ ...v, name: e.target.value }))} /><TextField label="WhatsApp" value={business.phone ?? ''} disabled={!owner || saving} inputProps={{ maxLength: 30 }} onChange={e => setBusiness(v => ({ ...v, phone: e.target.value }))} /><TextField label="Dirección" value={business.address ?? ''} disabled={!owner || saving} inputProps={{ maxLength: 180 }} onChange={e => setBusiness(v => ({ ...v, address: e.target.value }))} />{owner && <Button type="submit" variant="contained" disabled={saving} startIcon={saving ? <CircularProgress color="inherit" size={16} /> : undefined} sx={{ alignSelf: 'flex-start' }}>{saving ? 'Guardando…' : 'Guardar negocio'}</Button>}</Stack></Box></Stack></SettingsSection>
      <SettingsSection id="cuenta" title="Mi cuenta" description="Datos personales, contraseña y seguridad de tu usuario."><Stack spacing={3}><Box><Typography variant="h6" mb={1}>Datos personales</Typography><Button variant="outlined" onClick={() => navigate('/admin/perfil')}>Editar mis datos</Button></Box><PasswordChangeFlow onCompleted={() => { logout(); navigate('/login', { replace: true }) }} /><Button color="warning" variant="outlined" onClick={() => void logoutOtherSessions().then(() => { logout(); navigate('/login', { replace: true }) })} sx={{ alignSelf: 'flex-start' }}>Cerrar otras sesiones</Button></Stack></SettingsSection>
      <SettingsSection id="empleados" title="Empleados" description="Usuarios, estado, rol y permisos del equipo.">{owner ? <Button variant="outlined" onClick={() => navigate('/admin/empleados')}>Administrar empleados</Button> : <Typography color="text.secondary">Esta sección está reservada al propietario.</Typography>}</SettingsSection>
      <SettingsSection id="tutorial" title="Tutorial de TecnoDesk" description="Volvé a recorrer las funciones principales del sistema."><Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} gap={1.5}><Button variant="outlined" startIcon={<SchoolRounded />} onClick={openGuidedTutorial}>Ver tutorial</Button>{user?.tutorialSeen && <Typography variant="body2" color="success.main" fontWeight={750}>Completado ✓</Typography>}</Stack></SettingsSection>
    </Stack></Box></Box>
}
