import { Router, type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import { authOf, requirePermission } from '../../middlewares/auth'
import { assertFeatureAccess } from '../billing/billing.service'
import { CommerceError, createCommerceExpense, createCommerceSale, getCommerceSummary, listCommerceProducts } from './commerce.service'
import { prisma } from '../../lib/prisma'

const paymentMethod = z.enum(['CASH', 'TRANSFER', 'CARD', 'OTHER'])
const requireCommerce = async (req: Request, res: Response, next: NextFunction) => {
  try { await assertFeatureAccess(authOf(req).businessId, 'commerce'); return next() }
  catch (error) {
    const status = typeof error === 'object' && error && 'statusCode' in error ? Number(error.statusCode) : 500
    return res.status(status).json({ success: false, message: error instanceof Error ? error.message : 'No pudimos validar el acceso a Comercio.' })
  }
}

export const commerceRouter = Router()
commerceRouter.use(requireCommerce)

commerceRouter.get('/categories', requirePermission('commerce.view'), async (req, res) => {
  const businessId = authOf(req).businessId
  const [categories, counts] = await Promise.all([
    prisma.commerceCategory.findMany({ where: { businessId }, orderBy: { name: 'asc' } }),
    prisma.commerceProduct.groupBy({ by: ['category'], where: { businessId, active: true }, _count: { _all: true } }),
  ])
  const countByName = new Map(counts.map(row => [row.category, row._count._all]))
  const known = new Set(categories.map(category => category.name))
  const productCategories = counts.filter(row => !known.has(row.category)).map(row => ({ id: `product-category-${row.category}`, businessId, name: row.category, createdAt: new Date(), updatedAt: new Date() }))
  return res.json([...categories, ...productCategories].map(category => ({ ...category, productCount: countByName.get(category.name) ?? 0 })))
})

commerceRouter.post('/categories', requirePermission('commerce.manage'), async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(80) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'El nombre de la categoría es inválido' })
  try {
    return res.status(201).json(await prisma.commerceCategory.create({ data: { businessId: authOf(req).businessId, name: parsed.data.name } }))
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') return res.status(409).json({ success: false, message: 'Esa categoría ya existe' })
    throw error
  }
})

commerceRouter.patch('/categories/:id', requirePermission('commerce.manage'), async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(80) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'El nombre de la categoría es inválido' })
  const businessId = authOf(req).businessId
  const id = String(req.params.id)
  try {
    const category = await prisma.$transaction(async tx => {
      const stored = await tx.commerceCategory.findFirst({ where: { id, businessId } })
      // Older products may have a category name without a CommerceCategory row.
      const legacyName = id.startsWith('product-category-') ? id.slice('product-category-'.length) : ''
      const legacy = !stored && legacyName ? await tx.commerceProduct.findFirst({ where: { businessId, category: legacyName, active: true } }) : null
      if (!stored && !legacy) throw new CommerceError(404, 'Categoría no encontrada')
      const oldName = stored?.name ?? legacy!.category
      const name = parsed.data.name
      if (name !== oldName) {
        const duplicate = await tx.commerceProduct.findFirst({ where: { businessId, category: name } })
        if (duplicate) throw new CommerceError(409, 'Esa categoría ya existe')
      }
      const updated = stored
        ? await tx.commerceCategory.update({ where: { id: stored.id }, data: { name } })
        : await tx.commerceCategory.create({ data: { businessId, name } })
      await tx.commerceProduct.updateMany({ where: { businessId, category: oldName }, data: { category: name } })
      const productCount = await tx.commerceProduct.count({ where: { businessId, category: name, active: true } })
      return { ...updated, productCount }
    })
    return res.json(category)
  } catch (error) {
    if (error instanceof CommerceError) return res.status(error.status).json({ success: false, message: error.message })
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') return res.status(409).json({ success: false, message: 'Esa categoría ya existe' })
    throw error
  }
})

commerceRouter.delete('/categories/:id', requirePermission('commerce.manage'), async (req, res) => {
  const category = await prisma.commerceCategory.findFirst({ where: { id: String(req.params.id), businessId: authOf(req).businessId } })
  if (!category) return res.status(404).json({ success: false, message: 'Categoría no encontrada' })
  const products = await prisma.commerceProduct.count({ where: { businessId: category.businessId, category: category.name, active: true } })
  if (products) return res.status(409).json({ success: false, message: 'No podés eliminar una categoría con productos. Reasigná esos productos primero.' })
  await prisma.commerceCategory.delete({ where: { id: category.id } })
  return res.json({ success: true })
})

commerceRouter.get('/products', requirePermission('commerce.view'), async (req, res) => {
  const parsed = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20), search: z.string().trim().max(120).optional(), category: z.string().trim().max(80).optional(), inStock: z.enum(['true', 'false']).optional().transform(value => value === 'true') }).safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Filtros de productos inválidos' })
  return res.json(await listCommerceProducts(authOf(req).businessId, parsed.data))
})

