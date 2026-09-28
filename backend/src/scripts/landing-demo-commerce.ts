import { randomUUID } from 'node:crypto'
import type { CommerceProduct, PaymentMethod, Prisma, ResaleDeviceStatus } from '@prisma/client'

const DAY = 86_400_000
const ARGENTINA_OFFSET = 3 * 60 * 60 * 1000

// Prices are integer ARS, matching the commerce and equipment route validators.
const products: ReadonlyArray<readonly [string, string, number, number, number]> = [
  ['Cargador USB-C 20 W', 'Cargadores', 6500, 11900, 18],
  ['Cargador rápido 25 W', 'Cargadores', 9200, 16900, 12],
  ['Cargador dual USB de pared', 'Cargadores', 4800, 8900, 22],
  ['Cargador para auto USB-C', 'Cargadores', 5700, 10900, 8],
  ['Base de carga inalámbrica', 'Cargadores', 11500, 19900, 3],
  ['Cargador USB-C 45 W', 'Cargadores', 14500, 24900, 6],
  ['Cable USB-C reforzado 1 m', 'Cables', 2200, 4900, 30],
  ['Cable USB-C a USB-C 2 m', 'Cables', 4100, 7900, 16],
  ['Cable Lightning trenzado', 'Cables', 3600, 6900, 14],
  ['Cable micro USB 1 m', 'Cables', 1400, 3200, 24],
  ['Cable USB-C 60 W', 'Cables', 3900, 7500, 4],
  ['Cable auxiliar de audio', 'Cables', 1800, 3900, 10],
  ['Funda transparente Samsung A15', 'Fundas', 2100, 5500, 11],
  ['Funda reforzada Motorola G54', 'Fundas', 3200, 6900, 7],
  ['Funda silicona iPhone 13', 'Fundas', 3800, 8500, 9],
  ['Funda transparente Redmi Note 13', 'Fundas', 2400, 5900, 5],
  ['Funda reforzada Samsung A25', 'Fundas', 3500, 7500, 3],
  ['Funda silicona iPhone 14', 'Fundas', 4200, 8900, 8],
  ['Vidrio templado Samsung A15', 'Vidrios templados', 1100, 3900, 25],
  ['Vidrio templado Motorola G54', 'Vidrios templados', 1100, 3900, 19],
  ['Vidrio templado iPhone 13', 'Vidrios templados', 1400, 4500, 15],
  ['Vidrio templado Redmi Note 13', 'Vidrios templados', 1300, 4200, 4],
  ['Vidrio privacidad iPhone 14', 'Vidrios templados', 2700, 6900, 6],
  ['Auriculares con cable USB-C', 'Accesorios', 5100, 9900, 12],
  ['Soporte de escritorio plegable', 'Accesorios', 2800, 5900, 20],
  ['Adaptador USB-C a USB', 'Accesorios', 1900, 4500, 3],
  ['Auriculares inalámbricos compactos', 'Accesorios', 13500, 23900, 0],
  ['Batería externa 10000 mAh', 'Accesorios', 14500, 25900, 0],
]

const categories = [
  ['Cargadores', 'charger'], ['Cables', 'cable'], ['Fundas', 'case'],
  ['Vidrios templados', 'screen-protector'], ['Accesorios', 'earbuds'],
] as const

const devices: ReadonlyArray<readonly [string, string, ResaleDeviceStatus, number, number, number]> = [
  ['Samsung', 'Galaxy A14 128 GB', 'PURCHASED', 78000, 0, 145000],
  ['Motorola', 'Moto G32 128 GB', 'PURCHASED', 65000, 0, 125000],
  ['Xiaomi', 'Redmi Note 11 128 GB', 'PURCHASED', 82000, 0, 155000],
  ['Samsung', 'Galaxy A24 128 GB', 'REPAIRING', 100000, 28000, 190000],
  ['Motorola', 'Moto G54 128 GB', 'REPAIRING', 95000, 24000, 185000],
  ['Apple', 'iPhone 11 64 GB', 'REPAIRING', 165000, 35000, 285000],
  ['Samsung', 'Galaxy A34 128 GB', 'READY_FOR_SALE', 145000, 22000, 240000],
  ['Motorola', 'Edge 30 Neo 128 GB', 'READY_FOR_SALE', 135000, 18000, 225000],
  ['Apple', 'iPhone 12 128 GB', 'READY_FOR_SALE', 230000, 32000, 360000],
  ['Samsung', 'Galaxy A23 128 GB', 'SOLD', 90000, 18000, 170000],
  ['Motorola', 'Moto G84 256 GB', 'SOLD', 145000, 15000, 235000],
  ['Apple', 'iPhone 13 128 GB', 'SOLD', 285000, 25000, 425000],
]

