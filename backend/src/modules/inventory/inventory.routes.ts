import { Router } from 'express'
import { Prisma, type InventoryMovement, type StockItem } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { authOf, requireRole } from '../../middlewares/auth'
import { inventoryCategories, movementFromPrisma, movementToPrisma } from './inventory.constants'

export const inventoryRouter = Router()

const nullableText = z.string().trim().max(300).optional().nullable()
const itemSchema = z.object({
  sku: z.string().trim().max(80).optional().nullable(),
  name: z.string().trim().min(2).max(160),
  category: z.enum(inventoryCategories),
  brand: nullableText,
  compatibleModels: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  quality: nullableText,
  supplier: nullableText,
  purchaseCost: z.number().int().nonnegative(),
  salePrice: z.number().int().nonnegative().optional().nullable(),
  currentStock: z.number().int().nonnegative().default(0),
  minimumStock: z.number().int().nonnegative().default(0),
  notes: z.string().trim().max(2000).optional().nullable(),
})

const cleanNullable = (value?: string | null) => value?.trim() || null
const cleanSku = (value?: string | null) => cleanNullable(value)?.toUpperCase() ?? null

export const serializeInventoryItem = (item: StockItem) => ({
  id: item.id,
  sku: item.sku,
  name: item.name,
  category: item.category,
  brand: item.compatibleBrand,
  compatibleModels: item.compatibleModels,
  quality: item.quality,
  supplier: item.supplier,
  purchaseCost: item.cost,
  salePrice: item.salePrice,
  currentStock: item.quantity,
  minimumStock: item.minimumStock,
  notes: item.notes,
  isActive: item.active,
  isLowStock: item.quantity <= item.minimumStock,
  isOutOfStock: item.quantity === 0,
  inventoryValue: item.quantity * item.cost,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
})

export const serializeInventoryMovement = (movement: InventoryMovement) => ({
  ...movement,
  inventoryItemId: movement.stockItemId,
  type: movementFromPrisma(movement.type),
})

const itemData = (data: z.infer<typeof itemSchema>) => ({
  sku: cleanSku(data.sku),
  name: data.name,
  category: data.category,
  compatibleBrand: cleanNullable(data.brand),
  compatibleModel: data.compatibleModels[0] ?? null,
  compatibleModels: [...new Set(data.compatibleModels.map(model => model.trim()))],
  quality: cleanNullable(data.quality),
  supplier: cleanNullable(data.supplier),
  cost: data.purchaseCost,
  salePrice: data.salePrice ?? 0,
  quantity: data.currentStock,
  minimumStock: data.minimumStock,
  notes: cleanNullable(data.notes),
})

inventoryRouter.get('/summary', async (req, res) => {
  const businessId = authOf(req).businessId
  const [items, recentMovements] = await Promise.all([
    prisma.stockItem.findMany({ where: { businessId, active: true } }),
    prisma.inventoryMovement.findMany({ where: { businessId }, include: { stockItem: { select: { name: true, sku: true } } }, orderBy: { createdAt: 'desc' }, take: 8 }),
  ])
  return res.json({
    totalItems: items.length,
    totalUnits: items.reduce((sum, item) => sum + item.quantity, 0),
    lowStockItems: items.filter(item => item.quantity > 0 && item.quantity <= item.minimumStock).length,
    outOfStockItems: items.filter(item => item.quantity === 0).length,
    inventoryValue: items.reduce((sum, item) => sum + item.quantity * item.cost, 0),
    recentMovements: recentMovements.map(movement => ({ ...serializeInventoryMovement(movement), item: movement.stockItem })),
  })
})

inventoryRouter.get('/low-stock', async (req, res) => {
  const items = await prisma.stockItem.findMany({ where: { businessId: authOf(req).businessId, active: true }, orderBy: { name: 'asc' } })
  return res.json(items.filter(item => item.quantity <= item.minimumStock).map(serializeInventoryItem))
})

