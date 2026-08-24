import { Router } from 'express'
import { prisma } from '../../lib/prisma'
import { authOf, requirePermission } from '../../middlewares/auth'
import { z } from 'zod'
export const settingsRouter = Router()
settingsRouter.get('/', requirePermission('settings.access'), async (req, res) => { const auth = authOf(req); const [user, business] = await Promise.all([prisma.user.findUnique({ where: { id: auth.userId }, select: { id: true } }), prisma.business.findUnique({ where: { id: auth.businessId }, select: { name: true, phone: true, address: true, logoUrl: true } })]); return res.json({ business, userId: user?.id }) })
settingsRouter.patch('/business', requirePermission('settings.business.update'), async (req, res) => { const parsed = z.object({ name: z.string().trim().min(2).max(100), phone: z.string().trim().max(30).optional().nullable(), address: z.string().trim().max(180).optional().nullable() }).strict().safeParse(req.body); if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos del negocio inválidos' }); return res.json(await prisma.business.update({ where: { id: authOf(req).businessId }, data: { ...parsed.data, phone: parsed.data.phone || null, address: parsed.data.address || null } })) })
settingsRouter.post('/logout-other-sessions', requirePermission('settings.access'), async (req, res) => { await prisma.user.update({ where: { id: authOf(req).userId }, data: { tokenVersion: { increment: 1 } } }); return res.json({ success: true, message: 'Las demás sesiones fueron cerradas. Volvé a iniciar sesión en este dispositivo.' }) })
