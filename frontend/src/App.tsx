import { Navigate, Outlet, Route, Routes, useParams } from 'react-router-dom'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { RoleGuard } from './auth/RoleGuard'
import { AppShell } from './components/layout/AppShell'
import { ScrollToTop } from './components/routing/ScrollToTop'
import { LandingPage } from './features/landing/pages/LandingPage'
import { LegalPage } from './features/landing/pages/LegalPage'
import { CashPage } from './pages/CashPage'
import { ClientDetailPage } from './pages/ClientDetailPage'
import { ClientsPage } from './pages/ClientsPage'
import { DashboardPage } from './pages/dashboard/DashboardPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { LoginPage } from './pages/LoginPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
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

const PublicLandingLayout=()=> <Outlet/>
const ParamRedirect=({base}:{base:string})=>{const {id}=useParams();return <Navigate to={`${base}/${id}`} replace/>}

export default function App(){return <><ScrollToTop/><Routes>
  <Route path="/" element={<PublicLandingLayout/>}><Route index element={<LandingPage/>}/></Route>
  <Route path="/login" element={<LoginPage/>}/><Route path="/register" element={<RegisterPage/>}/><Route path="/registro" element={<Navigate to="/register" replace/>}/>
  <Route path="/olvide-mi-contrasena" element={<ForgotPasswordPage/>}/><Route path="/restablecer-contrasena" element={<ResetPasswordPage/>}/>
  <Route path="/seguimiento/:token" element={<TrackingPage/>}/><Route path="/terminos" element={<LegalPage title="Términos y condiciones"/>}/><Route path="/privacidad" element={<LegalPage title="Política de privacidad"/>}/>
  <Route element={<ProtectedRoute/>}>
    <Route path="/admin" element={<AppShell/>}>
      <Route index element={<DashboardPage/>}/><Route path="reparaciones" element={<RepairsPage/>}/><Route path="reparaciones/nueva" element={<Navigate to="/admin/reparaciones?new=1" replace/>}/><Route path="reparaciones/:id" element={<RepairDetailPage/>}/>
      <Route path="clientes" element={<ClientsPage/>}/><Route path="clientes/:id" element={<ClientDetailPage/>}/><Route path="stock/*" element={<Navigate to="/admin/reparaciones" replace/>}/>
      <Route path="caja" element={<RoleGuard roles={['OWNER']}><CashPage/></RoleGuard>}/><Route path="reportes" element={<Navigate to="/admin" replace/>}/>
      <Route path="perfil" element={<ProfilePage/>}/><Route path="empleados" element={<RoleGuard roles={['OWNER']}><TeamPage/></RoleGuard>}/>
      <Route path="suscripcion" element={<SubscriptionPage/>}/>
      <Route path="equipo" element={<Navigate to="/admin/empleados" replace/>}/><Route path="equipos/*" element={<Navigate to="/admin/reparaciones" replace/>}/><Route path="estadisticas" element={<Navigate to="/admin" replace/>}/><Route path="garantias" element={<WarrantiesPage/>}/><Route path="configuracion" element={<PlaceholderPage title="Configuración" description="Administrá las preferencias de tu servicio técnico."/>}/>
    </Route>
    <Route path="/platform-admin" element={<PlatformAdminGuard><PlatformAdminPage/></PlatformAdminGuard>}/>
    <Route path="/inicio" element={<Navigate to="/admin" replace/>}/><Route path="/dashboard" element={<Navigate to="/admin" replace/>}/><Route path="/reparaciones" element={<Navigate to="/admin/reparaciones" replace/>}/><Route path="/reparaciones/nueva" element={<Navigate to="/admin/reparaciones?new=1" replace/>}/><Route path="/reparaciones/:id" element={<ParamRedirect base="/admin/reparaciones"/>}/>
    <Route path="/clientes" element={<Navigate to="/admin/clientes" replace/>}/><Route path="/clientes/:id" element={<ParamRedirect base="/admin/clientes"/>}/><Route path="/stock/*" element={<Navigate to="/admin/reparaciones" replace/>}/><Route path="/caja" element={<Navigate to="/admin/caja" replace/>}/><Route path="/reportes" element={<Navigate to="/admin/reportes" replace/>}/>
  </Route>
</Routes></>}
