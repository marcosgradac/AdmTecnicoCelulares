import type { Express } from 'express'
import { registerRepairReadRoutes } from './repair-read.routes'
import { registerRepairWriteRoutes } from './repair-write.routes'
import { registerRepairStatusRoutes } from './repair-status.routes'
import { registerRepairFinanceRoutes } from './repair-finance.routes'
import { registerRepairDeleteRoutes } from './repair-delete.routes'
import { registerRepairLegacyRoutes } from './repair-legacy.routes'

export function registerRepairRoutes(app: Express) {
  registerRepairReadRoutes(app)
  registerRepairWriteRoutes(app)
  registerRepairStatusRoutes(app)
  registerRepairFinanceRoutes(app)
  registerRepairDeleteRoutes(app)
  registerRepairLegacyRoutes(app)
}