/** All writes use the caller's transaction; never invoke global-prisma services here. */
export async function seedLandingCommerce(tx: Prisma.TransactionClient, businessId: string, now: Date): Promise<void> {
  const argentinaNow = new Date(now.getTime() - ARGENTINA_OFFSET)
  const monthStart = Date.UTC(argentinaNow.getUTCFullYear(), argentinaNow.getUTCMonth(), 1) + ARGENTINA_OFFSET
  const inMonth = (fraction: number) => new Date(monthStart + Math.floor((now.getTime() - monthStart) * fraction))
  const historic = (days: number) => new Date(now.getTime() - days * DAY)
  const methods: PaymentMethod[] = ['CASH', 'TRANSFER', 'CARD']
  const cancelledIndex = 4
  const sales = Array.from({ length: 15 }, (_, index) => ({
    createdAt: inMonth((index + 1) / 15),
    paymentMethod: methods[index % methods.length],
    lines: [
      { productIndex: index % 24, quantity: 1 + index % 3 },
      { productIndex: (index + 8) % 24, quantity: 1 },
    ],
  }))

  for (const [name, iconKey] of categories) {
    await tx.commerceCategory.create({ data: { businessId, name, iconKey, createdAt: historic(50), updatedAt: historic(50) } })
  }
  const savedProducts: CommerceProduct[] = []
  for (const [index, [name, category, purchaseCost, salePrice, finalStock]] of products.entries()) {
    const netSold = sales.reduce((sum, sale, saleIndex) => sum + (saleIndex === cancelledIndex ? 0 : sale.lines.reduce((quantity, line) => quantity + (line.productIndex === index ? line.quantity : 0), 0)), 0)
    savedProducts.push(await tx.commerceProduct.create({ data: {
      businessId, name, category, purchaseCost, salePrice, currentStock: finalStock + netSold,
      minimumStock: 3, createdAt: historic(50), updatedAt: historic(50),
    } }))
  }

  // Mirrors modules/commerce/commerce.service.ts: immutable line snapshots,
  // one income per sale, stock decremented on sale and restored on cancellation.
  for (const [index, fixture] of sales.entries()) {
    const lines = fixture.lines.map(({ productIndex, quantity }) => {
      const product = savedProducts[productIndex]
      return {
        productId: product.id, productName: product.name, quantity,
        unitCost: product.purchaseCost, unitPrice: product.salePrice,
        lineTotal: product.salePrice * quantity, lineCost: product.purchaseCost * quantity,
        lineProfit: (product.salePrice - product.purchaseCost) * quantity,
      }
    })
    const total = lines.reduce((sum, line) => sum + line.lineTotal, 0)
    const costOfGoodsSold = lines.reduce((sum, line) => sum + line.lineCost, 0)
    const sale = await tx.commerceSale.create({ data: {
      businessId, idempotencyKey: randomUUID(), total, costOfGoodsSold, profit: total - costOfGoodsSold,
      paymentMethod: fixture.paymentMethod, createdAt: fixture.createdAt, lines: { create: lines },
    } })
    for (const line of lines) {
      const changed = await tx.commerceProduct.updateMany({
        where: { id: line.productId, businessId, currentStock: { gte: line.quantity } },
        data: { currentStock: { decrement: line.quantity }, updatedAt: fixture.createdAt },
      })
      if (changed.count !== 1) throw new Error('Stock insuficiente en el fixture de comercio.')
    }
    await tx.cashMovement.create({ data: {
      businessId, type: 'INCOME', origin: 'COMMERCE', description: `Venta de comercio #${sale.id.slice(-6)}`,
      amount: total, method: fixture.paymentMethod, commerceSaleId: sale.id, createdAt: fixture.createdAt,
    } })
    if (index === cancelledIndex) {
      await tx.commerceSale.update({ where: { id: sale.id }, data: { cancelledAt: fixture.createdAt } })
      for (const line of lines) {
        await tx.commerceProduct.update({ where: { id: line.productId }, data: { currentStock: { increment: line.quantity }, updatedAt: fixture.createdAt } })
      }
      // Keep the original income; a reversal uses its distinct unique relation.
      await tx.cashMovement.create({ data: {
        businessId, type: 'EXPENSE', origin: 'COMMERCE', amount: total, method: fixture.paymentMethod,
        description: `Devolución por cancelación venta de comercio #${sale.id.slice(-6)}`,
        relatedCommerceSaleId: sale.id, createdAt: fixture.createdAt,
      } })
    }
  }
  await tx.cashMovement.create({ data: {
    businessId, type: 'EXPENSE', origin: 'COMMERCE', description: 'Bolsas y embalajes para accesorios',
    amount: 12500, method: 'TRANSFER', createdAt: now,
  } })

  // Mirrors modules/equipment-sales/equipment-sales.service.ts: initial costs at
  // version 0, then a sale at version 1 with a frozen cost basis; no zero cash rows.
  for (const [index, [brand, model, status, purchasePrice, repairExpenses, estimatedSalePrice]] of devices.entries()) {
    const isSold = status === 'SOLD'
    const createdAt = historic(isSold ? 45 - (index - 9) * 5 : 5 + index * 3)
    const device = await tx.resaleDevice.create({ data: {
      businessId, brand, model, purchasePrice, repairExpenses, estimatedSalePrice,
      status: isSold ? 'READY_FOR_SALE' : status, version: 0, createdAt, updatedAt: createdAt,
    } })
    for (const [kind, amount, label] of [['PURCHASE', purchasePrice, 'Compra'], ['REPAIR', repairExpenses, 'Gastos de reparación']] as const) {
      if (amount === 0) continue
      await tx.cashMovement.create({ data: {
        businessId, type: 'EXPENSE', origin: 'EQUIPMENT', amount,
        description: `${label} · ${brand} ${model}`, resaleDeviceId: device.id,
        resaleKind: kind, resaleVersion: 0, createdAt,
      } })
    }
    if (isSold) {
      const soldAt = inMonth([0.45, 0.75, 1][index - 9])
      const actualSalePrice = estimatedSalePrice - 5000
      const salePaymentMethod = methods[(index - 9) % methods.length]
      await tx.resaleDevice.update({ where: { id: device.id }, data: {
        status: 'SOLD', version: 1, actualSalePrice, salePaymentMethod,
        saleCostBasis: purchasePrice + repairExpenses, soldAt, updatedAt: soldAt,
      } })
      await tx.cashMovement.create({ data: {
        businessId, type: 'INCOME', origin: 'EQUIPMENT', amount: actualSalePrice, method: salePaymentMethod,
        description: `Venta de equipo · ${brand} ${model}`, resaleDeviceId: device.id,
        resaleKind: 'SALE', resaleVersion: 1, createdAt: soldAt,
      } })
    }
  }
}
