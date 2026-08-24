import { Router } from 'express'
import { requirePermission, requireRole } from '../../middlewares/auth'
import * as controller from './team.controller'

export const teamRouter = Router()
teamRouter.get('/', requirePermission('team.view'), controller.list)
teamRouter.post('/', requireRole('OWNER'), requirePermission('team.create'), controller.create)
teamRouter.get('/:id', requirePermission('team.view'), controller.get)
teamRouter.patch('/:id', requireRole('OWNER'), requirePermission('team.update'), controller.update)
teamRouter.delete('/:id', requireRole('OWNER'), requirePermission('team.deactivate'), controller.remove)
teamRouter.post('/:id/reset-password', requireRole('OWNER'), requirePermission('team.update'), controller.resetPassword)
