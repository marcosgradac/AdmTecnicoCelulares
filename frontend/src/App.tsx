import { Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { DashboardPage } from './pages/DashboardPage'
import { RepairsPage } from './pages/RepairsPage'
import { NewRepairPage } from './pages/NewRepairPage'
import { RepairDetailPage } from './pages/RepairDetailPage'
import { ClientsPage } from './pages/ClientsPage'
import { StockPage } from './pages/StockPage'
import { CashPage } from './pages/CashPage'
import { TrackingPage } from './pages/TrackingPage'
import { ReportsPage } from './pages/ReportsPage'
import { ClientDetailPage } from './pages/ClientDetailPage'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { ProfilePage } from './pages/ProfilePage'

export default function App() {
  return (
    <Routes>
      <Route path="/seguimiento/:token" element={<TrackingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/inicio" replace />} />
          <Route path="/inicio" element={<DashboardPage />} />
          <Route path="/reparaciones" element={<RepairsPage />} />
          <Route path="/reparaciones/nueva" element={<NewRepairPage />} />
          <Route path="/reparaciones/:id" element={<RepairDetailPage />} />
          <Route path="/clientes" element={<ClientsPage />} />
          <Route path="/clientes/:id" element={<ClientDetailPage />} />
          <Route path="/stock" element={<StockPage />} />
          <Route path="/caja" element={<CashPage />} />
          <Route path="/reportes" element={<ReportsPage />} />
          <Route path="/perfil" element={<ProfilePage />} />
        </Route>
      </Route>
    </Routes>
  )
}
