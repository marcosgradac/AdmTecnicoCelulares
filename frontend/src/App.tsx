import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Outlet, Route, Routes, useParams } from 'react-router-dom'
import { Box, CircularProgress } from '@mui/material'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { RoleGuard } from './auth/RoleGuard'
import { PermissionGuard } from './auth/PermissionGuard'
import { useAuth } from './auth/AuthContext'
import { canAccess, firstAllowedPath } from './auth/permissions'
import { AppShell } from './components/layout/AppShell'
import { ScrollToTop } from './components/routing/ScrollToTop'
import { LandingPage } from './features/landing/pages/LandingPage'
import { CashPage } from './pages/CashPage'
import { ClientDetailPage } from './pages/ClientDetailPage'
import { ClientsPage } from './pages/ClientsPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { LoginPage } from './pages/LoginPage'
import { ProfilePage } from './pages/ProfilePage'
import { RegisterPage } from './pages/RegisterPage'
import { RepairDetailPage } from './pages/RepairDetailPage'
import { RepairsPage } from './pages/RepairsPage'
import { WarrantiesPage } from './features/warranties/WarrantiesPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { TrackingPage } from './pages/TrackingPage'
import { PlatformAdminGuard } from './features/platformAdmin/PlatformAdminGuard'
import { SupportPage } from './features/settings/SupportPage'
import { NoModulesPage } from './pages/NoModulesPage'

// Landing, auth, tracking and the daily repair/client screens stay in the main bundle.
// The modules below are large and only reached by a minority of sessions, so they are
// fetched on demand instead of slowing down the first paint for everyone.
const TeamPageLazy = lazy(() => import('./pages/TeamPage').then(module => ({ default: module.TeamPage })))
const PlatformAdminPageLazy = lazy(() => import('./features/platformAdmin/PlatformAdminPage').then(module => ({ default: module.PlatformAdminPage })))
const SubscriptionPageLazy = lazy(() => import('./features/billing/SubscriptionPage').then(module => ({ default: module.SubscriptionPage })))
const SettingsPageLazy = lazy(() => import('./features/settings/SettingsPage').then(module => ({ default: module.SettingsPage })))
const CommercePageLazy = lazy(() => import('./pages/CommercePageV2').then(module => ({ default: module.CommercePageV2 })))
const PointOfSalePageLazy = lazy(() => import('./pages/PointOfSalePage').then(module => ({ default: module.PointOfSalePage })))
const EquipmentSalesPageLazy = lazy(() => import('./features/equipmentSales/EquipmentSalesPage').then(module => ({ default: module.EquipmentSalesPage })))
const WarrantiesPageLazy = lazy(() => import('./features/warranties/WarrantiesPage').then(module => ({ default: module.WarrantiesPage })))
const TermsPageLazy = lazy(() => import('./features/legal/TermsPage').then(module => ({ default: module.TermsPage })))
const PrivacyPageLazy = lazy(() => import('./features/legal/PrivacyPage').then(module => ({ default: module.PrivacyPage })))

const PublicLandingLayout=()=> <Outlet/>
// /admin/reportes queda sólo como alias: la pantalla de Reportes se retiró, así que Caja es el destino
// más cercano para quien puede verla. Sin `cash.view` se envía al primer módulo realmente navegable
// (o a la pantalla de "sin módulos"), nunca de nuevo a /admin/reportes, para que no haya ciclos.
const ReportsAliasRedirect=()=>{const {user}=useAuth();return <Navigate to={canAccess(user,'cash.view')?'/admin/caja':firstAllowedPath(user)} replace/>}
const ParamRedirect=({base}:{base:string})=>{const {id}=useParams();return <Navigate to={`${base}/${id}`} replace/>}
const DashboardPage=lazy(()=>import('./pages/dashboard/DashboardPage').then(module=>({default:module.DashboardPage})))
// Shared fallback for every on-demand route: one spinner instead of an empty frame.
const RouteFallback=({children}:{children:ReactNode})=>
  <Suspense fallback={<Box minHeight={240} display="grid" sx={{placeItems:'center'}}><CircularProgress size={28}/></Box>}>{children}</Suspense>
const DashboardRoute=()=> <Suspense fallback={<Box minHeight={240} display="grid" sx={{placeItems:'center'}}><CircularProgress size={28}/></Box>}><DashboardPage/></Suspense>