inventoryRouter.get('/', async (req, res) => {
  const parsed = z.object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().optional(),
    category: z.enum(inventoryCategories).optional(),
    stock: z.enum(['all', 'low', 'out']).default('all'),
    active: z.enum(['true', 'false', 'all']).default('true'),
    sortBy: z.enum(['name', 'stock', 'updatedAt']).default('name'),
    order: z.enum(['asc', 'desc']).default('asc'),
  }).safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Filtros de inventario inválidos' })
  const { page, pageSize, search, category, stock, active, sortBy, order } = parsed.data
  const where: Prisma.StockItemWhereInput = {
    businessId: authOf(req).businessId,
    ...(active === 'all' ? {} : { active: active === 'true' }),
    ...(category ? { category } : {}),
    ...(search ? { OR: [
      { name: { contains: search, mode: 'insensitive' } },
      { sku: { contains: search, mode: 'insensitive' } },
      { compatibleBrand: { contains: search, mode: 'insensitive' } },
      { compatibleModel: { contains: search, mode: 'insensitive' } },
    ] } : {}),
  }
  const orderBy: Prisma.StockItemOrderByWithRelationInput = sortBy === 'stock' ? { quantity: order } : sortBy === 'updatedAt' ? { updatedAt: order } : { name: order }
  const rows = await prisma.stockItem.findMany({ where, orderBy })
  const filtered = rows.filter(item => stock === 'all' || (stock === 'out' ? item.quantity === 0 : item.quantity > 0 && item.quantity <= item.minimumStock))
  const total = filtered.length
  const items = filtered.slice((page - 1) * pageSize, page * pageSize)
  return res.json({ items: items.map(serializeInventoryItem), total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) })
})

inventoryRouter.post('/', requireRole('OWNER'), async (req, res) => {
  const parsed = itemSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos del repuesto inválidos', issues: parsed.error.flatten().fieldErrors })
  const auth = authOf(req)
  try {
    const item = await prisma.$transaction(async tx => {
      const created = await tx.stockItem.create({ data: { businessId: auth.businessId, ...itemData(parsed.data) } })
      if (created.quantity > 0) await tx.inventoryMovement.create({ data: {
        businessId: auth.businessId, stockItemId: created.id, type: 'INITIAL_STOCK', quantity: created.quantity,
        unitCost: created.cost, totalCost: created.quantity * created.cost, previousStock: 0, newStock: created.quantity,
        notes: 'Stock inicial', createdByUserId: auth.userId,
      } })
      return created
    })
    return res.status(201).json(serializeInventoryItem(item))
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return res.status(409).json({ success: false, message: 'El SKU ya existe en este negocio' })
    throw error
  }
})

inventoryRouter.get('/:id', async (req, res) => {
  const businessId = authOf(req).businessId
  const item = await prisma.stockItem.findFirst({ where: { id: String(req.params.id), businessId }, include: {
    movements: { orderBy: { createdAt: 'desc' }, take: 100 },
    repairParts: { orderBy: { createdAt: 'desc' }, take: 50, include: { repair: { select: { id: true, number: true, deviceBrand: true, deviceModel: true } } } },
  } })
  if (!item) return res.status(404).json({ success: false, message: 'Repuesto no encontrado' })
  return res.json({ ...serializeInventoryItem(item), movements: item.movements.map(serializeInventoryMovement), repairs: item.repairParts.map(part => ({ repairPartId: part.id, quantity: part.quantity, unitCost: part.unitCost, createdAt: part.createdAt, repair: part.repair })) })
})

inventoryRouter.patch('/:id', requireRole('OWNER'), async (req, res) => {
  const parsed = itemSchema.omit({ currentStock: true }).partial().safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos del repuesto inválidos' })
  const businessId = authOf(req).businessId
  const current = await prisma.stockItem.findFirst({ where: { id: String(req.params.id), businessId } })
  if (!current) return res.status(404).json({ success: false, message: 'Repuesto no encontrado' })
  const data = parsed.data
  try {
    const item = await prisma.stockItem.update({ where: { id: current.id }, data: {
      ...(data.sku !== undefined ? { sku: cleanSku(data.sku) } : {}),
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.category !== undefined ? { category: data.category } : {}),
      ...(data.brand !== undefined ? { compatibleBrand: cleanNullable(data.brand) } : {}),
      ...(data.compatibleModels !== undefined ? { compatibleModels: [...new Set(data.compatibleModels)], compatibleModel: data.compatibleModels[0] ?? null } : {}),
      ...(data.quality !== undefined ? { quality: cleanNullable(data.quality) } : {}),
      ...(data.supplier !== undefined ? { supplier: cleanNullable(data.supplier) } : {}),
      ...(data.purchaseCost !== undefined ? { cost: data.purchaseCost } : {}),
      ...(data.salePrice !== undefined ? { salePrice: data.salePrice ?? 0 } : {}),
      ...(data.minimumStock !== undefined ? { minimumStock: data.minimumStock } : {}),
      ...(data.notes !== undefined ? { notes: cleanNullable(data.notes) } : {}),
    } })
    return res.json(serializeInventoryItem(item))
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return res.status(409).json({ success: false, message: 'El SKU ya existe en este negocio' })
    throw error
  }
})

