import 'dotenv/config'
import express, { type Request, type Response } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import bcrypt from 'bcryptjs'
import jwt, { type SignOptions } from 'jsonwebtoken'
import { z } from 'zod'
import { rateLimit } from 'express-rate-limit'
import { CashMovementType, PaymentMethod, RepairStatus } from '@prisma/client'
import { prisma } from './lib/prisma'
import { authenticate, authOf, requireRole, type AuthData } from './middlewares/auth'
import { teamRouter } from './modules/team/team.routes'

const app = express()
app.use(helmet())
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? false }))
app.use(express.json({ limit: '1mb' }))

const jwtSecret = process.env.JWT_SECRET
if (!jwtSecret) throw new Error('JWT_SECRET es obligatorio')

const signToken = (auth: AuthData) => jwt.sign(auth, jwtSecret, {
  expiresIn: (process.env.JWT_EXPIRES_IN ?? '8h') as SignOptions['expiresIn']
})
const unauthorized = (res: Response, message = 'No autorizado') => res.status(401).json({ success: false, message })
const normalizePhone = (value?: string | null) => {
  const normalized = value?.trim().replace(/\D/g, '')
  return normalized || null
}
const userResponse = <T extends {
  id: string
  name: string
  firstName: string | null
  lastName: string | null
  phone: string | null
  email: string
  role: 'OWNER' | 'TECHNICIAN'
  business: { id: string; name: string }
}>(user: T) => ({
  id: user.id,
  firstName: user.firstName,
  lastName: user.lastName,
  fullName: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.name,
  phone: user.phone,
  email: user.email,
  role: user.role,
  profileComplete: Boolean(user.firstName && user.lastName),
  business: { id: user.business.id, name: user.business.name },
})

app.get('/api/health', (_req, res) => res.json({ ok: true }))

const publicRepairSelect = {
  id: true, number: true, deviceBrand: true, deviceModel: true, issue: true,
  status: true, total: true, paid: true, trackingToken: true, createdAt: true, updatedAt: true
} as const
app.get('/api/tracking/:token', async (req, res) => {
  try {
    const repair = await prisma.repair.findUnique({ where: { trackingToken: req.params.token }, select: publicRepairSelect })
    if (!repair) return res.status(404).json({ success: false, message: 'Seguimiento no encontrado' })
    return res.json({ ...repair, clientId: '', imei: null, color: null, diagnosis: null, notes: null, client: { id: '', name: '', phone: null, createdAt: repair.createdAt } })
  } catch { return res.status(500).json({ success: false, message: 'Error obteniendo seguimiento' }) }
})

const registerSchema = z.object({
  businessName: z.string().trim().min(2),
  businessPhone: z.string().trim().optional(),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  phone: z.string().trim().optional(),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/\d/),
})
const authRateLimiter = rateLimit({
  windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000),
  limit: Number(process.env.AUTH_RATE_LIMIT_MAX ?? 10),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ success: false, message: 'Demasiados intentos. Probá nuevamente más tarde.' }),
})
app.post('/api/auth/register', authRateLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos de registro inválidos' })
  const email = parsed.data.email.toLowerCase()
  try {
    if (await prisma.user.findUnique({ where: { email } })) return res.status(409).json({ success: false, message: 'Ya existe una cuenta con ese correo' })
    const passwordHash = await bcrypt.hash(parsed.data.password, 12)
    const user = await prisma.$transaction(async tx => {
      const business = await tx.business.create({
        data: { name: parsed.data.businessName, phone: normalizePhone(parsed.data.businessPhone) },
      })
      return tx.user.create({
        data: {
          businessId: business.id,
          name: `${parsed.data.firstName} ${parsed.data.lastName}`,
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          phone: normalizePhone(parsed.data.phone),
          email,
          passwordHash,
          role: 'OWNER',
        },
        include: { business: true },
      })
    })
    const token = signToken({ userId: user.id, businessId: user.businessId, role: user.role })
    return res.status(201).json({ token, user: userResponse(user) })
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') {
      return res.status(409).json({ success: false, message: 'Ya existe una cuenta con ese correo' })
    }
    return res.status(500).json({ success: false, message: 'Error registrando la cuenta' })
  }
})

