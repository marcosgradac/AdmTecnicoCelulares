import { Navigate, Outlet, Route, Routes, useParams } from 'react-router-dom'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { RoleGuard } from './auth/RoleGuard'
import { PermissionGuard } from './auth/PermissionGuard'
import { AppShell } from './components/layout/AppShell'
import { ScrollToTop } from './components/routing/ScrollToTop'
import { LandingPage } from './features/landing/pages/LandingPage'
import { CashPage } from './pages/CashPage'
import { ClientDetailPage } from './pages/ClientDetailPage'
import { ClientsPage } from './pages/ClientsPage'
import { DashboardPage } from './pages/dashboard/DashboardPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { LoginPage } from './pages/LoginPage'
import { ProfilePage } from './pages/ProfilePage'
import { RegisterPage } from './pages/RegisterPage'
import { RepairDetailPage } from './pages/RepairDetailPage'
import { RepairsPage } from './pages/RepairsPage'
import { WarrantiesPage } from './features/warranties/WarrantiesPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { TeamPage } from './pages/TeamPage'
import { TrackingPage } from './pages/TrackingPage'
import { SubscriptionPage } from './features/billing/SubscriptionPage'
import { PlatformAdminPage } from './features/platformAdmin/PlatformAdminPage'
import { PlatformAdminGuard } from './features/platformAdmin/PlatformAdminGuard'
import { TermsPage } from './features/legal/TermsPage'
import { PrivacyPage } from './features/legal/PrivacyPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { NoModulesPage } from './pages/NoModulesPage'

const PublicLandingLayout=()=> <Outlet/>
const ParamRedirect=({base}:{base:string})=>{const {id}=useParams();return <Navigate to={`${base}/${id}`} replace/>}

export default function App(){return <><ScrollToTop/><Routes>
  <Route path="/" element={<PublicLandingLayout/>}><Route index element={<LandingPage/>}/></Route>
  <Route path="/login" element={<LoginPage/>}/><Route path="/register" element={<RegisterPage/>}/><Route path="/registro" element={<Navigate to="/register" replace/>}/>
  <Route path="/olvide-mi-contrasena" element={<ForgotPasswordPage/>}/><Route path="/restablecer-contrasena" element={<ResetPasswordPage/>}/>
  <Route path="/seguimiento/:token" element={<TrackingPage/>}/><Route path="/terminos-y-condiciones" element={<TermsPage/>}/><Route path="/terminos" element={<Navigate to="/terminos-y-condiciones" replace/>}/><Route path="/politica-de-privacidad" element={<PrivacyPage/>}/><Route path="/privacidad" element={<Navigate to="/politica-de-privacidad" replace/>}/>
  <Route element={<ProtectedRoute/>}>
    <Route path="/admin" element={<AppShell/>}>
      <Route index element={<PermissionGuard ownerOnly><DashboardPage/></PermissionGuard>}/><Route path="reparaciones" element={<PermissionGuard permission="repairs.view"><RepairsPage/></PermissionGuard>}/><Route path="reparaciones/nueva" element={<PermissionGuard permission="repairs.create"><Navigate to="/admin/reparaciones?new=1" replace/></PermissionGuard>}/><Route path="reparaciones/:id" element={<PermissionGuard permission="repairs.view"><RepairDetailPage/></PermissionGuard>}/>
      <Route path="clientes" element={<PermissionGuard permission="clients.view"><ClientsPage/></PermissionGuard>}/><Route path="clientes/:id" element={<PermissionGuard permission="clients.view"><ClientDetailPage/></PermissionGuard>}/>
      <Route path="caja" element={<PermissionGuard permission="cash.view"><CashPage/></PermissionGuard>}/><Route path="reportes" element={<PermissionGuard permission="reports.view"><Navigate to="/admin/caja" replace/></PermissionGuard>}/>
      <Route path="perfil" element={<ProfilePage/>}/><Route path="empleados" element={<RoleGuard roles={['OWNER']}><TeamPage/></RoleGuard>}/>
      <Route path="suscripcion" element={<PermissionGuard ownerOnly><SubscriptionPage/></PermissionGuard>}/>
      <Route path="equipo" element={<Navigate to="/admin/empleados" replace/>}/><Route path="equipos/*" element={<Navigate to="/admin/reparaciones" replace/>}/><Route path="estadisticas" element={<Navigate to="/admin" replace/>}/><Route path="garantias" element={<PermissionGuard ownerOnly><WarrantiesPage/></PermissionGuard>}/><Route path="configuracion" element={<PermissionGuard permission="settings.access"><SettingsPage/></PermissionGuard>}/><Route path="sin-modulos" element={<NoModulesPage/>}/>
    </Route>
    <Route path="/platform-admin" element={<PlatformAdminGuard><PlatformAdminPage/></PlatformAdminGuard>}/>
    <Route path="/inicio" element={<Navigate to="/admin" replace/>}/><Route path="/dashboard" element={<Navigate to="/admin" replace/>}/><Route path="/reparaciones" element={<Navigate to="/admin/reparaciones" replace/>}/><Route path="/reparaciones/nueva" element={<Navigate to="/admin/reparaciones?new=1" replace/>}/><Route path="/reparaciones/:id" element={<ParamRedirect base="/admin/reparaciones"/>}/>
    <Route path="/clientes" element={<Navigate to="/admin/clientes" replace/>}/><Route path="/clientes/:id" element={<ParamRedirect base="/admin/clientes"/>}/><Route path="/caja" element={<Navigate to="/admin/caja" replace/>}/><Route path="/reportes" element={<Navigate to="/admin/reportes" replace/>}/>
  </Route>
</Routes></>}