inventoryRouter.patch('/:id/deactivate', requireRole('OWNER'), async (req, res) => {
  const item = await prisma.stockItem.findFirst({ where: { id: String(req.params.id), businessId: authOf(req).businessId } })
  if (!item) return res.status(404).json({ success: false, message: 'Repuesto no encontrado' })
  return res.json(serializeInventoryItem(await prisma.stockItem.update({ where: { id: item.id }, data: { active: false } })))
})

inventoryRouter.get('/:id/movements', async (req, res) => {
  const businessId = authOf(req).businessId
  const item = await prisma.stockItem.findFirst({ where: { id: String(req.params.id), businessId }, select: { id: true } })
  if (!item) return res.status(404).json({ success: false, message: 'Repuesto no encontrado' })
  const movements = await prisma.inventoryMovement.findMany({ where: { stockItemId: item.id, businessId }, orderBy: { createdAt: 'desc' }, take: 200 })
  return res.json(movements.map(serializeInventoryMovement))
})

inventoryRouter.post('/:id/movements', requireRole('OWNER'), async (req, res) => {
  const parsed = z.object({
    type: z.enum(['purchase', 'manual_entry', 'adjustment_in', 'adjustment_out', 'return', 'damaged']),
    quantity: z.number().int().positive(),
    unitCost: z.number().int().nonnegative().optional(),
    supplier: z.string().trim().max(300).optional(),
    notes: z.string().trim().min(2).max(1000),
  }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Movimiento de inventario inválido' })
  const auth = authOf(req)
  const subtracts = parsed.data.type === 'adjustment_out' || parsed.data.type === 'damaged'
  const result = await prisma.$transaction(async tx => {
    const item = await tx.stockItem.findFirst({ where: { id: String(req.params.id), businessId: auth.businessId } })
    if (!item) return { status: 404 as const, message: 'Repuesto no encontrado' }
    if (!item.active) return { status: 400 as const, message: 'El repuesto está inactivo' }
    if (subtracts && item.quantity < parsed.data.quantity) return { status: 409 as const, message: 'Stock insuficiente' }
    const newStock = item.quantity + (subtracts ? -parsed.data.quantity : parsed.data.quantity)
    const changed = await tx.stockItem.updateMany({ where: { id: item.id, businessId: auth.businessId, quantity: item.quantity }, data: { quantity: newStock, ...(parsed.data.type === 'purchase' && parsed.data.unitCost !== undefined ? { cost: parsed.data.unitCost, supplier: cleanNullable(parsed.data.supplier) } : {}) } })
    if (changed.count !== 1) return { status: 409 as const, message: 'El stock cambió durante la operación. Intentá nuevamente.' }
    const unitCost = parsed.data.unitCost ?? item.cost
    const movement = await tx.inventoryMovement.create({ data: {
      businessId: auth.businessId, stockItemId: item.id, type: movementToPrisma(parsed.data.type),
      quantity: parsed.data.quantity, unitCost, totalCost: unitCost * parsed.data.quantity,
      previousStock: item.quantity, newStock, notes: parsed.data.notes, createdByUserId: auth.userId,
    } })
    return { status: 201 as const, movement }
  })
  if ('message' in result) return res.status(result.status).json({ success: false, message: result.message })
  return res.status(201).json(serializeInventoryMovement(result.movement))
})
