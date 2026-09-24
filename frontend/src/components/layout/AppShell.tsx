import { AdminVisualScope } from '../admin/AdminVisualScope'
import { useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AppBar, Avatar, Box, Drawer, Fab, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Toolbar, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material'
import { BuildRounded, ChevronRightRounded, DashboardRounded, GroupsRounded, Inventory2Rounded, LockRounded, LogoutRounded, MenuRounded, PeopleRounded, PhoneIphoneRounded, PointOfSaleRounded, SettingsRounded, VerifiedRounded, WorkspacePremiumRounded } from '@mui/icons-material'
import { useAuth } from '../../auth/AuthContext'
import { ProfileCompletionDialog } from '../auth/ProfileCompletionDialog'
import { canAccess, type Permission } from '../../auth/permissions'
import styles from './AppShell.module.scss'
import { BrandLogo } from '../brand/BrandLogo'
import { SubscriptionProvider, useSubscription } from '../../features/billing/SubscriptionContext'
import { SubscriptionBanner } from '../../features/billing/SubscriptionBanner'
import { TrialStartedDialog } from '../../features/billing/TrialStartedDialog'
import { GuidedTutorial } from '../onboarding/GuidedTutorial'

const navItems: Array<{ label: string; path: string; icon: typeof DashboardRounded; permission?: Permission; ownerOnly?: boolean }> = [
  { label: 'Inicio', path: '/admin', icon: DashboardRounded, ownerOnly: true },
  { label: 'Reparaciones', path: '/admin/reparaciones', icon: BuildRounded, permission: 'repairs.view' },
  { label: 'Clientes', path: '/admin/clientes', icon: PeopleRounded, permission: 'clients.view' },
  { label: 'Comercio', path: '/admin/comercio', icon: Inventory2Rounded, permission: 'commerce.view' },
  { label: 'Venta de equipos', path: '/admin/venta-equipos', icon: PhoneIphoneRounded, permission: 'equipmentSales.view' },
  { label: 'Caja', path: '/admin/caja', icon: PointOfSaleRounded, permission: 'cash.view' },
  { label: 'Empleados', path: '/admin/empleados', icon: GroupsRounded, permission: 'team.view' },
  { label: 'Garantías', path: '/admin/garantias', icon: VerifiedRounded, ownerOnly: true },
  { label: 'Suscripción', path: '/admin/suscripcion', icon: WorkspacePremiumRounded, ownerOnly: true },
  { label: 'Configuración', path: '/admin/configuracion', icon: SettingsRounded, permission: 'settings.access' },
]

function AppShellContent() {
  const { user, logout } = useAuth()
  const { commerceEnabled } = useSubscription()
  const [open, setOpen] = useState(false)
  const theme = useTheme()
  const mobile = useMediaQuery(theme.breakpoints.down('md'))
  const location = useLocation()
  const navigate = useNavigate()
  const go = (path: string) => { navigate(path); setOpen(false) }
  const selected = (path: string) => path === '/admin' ? location.pathname === path : location.pathname.startsWith(path)
  const initials = user?.fullName.split(/\s+/).slice(0, 2).map(part => part.charAt(0)).join('').toUpperCase() || 'U'
  const businessInitials = user?.business.name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part.charAt(0)).join('').toUpperCase() || 'TD'
  const roleLabel = user?.role === 'OWNER' ? 'Propietario' : 'Técnico'

  const visibleNavItems = navItems.filter(item => (!item.ownerOnly || user?.role === 'OWNER') && (!item.permission || canAccess(user, item.permission)))

  const drawer = <Box className={styles.drawer}>
    <Box className={styles.brand}><BrandLogo compact className={styles.logoMark} /><BrandLogo className={styles.logoFull} /></Box>
    <Typography className={styles.navLabel}>MENÚ PRINCIPAL</Typography>
    <List className={styles.nav}>{visibleNavItems.map(({ label, path, icon: Icon }) => { const locked = path === '/admin/comercio' && !commerceEnabled; const NavIcon = locked ? LockRounded : Icon; return <Tooltip key={path} title={!mobile ? locked ? `${label} · Plan Completo` : label : ''} placement="right"><ListItemButton data-tutorial={path === '/admin/clientes' ? 'clients' : path === '/admin/reparaciones' ? 'repairs' : path === '/admin/caja' ? 'cash' : undefined} selected={selected(path)} onClick={() => go(path)}><ListItemIcon><NavIcon /></ListItemIcon><ListItemText primary={locked ? `${label} · Bloqueado` : label} /></ListItemButton></Tooltip> })}</List>
    <Box className={styles.bottom}>
      <ListItemButton onClick={logout}><ListItemIcon><LogoutRounded /></ListItemIcon><ListItemText primary="Cerrar sesión" /></ListItemButton>
      <Box className={styles.account}><Avatar src={user?.business.logoUrl ?? undefined} imgProps={{ style: { objectFit: 'contain' } }}>{initials}</Avatar><Box><Typography fontSize={13} fontWeight={700}>{user?.fullName}</Typography><Typography variant="caption" color="text.secondary">{user?.business.name} · {roleLabel}</Typography></Box></Box>
    </Box>
  </Box>

  return <Box className={styles.shell}>
    {!mobile && <Drawer variant="permanent" open>{drawer}</Drawer>}
    <Drawer open={mobile && open} onClose={() => setOpen(false)} PaperProps={{ sx: { width: 272 } }}>{drawer}</Drawer>
    <AppBar className={styles.header} position="fixed" color="inherit" elevation={0}><Toolbar>
      {mobile && <IconButton aria-label="Abrir menú" onClick={() => setOpen(true)}><MenuRounded /></IconButton>}
      {mobile ? <Box className={styles.mobileBrand}><BrandLogo /></Box> : <Box><Typography variant="caption" color="text.secondary">Espacio de trabajo</Typography><Typography fontWeight={700} fontSize={14}>{navItems.find(item => selected(item.path))?.label ?? 'Mi perfil'}</Typography></Box>}
      <Box flex={1} />
      <Box className={styles.businessAccess} role="button" tabIndex={0} aria-label="Abrir Mi negocio" onClick={() => go('/admin/configuracion#negocio')} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') go('/admin/configuracion#negocio') }}><Avatar src={user?.business.logoUrl ?? undefined} imgProps={{ style: { objectFit: 'contain' } }}>{businessInitials}</Avatar><Box className={styles.businessAccessText}><Typography component="span" className={styles.businessAccessName}>{user?.business.name}</Typography><Typography component="span" className={styles.businessAccessLabel}>Administrador</Typography></Box><ChevronRightRounded className={styles.businessAccessArrow} /></Box>
    </Toolbar></AppBar>
    <ProfileCompletionDialog /><TrialStartedDialog /><GuidedTutorial />
    <Box component="main" className={styles.content}><Box className={styles.inner}><SubscriptionBanner/><AdminVisualScope enabled={/^\/admin\/(reparaciones(?:\/|$)|clientes$|caja$|comercio$|venta-equipos$|empleados$|garantias$|perfil$|sin-modulos$)/.test(location.pathname)}><Outlet /></AdminVisualScope></Box></Box>
    {mobile && canAccess(user, 'repairs.create') && <Fab data-tutorial="new-repair" color="primary" aria-label="Crear nueva reparación" className={styles.repairFab} onClick={() => go('/admin/reparaciones/nueva')}><BuildRounded /></Fab>}
  </Box>
}

export function AppShell(){return <SubscriptionProvider><AppShellContent/></SubscriptionProvider>}
