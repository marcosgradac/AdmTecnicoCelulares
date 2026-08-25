import express, { Router, type NextFunction, type Request, type Response } from 'express'
import { prisma } from '../../lib/prisma'
import { authOf, requirePermission } from '../../middlewares/auth'
import { z } from 'zod'
export const settingsRouter = Router()
const MAX_LOGO_BYTES = 2 * 1024 * 1024
const allowedLogoTypes = new Set(['image/png', 'image/jpeg', 'image/webp'])
const logoUrl = (businessId: string, storedLogo: string | null) => storedLogo?.startsWith('data:') ? `/api/business-logo/${businessId}` : storedLogo
const detectLogoType = (buffer: Buffer) => {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  return null
}
const optionalText = (max: number) => z.preprocess(
  value => typeof value === 'string' && value.trim() === '' ? null : value,
  z.string().trim().max(max).nullable().optional(),
)
const businessSchema = z.object({
  name: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(100, 'El nombre no puede superar 100 caracteres'),
  phone: optionalText(30).refine(value => !value || (/^[+\d][\d\s().-]*$/.test(value) && value.replace(/\D/g, '').length >= 6 && value.replace(/\D/g, '').length <= 15), 'Ingresá un teléfono válido'),
  address: optionalText(180),
}).strict()
settingsRouter.get('/', requirePermission('settings.access'), async (req, res) => { const auth = authOf(req); const [user, business] = await Promise.all([prisma.user.findUnique({ where: { id: auth.userId }, select: { id: true } }), prisma.business.findUnique({ where: { id: auth.businessId }, select: { id: true, name: true, phone: true, address: true, logoUrl: true } })]); return res.json({ business: business ? { ...business, logoUrl: logoUrl(business.id, business.logoUrl) } : null, userId: user?.id }) })
settingsRouter.patch('/business', requirePermission('settings.business.update'), async (req, res) => {
  const auth = authOf(req)
  const parsed = businessSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || 'Datos del negocio inválidos' })
  try {
    const business = await prisma.business.update({
      where: { id: auth.businessId },
      data: { name: parsed.data.name, phone: parsed.data.phone ?? null, address: parsed.data.address ?? null },
      select: { id: true, name: true, phone: true, address: true, logoUrl: true },
    })
    return res.json({ ...business, logoUrl: logoUrl(business.id, business.logoUrl) })
  } catch (error) {
    console.error('No se pudo actualizar el negocio', { userId: auth.userId, businessId: auth.businessId, error: error instanceof Error ? error.message : 'unknown' })
    return res.status(500).json({ success: false, message: 'No pudimos guardar los datos del negocio. Intentá nuevamente.' })
  }
})
settingsRouter.get('/business/logo', requirePermission('settings.access'), async (req, res) => {
  const auth = authOf(req)
  const business = await prisma.business.findUnique({ where: { id: auth.businessId }, select: { logoUrl: true } })
  return res.json({ logoUrl: logoUrl(auth.businessId, business?.logoUrl ?? null) })
})
settingsRouter.post('/business/logo', requirePermission('settings.business.update'), express.raw({ type: () => true, limit: MAX_LOGO_BYTES }), async (req, res) => {
  const auth = authOf(req)
  const declaredType = req.header('content-type')?.split(';')[0].trim().toLowerCase() ?? ''
  const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
  const detectedType = detectLogoType(buffer)
  if (!buffer.length || !detectedType || !allowedLogoTypes.has(declaredType) || declaredType !== detectedType) return res.status(400).json({ success: false, message: 'El logo debe ser un archivo PNG, JPG o WEBP válido.' })
  const storedLogo = `data:${detectedType};base64,${buffer.toString('base64')}`
  await prisma.business.update({ where: { id: auth.businessId }, data: { logoUrl: storedLogo } })
  return res.json({ logoUrl: logoUrl(auth.businessId, storedLogo) })
})
settingsRouter.delete('/business/logo', requirePermission('settings.business.update'), async (req, res) => {
  const auth = authOf(req)
  await prisma.business.update({ where: { id: auth.businessId }, data: { logoUrl: null } })
  return res.json({ logoUrl: null })
})
settingsRouter.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (typeof error === 'object' && error && 'type' in error && error.type === 'entity.too.large') return res.status(413).json({ success: false, message: 'El logo no puede superar los 2 MB.' })
  return next(error)
})
settingsRouter.post('/logout-other-sessions', requirePermission('settings.access'), async (req, res) => { await prisma.user.update({ where: { id: authOf(req).userId }, data: { tokenVersion: { increment: 1 } } }); return res.json({ success: true, message: 'Las demás sesiones fueron cerradas. Volvé a iniciar sesión en este dispositivo.' }) })
