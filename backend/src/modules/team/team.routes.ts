import { Router } from 'express'
import { requireRole } from '../../middlewares/auth'
import * as controller from './team.controller'

export const teamRouter = Router()
teamRouter.use(requireRole('OWNER'))
teamRouter.get('/', controller.list)
teamRouter.post('/', controller.create)
teamRouter.get('/:id', controller.get)
teamRouter.patch('/:id', controller.update)
teamRouter.post('/:id/reset-password', controller.resetPassword)
