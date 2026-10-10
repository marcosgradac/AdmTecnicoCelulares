import 'dotenv/config'
import { createOriginAuthMiddleware } from './middlewares/origin-auth'
import { clientIpConfig, createClientIpMiddleware } from './middlewares/client-ip'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { authenticate } from './middlewares/auth'
import { billingRouter } from './modules/billing/billing.routes'
import { platformAdminRouter } from './modules/platform-admin/platform-admin.routes'
import { requireSubscriptionAccess } from './modules/billing/billing.middleware'
import { teamRouter } from './modules/team/team.routes'
import { passwordResetRouter } from './modules/auth/password-reset.routes'
import { passwordChangeRouter } from './modules/auth/password-change.routes'
import { accountRouter } from './modules/account/account.routes'
import { reportsRouter } from './modules/reports/reports.routes'
import { settingsRouter } from './modules/settings/settings.routes'
import { commerceRouter } from './modules/commerce/commerce.routes'
import { equipmentSalesRouter } from './modules/equipment-sales/equipment-sales.routes'
import { warrantiesRouter } from './modules/warranties/warranties.routes'
import { dashboardRouter } from './modules/dashboard/dashboard.routes'
import { securityConfig } from './config/security'
import { authenticatedApiLimiter, globalApiLimiter, limitAuthenticatedWrites } from './middlewares/security'
import { createAuthRoutes } from './modules/auth/auth.routes'
import { registerTrackingPreviewRoutes } from './modules/tracking/tracking-preview.routes'
import { registerHealthRoutes } from './modules/health/health.routes'
import { registerBusinessLogoRoutes, registerPublicTrackingRoutes } from './modules/tracking/tracking.routes'
import { registerPublicPlanRoutes } from './modules/billing/public-plans.routes'
import { registerRepairRoutes } from './modules/repairs/repairs.routes'
import { registerRepairActivityRoutes } from './modules/repairs/repair-activity.routes'
import { registerClientRoutes } from './modules/clients/clients.routes'
import { registerCashRoutes } from './modules/cash/cash.routes'
import { registerErrorHandlers } from './middlewares/errors'

export const app = express()
app.use(createOriginAuthMiddleware())
app.set('trust proxy', clientIpConfig.mode === 'cf' ? false : 1)
app.use(helmet())
const allowedOrigins = (process.env.CORS_ORIGINS ?? process.env.CORS_ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map(value => value.trim().replace(/\/$/, ''))
  .filter(Boolean)
app.use(cors({
  origin: (origin, callback) => {
    const normalizedOrigin = origin?.replace(/\/$/, '')
    const isLocalDevelopmentOrigin = process.env.NODE_ENV !== 'production' && Boolean(normalizedOrigin && (() => {
      try { return ['localhost', '127.0.0.1'].includes(new URL(normalizedOrigin).hostname) }
      catch { return false }
    })())
    if (!origin || allowedOrigins.includes(normalizedOrigin ?? '') || isLocalDevelopmentOrigin) return callback(null, true)
    return callback(new Error('Origen no permitido por CORS'))
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: false,
}))
// CORS OPTIONS already returns above; liveness /health remains independent.
app.use('/api', createClientIpMiddleware())
registerTrackingPreviewRoutes(app)
app.use(express.json({ limit: securityConfig.payloadLimit }))
app.use('/api', globalApiLimiter)
const registerAuthRoutes = createAuthRoutes()
registerHealthRoutes(app)
registerBusinessLogoRoutes(app)
app.use('/api/auth', passwordResetRouter)
app.use('/api/auth/password-change', passwordChangeRouter)
registerPublicTrackingRoutes(app)
registerAuthRoutes(app)
registerPublicPlanRoutes(app)
// The destructive account flow has its own authentication and stricter rate limits.
app.use('/api/account', accountRouter)

app.use('/api', authenticate)
// El presupuesto por usuario va despues de `authenticate` (necesita req.auth.userId) y antes
// de los routers, de modo que cubre igual el orden especial de billing y platform-admin.
// El limite de escrituras queda separado y mas estricto.
app.use('/api', authenticatedApiLimiter)
app.use('/api', limitAuthenticatedWrites)
app.use('/api/billing', billingRouter)
app.use('/api/platform-admin', platformAdminRouter)
app.use('/api', requireSubscriptionAccess)
app.use('/api/commerce', commerceRouter)
app.use('/api/equipment-sales', equipmentSalesRouter)
app.use('/api/dashboard', dashboardRouter)
app.use('/api/team', teamRouter)
app.use('/api/reports', reportsRouter)
app.use('/api/settings', settingsRouter)
registerRepairRoutes(app)
registerClientRoutes(app)
registerRepairActivityRoutes(app)
registerCashRoutes(app)
app.use('/api/warranties', warrantiesRouter)
registerErrorHandlers(app)