app.post('/api/auth/login', authRateLimiter, async (req, res) => {
  const parsed = z.object({ email: z.string().trim().email(), password: z.string().min(1) }).safeParse(req.body)
  if (!parsed.success) return unauthorized(res, 'Email o contraseña incorrectos')
  try {
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() }, include: { business: true } })
    if (!user || !await bcrypt.compare(parsed.data.password, user.passwordHash)) return unauthorized(res, 'Email o contraseña incorrectos')
    if (!user.isActive) return res.status(403).json({ success: false, message: 'Usuario inactivo' })
    const token = signToken({ userId: user.id, businessId: user.businessId, role: user.role })
    return res.json({ token, user: userResponse(user) })
  } catch { return res.status(500).json({ success: false, message: 'Error iniciando sesión' }) }
})

app.get('/api/auth/me', authenticate, async (req, res) => {
  const auth = authOf(req)
  const user = await prisma.user.findFirst({ where: { id: auth.userId, businessId: auth.businessId }, include: { business: true } })
  if (!user) return unauthorized(res)
  return res.json(userResponse(user))
})

app.get('/api/profile', authenticate, async (req, res) => {
  const auth = authOf(req)
  const user = await prisma.user.findFirst({ where: { id: auth.userId, businessId: auth.businessId }, include: { business: true } })
  return user ? res.json(userResponse(user)) : unauthorized(res)
})

const profileSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  phone: z.string().trim().optional().nullable(),
})
app.patch('/api/profile', authenticate, async (req, res) => {
  const parsed = profileSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos de perfil inválidos' })
  const auth = authOf(req)
  const current = await prisma.user.findFirst({ where: { id: auth.userId, businessId: auth.businessId } })
  if (!current) return unauthorized(res)
  const user = await prisma.user.update({
    where: { id: current.id },
    data: {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      name: `${parsed.data.firstName} ${parsed.data.lastName}`,
      phone: normalizePhone(parsed.data.phone),
    },
    include: { business: true },
  })
  return res.json(userResponse(user))
})

app.use('/api', authenticate)
app.use('/api/team', teamRouter)
const includeRepair = { client: true, payments: true } as const

app.get('/api/repairs', async (req, res) => {
  try { return res.json(await prisma.repair.findMany({ where: { businessId: authOf(req).businessId }, include: includeRepair, orderBy: { createdAt: 'desc' } })) }
  catch { return res.status(500).json({ success: false, message: 'Error obteniendo reparaciones' }) }
})
app.get('/api/repairs/:id', async (req, res) => {
  const repair = await prisma.repair.findFirst({ where: { id: req.params.id, businessId: authOf(req).businessId }, include: includeRepair })
  return repair ? res.json(repair) : res.status(404).json({ success: false, message: 'Reparación no encontrada' })
})

