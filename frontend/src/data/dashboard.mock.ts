import type { DashboardRepair } from '../types/dashboard.types'

export const dashboardSummary = {
  activeRepairs: 12,
  inReview: 4,
  ready: 3,
  monthlyIncome: 485000,
}

export const recentDashboardRepairs: DashboardRepair[] = [
  { id: '1048', number: 1048, client: 'Juan Pérez', device: 'iPhone 13', issue: 'Cambio de módulo', status: 'en_reparacion', receivedAt: '2026-07-28', total: 180000 },
  { id: '1047', number: 1047, client: 'Camila Gómez', device: 'Samsung A54', issue: 'No enciende', status: 'en_revision', receivedAt: '2026-07-27', total: 95000 },
  { id: '1046', number: 1046, client: 'Lucas Fernández', device: 'Moto G84', issue: 'Cambio de batería', status: 'listo_retirar', receivedAt: '2026-07-26', total: 65000 },
]