export default function App(){return <><ScrollToTop/><Routes>
  <Route path="/" element={<PublicLandingLayout/>}><Route index element={<LandingPage/>}/></Route>
  <Route path="/login" element={<LoginPage/>}/><Route path="/register" element={<RegisterPage/>}/><Route path="/registro" element={<Navigate to="/register" replace/>}/>
  <Route path="/olvide-mi-contrasena" element={<ForgotPasswordPage/>}/><Route path="/restablecer-contrasena" element={<ResetPasswordPage/>}/>
  <Route path="/seguimiento/:token" element={<TrackingPage/>}/><Route path="/terminos-y-condiciones" element={<RouteFallback><TermsPageLazy/></RouteFallback>}/><Route path="/terminos" element={<Navigate to="/terminos-y-condiciones" replace/>}/><Route path="/politica-de-privacidad" element={<RouteFallback><PrivacyPageLazy/></RouteFallback>}/><Route path="/privacidad" element={<Navigate to="/politica-de-privacidad" replace/>}/>
  <Route element={<ProtectedRoute/>}>
    <Route path="/admin" element={<AppShell/>}>
      <Route index element={<PermissionGuard ownerOnly><DashboardRoute/></PermissionGuard>}/><Route path="reparaciones" element={<PermissionGuard permission="repairs.view"><RepairsPage/></PermissionGuard>}/><Route path="reparaciones/nueva" element={<PermissionGuard permission="repairs.create"><Navigate to="/admin/reparaciones?new=1" replace/></PermissionGuard>}/><Route path="reparaciones/:id" element={<PermissionGuard permission="repairs.view"><RepairDetailPage/></PermissionGuard>}/>
      <Route path="clientes" element={<PermissionGuard permission="clients.view"><ClientsPage/></PermissionGuard>}/><Route path="clientes/:id" element={<PermissionGuard permission="clients.view"><ClientDetailPage/></PermissionGuard>}/>
      <Route path="comercio" element={<PermissionGuard permission="commerce.view"><RouteFallback><CommercePageLazy/></RouteFallback></PermissionGuard>}/>
      <Route path="punto-de-venta" element={<PermissionGuard permission="commerce.view"><RouteFallback><PointOfSalePageLazy/></RouteFallback></PermissionGuard>}/>
      <Route path="venta-equipos" element={<PermissionGuard permission="equipmentSales.view"><RouteFallback><EquipmentSalesPageLazy/></RouteFallback></PermissionGuard>}/>
      <Route path="caja" element={<PermissionGuard permission="cash.view"><CashPage/></PermissionGuard>}/><Route path="reportes" element={<ReportsAliasRedirect/>}/>
      <Route path="perfil" element={<ProfilePage/>}/><Route path="empleados" element={<RoleGuard roles={['OWNER']}><RouteFallback><TeamPageLazy/></RouteFallback></RoleGuard>}/>
      <Route path="suscripcion" element={<PermissionGuard ownerOnly><RouteFallback><SubscriptionPageLazy/></RouteFallback></PermissionGuard>}/>
      <Route path="equipo" element={<Navigate to="/admin/empleados" replace/>}/><Route path="equipos/*" element={<Navigate to="/admin/reparaciones" replace/>}/><Route path="estadisticas" element={<Navigate to="/admin" replace/>}/><Route path="garantias" element={<PermissionGuard ownerOnly><RouteFallback><WarrantiesPageLazy/></RouteFallback></PermissionGuard>}/><Route path="configuracion" element={<PermissionGuard permission="settings.access"><RouteFallback><SettingsPageLazy/></RouteFallback></PermissionGuard>}/><Route path="configuracion/soporte" element={<PermissionGuard permission="settings.access"><SupportPage/></PermissionGuard>}/><Route path="sin-modulos" element={<NoModulesPage/>}/>
    </Route>
    <Route path="/platform-admin" element={<PlatformAdminGuard><RouteFallback><PlatformAdminPageLazy/></RouteFallback></PlatformAdminGuard>}/>
    <Route path="/inicio" element={<Navigate to="/admin" replace/>}/><Route path="/dashboard" element={<Navigate to="/admin" replace/>}/><Route path="/reparaciones" element={<Navigate to="/admin/reparaciones" replace/>}/><Route path="/reparaciones/nueva" element={<Navigate to="/admin/reparaciones?new=1" replace/>}/><Route path="/reparaciones/:id" element={<ParamRedirect base="/admin/reparaciones"/>}/>
    <Route path="/clientes" element={<Navigate to="/admin/clientes" replace/>}/><Route path="/clientes/:id" element={<ParamRedirect base="/admin/clientes"/>}/><Route path="/caja" element={<Navigate to="/admin/caja" replace/>}/><Route path="/reportes" element={<Navigate to="/admin/reportes" replace/>}/>
  </Route>
</Routes></>}
