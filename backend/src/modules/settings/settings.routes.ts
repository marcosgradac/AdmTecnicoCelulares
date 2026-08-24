import { Router } from 'express'
import { prisma } from '../../lib/prisma'
import { authOf, requirePermission } from '../../middlewares/auth'
import { z } from 'zod'
export const settingsRouter = Router()
const optionalText = (max: number) => z.preprocess(
  value => typeof value === 'string' && value.trim() === '' ? null : value,
  z.string().trim().max(max).nullable().optional(),
)
const businessSchema = z.object({
  name: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(100, 'El nombre no puede superar 100 caracteres'),
  phone: optionalText(30).refine(value => !value || (/^[+\d][\d\s().-]*$/.test(value) && value.replace(/\D/g, '').length >= 6 && value.replace(/\D/g, '').length <= 15), 'Ingresá un teléfono válido'),
  address: optionalText(180),
}).strict()
settingsRouter.get('/', requirePermission('settings.access'), async (req, res) => { const auth = authOf(req); const [user, business] = await Promise.all([prisma.user.findUnique({ where: { id: auth.userId }, select: { id: true } }), prisma.business.findUnique({ where: { id: auth.businessId }, select: { name: true, phone: true, address: true, logoUrl: true } })]); return res.json({ business, userId: user?.id }) })
settingsRouter.patch('/business', requirePermission('settings.business.update'), async (req, res) => {
  const auth = authOf(req)
  const parsed = businessSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || 'Datos del negocio inválidos' })
  try {
    return res.json(await prisma.business.update({
      where: { id: auth.businessId },
      data: { name: parsed.data.name, phone: parsed.data.phone ?? null, address: parsed.data.address ?? null },
      select: { name: true, phone: true, address: true, logoUrl: true },
    }))
  } catch (error) {
    console.error('No se pudo actualizar el negocio', { userId: auth.userId, businessId: auth.businessId, error: error instanceof Error ? error.message : 'unknown' })
    return res.status(500).json({ success: false, message: 'No pudimos guardar los datos del negocio. Intentá nuevamente.' })
  }
})
settingsRouter.post('/logout-other-sessions', requirePermission('settings.access'), async (req, res) => { await prisma.user.update({ where: { id: authOf(req).userId }, data: { tokenVersion: { increment: 1 } } }); return res.json({ success: true, message: 'Las demás sesiones fueron cerradas. Volvé a iniciar sesión en este dispositivo.' }) })