commerceRouter.post('/products', requirePermission('commerce.manage'), async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(120), category: z.string().trim().min(2).max(80), purchaseCost: z.number().int().min(0).max(2147483647), salePrice: z.number().int().min(1).max(2147483647), currentStock: z.number().int().min(0).max(2147483647).default(0) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos de producto inválidos' })
  if (parsed.data.salePrice < parsed.data.purchaseCost) return res.status(400).json({ success: false, message: 'El precio de venta no puede ser menor que el costo' })
  return res.status(201).json(await prisma.commerceProduct.create({ data: { businessId: authOf(req).businessId, ...parsed.data }, }))
})

commerceRouter.patch('/products/:id', requirePermission('commerce.manage'), async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(120), category: z.string().trim().min(2).max(80), purchaseCost: z.number().int().min(0).max(2147483647), salePrice: z.number().int().min(1).max(2147483647), currentStock: z.number().int().min(0).max(2147483647), active: z.boolean().optional(), expectedStock: z.number().int().min(0).max(2147483647) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos de producto inválidos' })
  if (parsed.data.salePrice < parsed.data.purchaseCost) return res.status(400).json({ success: false, message: 'El precio de venta no puede ser menor que el costo' })
  const current = await prisma.commerceProduct.findFirst({ where: { id: String(req.params.id), businessId: authOf(req).businessId } })
  if (!current) return res.status(404).json({ success: false, message: 'Producto no encontrado' })
  const { expectedStock, ...data } = parsed.data
  const changed = await prisma.commerceProduct.updateMany({ where: { id: current.id, businessId: current.businessId, currentStock: expectedStock }, data })
  if (!changed.count) return res.status(409).json({ success: false, message: 'El stock cambió mientras editabas. Volvé a abrir el producto antes de guardar.' })
  return res.json(await prisma.commerceProduct.findUniqueOrThrow({ where: { id: current.id } }))
})

commerceRouter.delete('/products/:id', requirePermission('commerce.manage'), async (req, res) => {
  const product = await prisma.commerceProduct.findFirst({ where: { id: String(req.params.id), businessId: authOf(req).businessId, active: true } })
  if (!product) return res.status(404).json({ success: false, message: 'Producto no encontrado' })
  const sales = await prisma.commerceSaleLine.count({ where: { productId: product.id } })
  if (sales) return res.json(await prisma.commerceProduct.update({ where: { id: product.id }, data: { active: false } }))
  await prisma.commerceProduct.delete({ where: { id: product.id } })
  return res.json({ success: true })
})

commerceRouter.get('/sales', requirePermission('commerce.view'), async (req, res) => {
  const parsed = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) }).safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Paginación inválida' })
  const where = { businessId: authOf(req).businessId }
  const [items, total] = await prisma.$transaction([
    prisma.commerceSale.findMany({ where, include: { lines: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (parsed.data.page - 1) * parsed.data.pageSize, take: parsed.data.pageSize }),
    prisma.commerceSale.count({ where }),
  ])
  return res.json({ items, total, page: parsed.data.page, pageSize: parsed.data.pageSize, pages: Math.max(1, Math.ceil(total / parsed.data.pageSize)) })
})

commerceRouter.post('/sales', requirePermission('commerce.sell'), async (req, res) => {
  const parsed = z.object({ lines: z.array(z.object({ productId: z.string().min(1), quantity: z.number().int().min(1).max(2147483647), expectedUnitPrice: z.number().int().min(1).max(2147483647) })).min(1).max(100), paymentMethod, expectedTotal: z.number().int().min(1).max(2147483647), idempotencyKey: z.string().uuid() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos de venta inválidos' })
  try { return res.status(201).json(await createCommerceSale(authOf(req).businessId, parsed.data)) }
  catch (error) {
    if (error instanceof CommerceError) return res.status(error.status).json({ success: false, message: error.message })
    console.error('Error creando venta de Comercio', error)
    return res.status(500).json({ success: false, message: 'No pudimos confirmar la venta.' })
  }
})

commerceRouter.post('/expenses', requirePermission('commerce.manage'), async (req, res) => {
  const parsed = z.object({ description: z.string().trim().min(2).max(160), amount: z.number().int().min(1).max(2147483647), paymentMethod }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos de egreso comercial inválidos' })
  return res.status(201).json(await createCommerceExpense(authOf(req).businessId, parsed.data))
})

commerceRouter.get('/summary', requirePermission('commerce.view'), async (req, res) => {
  const parsed = z.object({ from: z.coerce.date().default(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), to: z.coerce.date().default(new Date()) }).safeParse(req.query)
  if (!parsed.success || parsed.data.from >= parsed.data.to) return res.status(400).json({ success: false, message: 'Período comercial inválido' })
  return res.json(await getCommerceSummary(authOf(req).businessId, parsed.data))
})
