import type { AuthData } from '../../middlewares/auth'
import type { getReportsOverview } from './reports.service'

/** Keep operational reports available without disclosing costs, payments or profit. */
export function reportResponse(auth: AuthData, report: Awaited<ReturnType<typeof getReportsOverview>>) {
  if (auth.role === 'OWNER' || auth.permissions?.includes('reports.viewSensitive')) return report
  const { repairsIncoming, repairsDelivered, repairsActive, newClients, recurrentClients } = report.summary
  const { new: newCount, recurrent, averageRepairs, topByRepairs } = report.clients
  return {
    period: report.period,
    summary: { repairsIncoming, repairsDelivered, repairsActive, newClients, recurrentClients },
    repairs: report.repairs,
    clients: { new: newCount, recurrent, averageRepairs, topByRepairs: topByRepairs.map(({ name, repairs }) => ({ name, repairs })) },
    employees: report.employees,
  }
}