const createRepairSchema = z.object({
  clientId: z.string().min(1).optional(), clientName: z.string().trim().min(2), phone: z.string().optional(),
  deviceBrand: z.string().trim().min(1), deviceModel: z.string().trim().min(1), imei: z.string().optional(),
  color: z.string().optional(), issue: z.string().trim().min(2), diagnosis: z.string().optional(),
  notes: z.string().optional(), total: z.number().int().nonnegative().default(0)
})
app.post('/api/repairs', async (req, res) => {
  const parsed = createRepairSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos inválidos' })
  const businessId = authOf(req).businessId
  try {
    const data = parsed.data
    const normalizedPhone = data.phone?.replace(/\D/g, '')
    const selected = data.clientId ? await prisma.client.findFirst({ where: { id: data.clientId, businessId } }) : null
    if (data.clientId && !selected) return res.status(400).json({ success: false, message: 'El cliente seleccionado no existe' })
    const existing = selected ?? (normalizedPhone ? await prisma.client.findFirst({ where: { businessId, phone: normalizedPhone } }) : null)
    const repair = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${businessId}))`
      const client = existing ?? await tx.client.create({ data: { businessId, name: data.clientName, phone: normalizedPhone } })
      const last = await tx.repair.findFirst({ where: { businessId }, orderBy: { number: 'desc' } })
      return tx.repair.create({ data: { businessId, number: (last?.number ?? 1000) + 1, clientId: client.id, deviceBrand: data.deviceBrand, deviceModel: data.deviceModel, imei: data.imei, color: data.color, issue: data.issue, diagnosis: data.diagnosis, notes: data.notes, total: data.total }, include: includeRepair })
    }, { timeout: 15_000 })
    return res.status(201).json(repair)
  } catch { return res.status(500).json({ success: false, message: 'Error creando reparación' }) }
})

const updateRepairSchema = z.object({
  clientId: z.string().min(1).optional(), deviceBrand: z.string().trim().min(1), deviceModel: z.string().trim().min(1),
  imei: z.string().trim().optional().nullable(), color: z.string().trim().optional().nullable(), issue: z.string().trim().min(2),
  diagnosis: z.string().trim().optional().nullable(), notes: z.string().trim().optional().nullable(), total: z.number().int().nonnegative()
})
app.patch('/api/repairs/:id', async (req, res) => {
  const parsed = updateRepairSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos de reparación inválidos' })
  const businessId = authOf(req).businessId
  const current = await prisma.repair.findFirst({ where: { id: req.params.id, businessId } })
  if (!current) return res.status(404).json({ success: false, message: 'Reparación no encontrada' })
  if (parsed.data.total < current.paid) return res.status(400).json({ success: false, message: 'El total no puede ser menor que el importe pagado' })
  if (parsed.data.clientId && !await prisma.client.findFirst({ where: { id: parsed.data.clientId, businessId } })) return res.status(400).json({ success: false, message: 'El cliente seleccionado no existe' })
  const repair = await prisma.repair.update({ where: { id: current.id }, data: { ...parsed.data, imei: parsed.data.imei || null, color: parsed.data.color || null, diagnosis: parsed.data.diagnosis || null, notes: parsed.data.notes || null }, include: includeRepair })
  return res.json(repair)
})
app.patch('/api/repairs/:id/status', async (req, res) => {
  const parsed = z.object({ status: z.nativeEnum(RepairStatus) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Estado inválido' })
  const current = await prisma.repair.findFirst({ where: { id: String(req.params.id), businessId: authOf(req).businessId } })
  if (!current) return res.status(404).json({ success: false, message: 'Reparación no encontrada' })
  return res.json(await prisma.repair.update({ where: { id: current.id }, data: { status: parsed.data.status }, include: includeRepair }))
})
const setRepairStatus = (status: RepairStatus) => async (req: Request, res: Response) => {
  const current = await prisma.repair.findFirst({ where: { id: String(req.params.id), businessId: authOf(req).businessId } })
  if (!current) return res.status(404).json({ success: false, message: 'Reparación no encontrada' })
  return res.json(await prisma.repair.update({ where: { id: current.id }, data: { status }, include: includeRepair }))
}
app.patch('/api/repairs/:id/approve', setRepairStatus('APPROVED'))
app.patch('/api/repairs/:id/start', setRepairStatus('REPAIRING'))

app.get('/api/clients', async (req, res) => res.json(await prisma.client.findMany({ where: { businessId: authOf(req).businessId }, include: { repairs: { orderBy: { createdAt: 'desc' } } }, orderBy: { createdAt: 'desc' } })))
app.get('/api/clients/:id', async (req, res) => {
  const client = await prisma.client.findFirst({ where: { id: req.params.id, businessId: authOf(req).businessId }, include: { repairs: { orderBy: { createdAt: 'desc' } } } })
  return client ? res.json(client) : res.status(404).json({ success: false, message: 'Cliente no encontrado' })
})
app.post('/api/clients', async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2), phone: z.string().min(6).optional() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos inválidos' })
  const businessId = authOf(req).businessId
  const phone = parsed.data.phone?.replace(/\D/g, '')
  if (phone && await prisma.client.findFirst({ where: { businessId, phone } })) return res.status(409).json({ success: false, message: 'Ya existe un cliente con ese teléfono' })
  return res.status(201).json(await prisma.client.create({ data: { businessId, name: parsed.data.name, phone } }))
})

app.post('/api/repairs/:id/payments', requireRole('OWNER'), async (req, res) => {
  const parsed = z.object({ amount: z.number().int().positive(), method: z.nativeEnum(PaymentMethod), note: z.string().optional() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos de pago inválidos' })
  const businessId = authOf(req).businessId
  const repair = await prisma.repair.findFirst({ where: { id: String(req.params.id), businessId }, include: { client: true } })
  if (!repair) return res.status(404).json({ success: false, message: 'Reparación no encontrada' })
  const payment = await prisma.$transaction(async tx => {
    const changed = await tx.repair.updateMany({
      where: { id: repair.id, businessId, paid: { lte: repair.total - parsed.data.amount } },
      data: { paid: { increment: parsed.data.amount } },
    })
    if (changed.count !== 1) return null
    const created = await tx.payment.create({ data: { businessId, ...parsed.data, repairId: repair.id, clientId: repair.clientId } })
    await tx.cashMovement.create({ data: { businessId, type: 'INCOME', description: `Pago reparación #${repair.number}`, amount: parsed.data.amount, method: parsed.data.method, repairId: repair.id, clientName: repair.client.name } })
    return created
  })
  return payment
    ? res.status(201).json(payment)
    : res.status(409).json({ success: false, message: 'El pago supera el saldo pendiente' })
})
app.get('/api/repairs/:id/payments', async (req, res) => {
  const repair = await prisma.repair.findFirst({ where: { id: req.params.id, businessId: authOf(req).businessId }, select: { id: true } })
  if (!repair) return res.status(404).json({ success: false, message: 'Reparación no encontrada' })
  return res.json(await prisma.payment.findMany({ where: { repairId: repair.id, businessId: authOf(req).businessId }, orderBy: { createdAt: 'desc' } }))
})

