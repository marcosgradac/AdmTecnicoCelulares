import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AdminPanelSettingsRounded, BusinessRounded, DashboardRounded, LogoutRounded, MenuRounded, PaymentsRounded, SettingsRounded, StorefrontRounded, WorkspacePremiumRounded } from '@mui/icons-material'
import { Box, Button, Divider, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Stack, Typography, useMediaQuery, useTheme } from '@mui/material'
import { AdminVisualScope } from '../../components/admin/AdminVisualScope'
import { useAuth } from '../../auth/AuthContext'
import { BusinessesSection } from './sections/BusinessesSection'
import { DashboardSection } from './sections/DashboardSection'
import { PaymentsSection } from './sections/PaymentsSection'
import { SettingsSection } from './sections/SettingsSection'
import { SubscriptionsSection } from './sections/SubscriptionsSection'
import { BusinessDetailDialog } from './BusinessDetailDialog'
import './platform-admin.scss'

type SectionId = 'dashboard' | 'businesses' | 'subscriptions' | 'payments' | 'settings'

const sections: Array<{ id: SectionId; label: string; description: string; icon: typeof DashboardRounded }> = [
  { id: 'dashboard', label: 'Resumen', description: 'Cómo está la plataforma hoy: negocios, suscripciones, pagos pendientes y cuentas que necesitan atención.', icon: DashboardRounded },
  { id: 'businesses', label: 'Negocios', description: 'Todos los talleres de TecnoDesk con su plan, su vigencia y las acciones de administración de la cuenta.', icon: BusinessRounded },
  { id: 'subscriptions', label: 'Suscripciones', description: 'Estado de cada suscripción, uso del plan y acciones de cambio de plan, cortesía, suspensión y reactivación.', icon: WorkspacePremiumRounded },
  { id: 'payments', label: 'Pagos', description: 'Transferencias informadas por los negocios, listas para aprobar o rechazar.', icon: PaymentsRounded },
  { id: 'settings', label: 'Configuración', description: 'Parámetros de servicio y datos de cobro que aplican a toda la plataforma.', icon: SettingsRounded },
]

export function PlatformAdminPage() {
  const navigate = useNavigate()
  const theme = useTheme()
  const mobile = useMediaQuery(theme.breakpoints.down('md'))
  const { user, logout } = useAuth()
  const [section, setSection] = useState<SectionId>('dashboard')
  const [menuOpen, setMenuOpen] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)
  const [quickBusinessId, setQuickBusinessId] = useState<string | null>(null)
  const current = sections.find(item => item.id === section) ?? sections[0]
  const go = (id: SectionId) => { setSection(id); setMenuOpen(false) }
  const onDataChanged = () => setRefreshToken(value => value + 1)

  const nav = <Box className="platform-nav">
    <Box className="platform-nav__brand">
      <AdminPanelSettingsRounded />
      <Box minWidth={0}>
        <Typography fontWeight={800} fontSize={17} lineHeight={1.2}>TecnoDesk</Typography>
        <Typography variant="caption" className="platform-nav__brand-caption">Control de plataforma</Typography>
      </Box>
    </Box>
    <Typography variant="overline" className="platform-nav__label">Super admin</Typography>
    <List disablePadding className="platform-nav__list">
      {sections.map(({ id, label, icon: Icon }) => (
        <ListItemButton key={id} selected={section === id} onClick={() => go(id)}>
          <ListItemIcon><Icon /></ListItemIcon>
          <ListItemText primary={label} />
        </ListItemButton>
      ))}
    </List>
    <Box className="platform-nav__foot">
      <Divider sx={{ mb: 1.5 }} />
      <Typography variant="caption" color="text.secondary">Administrás toda la plataforma. Cada negocio sigue gestionando su taller desde su propio admin.</Typography>
    </Box>
  </Box>

  return <AdminVisualScope enabled>
    <Box className="platform-shell">
      {mobile
        ? <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} PaperProps={{ sx: { width: 284, borderRight: 0 } }}>{nav}</Drawer>
        : <Box component="aside" className="platform-sidebar">{nav}</Box>}
      <Box component="main" className="platform-main">
        <Box component="header" className="platform-header">
          <Stack direction="row" gap={1.5} alignItems="flex-start" className="platform-header__heading">
            {mobile && <IconButton aria-label="Abrir secciones del panel" onClick={() => setMenuOpen(true)}><MenuRounded /></IconButton>}
            <Box minWidth={0} flex={1}>
              <Typography variant="overline" color="primary.main" className="platform-header__eyebrow">Super admin</Typography>
              <Typography variant="h1" className="platform-header__title">{current.label}</Typography>
              <Typography variant="caption" color="text.secondary" className="platform-header__identity">
                {[user?.email, 'sesión de plataforma', user?.business.name && `negocio asociado: ${user.business.name}`].filter(Boolean).join(' · ') || 'Sesión de plataforma'}
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" gap={1} className="platform-header__actions">
            <Button variant="outlined" startIcon={<StorefrontRounded />} onClick={() => navigate('/admin')}>Ir al admin del negocio</Button>
            <Button color="inherit" startIcon={<LogoutRounded />} onClick={logout}>Cerrar sesión</Button>
          </Stack>
        </Box>
        <Box className="platform-content">
          <Typography color="text.secondary" mb={{ xs: 2, sm: 3 }}>{current.description}</Typography>
          {section === 'dashboard' && <DashboardSection refreshToken={refreshToken} onOpenBusiness={setQuickBusinessId} />}
          {section === 'businesses' && <BusinessesSection refreshToken={refreshToken} onDataChanged={onDataChanged} />}
          {section === 'subscriptions' && <SubscriptionsSection refreshToken={refreshToken} onDataChanged={onDataChanged} />}
          {section === 'payments' && <PaymentsSection refreshToken={refreshToken} onDataChanged={onDataChanged} />}
          {section === 'settings' && <SettingsSection />}
        </Box>
      </Box>
      <BusinessDetailDialog businessId={quickBusinessId} onClose={() => setQuickBusinessId(null)} onChanged={onDataChanged} />
    </Box>
  </AdminVisualScope>
}
