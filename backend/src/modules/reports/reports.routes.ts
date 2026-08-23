import { Router } from 'express'
import { authOf, requireRole } from '../../middlewares/auth'
import { getReportsOverview, reportPeriodSchema } from './reports.service'
import { assertFeatureAccess } from '../billing/billing.service'

export const reportsRouter = Router()
reportsRouter.use(requireRole('OWNER'))

reportsRouter.get('/overview', async (req, res) => {
  const parsed = reportPeriodSchema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Período de reporte inválido' })
  try {
    await assertFeatureAccess(authOf(req).businessId, 'advancedReports')
    return res.json(await getReportsOverview(authOf(req).businessId, parsed.data))
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_PERIOD') return res.status(400).json({ success: false, message: 'Período de reporte inválido' })
    if (typeof error === 'object' && error && 'statusCode' in error) return res.status(Number(error.statusCode)).json({ success: false, message: error instanceof Error ? error.message : 'Función no disponible' })
    console.error('Error generando reporte', error)
    return res.status(500).json({ success: false, message: 'Error generando el reporte' })
  }
})
