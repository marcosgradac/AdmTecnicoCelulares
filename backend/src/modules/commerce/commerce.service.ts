import { PaymentMethod, type Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'

export class CommerceError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
  }
}

export interface CommerceSaleInput {
  lines: Array<{ productId: string; quantity: number; expectedUnitPrice: number }>
  paymentMethod: PaymentMethod
  expectedTotal: number
  idempotencyKey: string
}

export async function listCommerceProducts(businessId: string, input: { page: number; pageSize: number; search?: string; category?: string; inStock?: boolean }) {
  const where = {
    businessId,
    active: true,
    ...(input.search ? { OR: [{ name: { contains: input.search, mode: 'insensitive' as const } }, { category: { contains: input.search, mode: 'insensitive' as const } }] } : {}),
    ...(input.category ? { category: input.category } : {}),
    ...(input.inStock ? { currentStock: { gt: 0 } } : {}),
  }
  const [items, total] = await prisma.$transaction([
    prisma.commerceProduct.findMany({ where, orderBy: [{ currentStock: 'asc' }, { name: 'asc' }, { id: 'asc' }], skip: (input.page - 1) * input.pageSize, take: input.pageSize }),
    prisma.commerceProduct.count({ where }),
  ])
  return { items: items.map(product => ({ ...product, unitProfit: product.salePrice - product.purchaseCost })), total, page: input.page, pageSize: input.pageSize, pages: Math.max(1, Math.ceil(total / input.pageSize)) }
}

export async function createCommerceSale(businessId: string, input: CommerceSaleInput) {
  const grouped = new Map<string, { quantity: number; expectedUnitPrice: number }>()
  for (const line of input.lines) {
    const previous = grouped.get(line.productId)
    if (previous && previous.expectedUnitPrice !== line.expectedUnitPrice) throw new CommerceError(409, 'El mismo producto tiene precios esperados diferentes.')
    grouped.set(line.productId, { quantity: (previous?.quantity ?? 0) + line.quantity, expectedUnitPrice: line.expectedUnitPrice })
  }
  const requested = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([productId, values]) => ({ productId, ...values }))
  if (!requested.length) throw new CommerceError(400, 'Agregá al menos un producto a la venta')
  const findExisting = () => prisma.commerceSale.findUnique({ where: { businessId_idempotencyKey: { businessId, idempotencyKey: input.idempotencyKey } }, include: { lines: true } })
  const replay = (sale: Prisma.CommerceSaleGetPayload<{ include: { lines: true } }>) => {
    const sameLines = sale.lines.length === requested.length && requested.every(line => sale.lines.some(saved => saved.productId === line.productId && saved.quantity === line.quantity && saved.unitPrice === line.expectedUnitPrice))
    if (!sameLines || sale.total !== input.expectedTotal || sale.paymentMethod !== input.paymentMethod) throw new CommerceError(409, 'La clave de confirmación ya fue utilizada para otra venta.')
    return sale
  }
  const existing = await findExisting()
  if (existing) return replay(existing)
  try {
    return await prisma.$transaction(async tx => {
      const products = await tx.commerceProduct.findMany({ where: { businessId, active: true, id: { in: requested.map(line => line.productId) } } })
      const byId = new Map(products.map(product => [product.id, product]))
      const lines = requested.map(line => {
        const product = byId.get(line.productId)
        if (!product) throw new CommerceError(404, 'Uno de los productos no existe o está inactivo')
        if (product.salePrice !== line.expectedUnitPrice) throw new CommerceError(409, `Cambió el precio de ${product.name}. Quitalo del carrito y agregalo nuevamente.`)
        if (product.currentStock < line.quantity) throw new CommerceError(409, `Stock insuficiente para ${product.name}`)
        return { product, quantity: line.quantity }
      })
      const totals = lines.reduce((sum, line) => ({ total: sum.total + line.product.salePrice * line.quantity, cost: sum.cost + line.product.purchaseCost * line.quantity }), { total: 0, cost: 0 })
      if (input.expectedTotal !== totals.total) throw new CommerceError(409, 'El total esperado no coincide con el total vigente. Revisá la venta.')
      if (!Number.isSafeInteger(totals.total) || !Number.isSafeInteger(totals.cost) || totals.total > 2147483647 || totals.cost > 2147483647) throw new CommerceError(400, 'El importe de la venta supera el máximo permitido.')
      const sale = await tx.commerceSale.create({ data: { businessId, idempotencyKey: input.idempotencyKey, total: totals.total, costOfGoodsSold: totals.cost, profit: totals.total - totals.cost, paymentMethod: input.paymentMethod } })
      for (const line of lines) {
        const updated = await tx.commerceProduct.updateMany({ where: { id: line.product.id, businessId, active: true, salePrice: line.product.salePrice, purchaseCost: line.product.purchaseCost, currentStock: { gte: line.quantity } }, data: { currentStock: { decrement: line.quantity } } })
        if (updated.count !== 1) throw new CommerceError(409, `El stock de ${line.product.name} cambió. Revisá la venta e intentá nuevamente.`)
        await tx.commerceSaleLine.create({ data: { saleId: sale.id, productId: line.product.id, productName: line.product.name, quantity: line.quantity, unitCost: line.product.purchaseCost, unitPrice: line.product.salePrice, lineTotal: line.product.salePrice * line.quantity, lineCost: line.product.purchaseCost * line.quantity, lineProfit: (line.product.salePrice - line.product.purchaseCost) * line.quantity } })
      }
      await tx.cashMovement.create({ data: { businessId, type: 'INCOME', origin: 'COMMERCE', description: `Venta de comercio #${sale.id.slice(-6)}`, amount: sale.total, method: sale.paymentMethod, commerceSaleId: sale.id } })
      return tx.commerceSale.findUniqueOrThrow({ where: { id: sale.id }, include: { lines: true } })
      }, { timeout: 15_000 })
  } catch (error) {
    // Another request may have committed this key while this transaction waited.
    // Read only after rollback: the unique constraint also prevents duplicate stock/cash writes.
    const committed = await findExisting()
    if (committed) return replay(committed)
    throw error
  }
}

export async function createCommerceExpense(businessId: string, input: { description: string; amount: number; paymentMethod: PaymentMethod }) {
  return prisma.cashMovement.create({ data: { businessId, type: 'EXPENSE', origin: 'COMMERCE', description: input.description, amount: input.amount, method: input.paymentMethod } })
}

export async function getCommerceSummary(businessId: string, input: { from: Date; to: Date }) {
  const range = { gte: input.from, lt: input.to }
  const [sales, expense, products] = await Promise.all([
    prisma.commerceSale.aggregate({ where: { businessId, createdAt: range }, _sum: { total: true, costOfGoodsSold: true, profit: true }, _count: { _all: true } }),
    prisma.cashMovement.aggregate({ where: { businessId, origin: 'COMMERCE', type: 'EXPENSE', createdAt: range }, _sum: { amount: true } }),
    prisma.commerceProduct.count({ where: { businessId, active: true } }),
  ])
  return { sales: sales._count._all, revenue: sales._sum.total ?? 0, costOfGoodsSold: sales._sum.costOfGoodsSold ?? 0, profit: sales._sum.profit ?? 0, commercialExpenses: expense._sum.amount ?? 0, netProfit: (sales._sum.profit ?? 0) - (expense._sum.amount ?? 0), products }
}