const serializePart = (part: { id: string; stockItemId: string; itemNameSnapshot: string; quantity: number; unitCost: number; unitPrice: number; createdAt: Date }) => ({ id: part.id, stockItemId: part.stockItemId, name: part.itemNameSnapshot, quantity: part.quantity, unitCost: part.unitCost, unitPrice: part.unitPrice, subtotal: part.quantity * part.unitPrice, createdAt: part.createdAt })
app.get('/api/repairs/:id/parts', async (req, res) => {
  const repair = await prisma.repair.findFirst({ where: { id: req.params.id, businessId: authOf(req).businessId }, select: { id: true } })
  if (!repair) return res.status(404).json({ success: false, message: 'Reparación no encontrada' })
  return res.json((await prisma.repairPart.findMany({ where: { repairId: repair.id }, orderBy: { createdAt: 'desc' } })).map(serializePart))
})
app.post('/api/repairs/:id/parts', async (req, res) => {
  const parsed = z.object({ stockItemId: z.string().min(1), quantity: z.number().int().positive(), unitPrice: z.number().int().nonnegative() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos de repuesto inválidos' })
  const businessId = authOf(req).businessId
  const result = await prisma.$transaction(async tx => {
    const repair = await tx.repair.findFirst({ where: { id: req.params.id, businessId }, select: { id: true } })
    if (!repair) return { status: 404 as const, message: 'Reparación no encontrada' }
    const item = await tx.stockItem.findFirst({ where: { id: parsed.data.stockItemId, businessId } })
    if (!item) return { status: 404 as const, message: 'Repuesto no encontrado' }
    if (!item.active) return { status: 400 as const, message: 'El repuesto está inactivo' }
    const changed = await tx.stockItem.updateMany({ where: { id: item.id, businessId, active: true, quantity: { gte: parsed.data.quantity } }, data: { quantity: { decrement: parsed.data.quantity } } })
    if (changed.count !== 1) return { status: 409 as const, message: 'Stock insuficiente' }
    const part = await tx.repairPart.create({ data: { repairId: repair.id, stockItemId: item.id, quantity: parsed.data.quantity, unitCost: item.cost, unitPrice: parsed.data.unitPrice, itemNameSnapshot: item.name } })
    return { status: 201 as const, part }
  })
  if ('message' in result) return res.status(result.status).json({ success: false, message: result.message })
  return res.status(201).json(serializePart(result.part))
})
app.delete('/api/repairs/:repairId/parts/:partId', async (req, res) => {
  const businessId = authOf(req).businessId
  const result = await prisma.$transaction(async tx => {
    const repair = await tx.repair.findFirst({ where: { id: req.params.repairId, businessId }, select: { id: true } })
    if (!repair) return false
    const part = await tx.repairPart.findFirst({ where: { id: req.params.partId, repairId: repair.id }, include: { stockItem: true } })
    if (!part || part.stockItem.businessId !== businessId) return false
    await tx.stockItem.update({ where: { id: part.stockItemId }, data: { quantity: { increment: part.quantity } } })
    await tx.repairPart.delete({ where: { id: part.id } })
    return true
  })
  return result ? res.json({ success: true }) : res.status(404).json({ success: false, message: 'Repuesto utilizado no encontrado' })
})

const stockSchema = z.object({ name: z.string().trim().min(2), category: z.string().trim().min(2), compatibleBrand: z.string().optional().nullable(), compatibleModel: z.string().optional().nullable(), quantity: z.number().int().nonnegative(), minimumStock: z.number().int().nonnegative(), cost: z.number().int().nonnegative(), salePrice: z.number().int().nonnegative() })
app.get('/api/stock', async (req, res) => res.json(await prisma.stockItem.findMany({ where: { businessId: authOf(req).businessId, active: true }, orderBy: { name: 'asc' } })))
app.post('/api/stock', requireRole('OWNER'), async (req, res) => {
  const parsed = stockSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos de repuesto inválidos' })
  return res.status(201).json(await prisma.stockItem.create({ data: { businessId: authOf(req).businessId, ...parsed.data } }))
})
app.patch('/api/stock/:id', async (req, res) => {
  const parsed = stockSchema.partial().safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos de repuesto inválidos' })
  if (authOf(req).role !== 'OWNER' && ('cost' in parsed.data || 'salePrice' in parsed.data)) {
    return res.status(403).json({ success: false, message: 'No tenés permisos para editar costes o precios' })
  }
  const item = await prisma.stockItem.findFirst({ where: { id: String(req.params.id), businessId: authOf(req).businessId } })
  if (!item) return res.status(404).json({ success: false, message: 'Repuesto no encontrado' })
  return res.json(await prisma.stockItem.update({ where: { id: item.id }, data: parsed.data }))
})
app.delete('/api/stock/:id', requireRole('OWNER'), async (req, res) => {
  const item = await prisma.stockItem.findFirst({ where: { id: String(req.params.id), businessId: authOf(req).businessId } })
  if (!item) return res.status(404).json({ success: false, message: 'Repuesto no encontrado' })
  await prisma.stockItem.update({ where: { id: item.id }, data: { active: false } })
  return res.status(204).send()
})

app.get('/api/cash/movements', requireRole('OWNER'), async (req, res) => res.json(await prisma.cashMovement.findMany({ where: { businessId: authOf(req).businessId }, orderBy: { createdAt: 'desc' } })))
app.post('/api/cash/movements', requireRole('OWNER'), async (req, res) => {
  const parsed = z.object({ type: z.nativeEnum(CashMovementType), description: z.string().trim().min(2), amount: z.number().int().positive(), method: z.nativeEnum(PaymentMethod).optional() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Movimiento inválido' })
  return res.status(201).json(await prisma.cashMovement.create({ data: { businessId: authOf(req).businessId, ...parsed.data } }))
})
app.get('/api/dashboard/summary', async (req, res) => {
  const businessId = authOf(req).businessId
  const canViewFinancials = authOf(req).role === 'OWNER'
  const now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate()), month = new Date(now.getFullYear(), now.getMonth(), 1)
  const [repairs, clients, payments] = await Promise.all([
    prisma.repair.findMany({ where: { businessId }, include: { client: true }, orderBy: { createdAt: 'desc' } }),
    prisma.client.count({ where: { businessId } }),
    canViewFinancials
      ? prisma.payment.aggregate({ where: { businessId, createdAt: { gte: month } }, _sum: { amount: true } })
      : Promise.resolve({ _sum: { amount: null } }),
  ])
  return res.json({ activeRepairs: repairs.filter(r => r.status !== 'DELIVERED').length, repairsToday: repairs.filter(r => r.createdAt >= today).length, monthlyIncome: payments._sum.amount ?? 0, clients, byStatus: Object.values(RepairStatus).map(status => ({ status, value: repairs.filter(r => r.status === status).length })), recentRepairs: repairs.slice(0, 5) })
})

const port = Number(process.env.PORT ?? 3000)
app.listen(port, () => console.log(`CelluFix API running on http://localhost:${port}`))
