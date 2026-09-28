import { randomBytes, randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { type Prisma, type PrismaClient, type RepairStatus, type PaymentMethod } from '@prisma/client'
import { allocateRepairNumber } from '../lib/repair-number'
import { getArgentinaDayBounds } from '../lib/argentina-day'
import { DEFAULT_TECHNICIAN_PERMISSIONS } from '../config/permissions'
import { seedLandingCommerce } from './landing-demo-commerce'

const marker = 'demo-tecnodesk-landing-v1'
const email = 'landing-demo@local.test'
const businessName = 'TecnoFix Demo'
const day = 86_400_000
const names = ['Juan Pérez', 'Camila Gómez', 'Lucas Fernández', 'Sofía Rodríguez', 'Nicolás Martínez', 'Valentina López', 'Matías Sánchez', 'Martina Romero', 'Franco Díaz', 'Agustina Torres', 'Tomás Herrera', 'Julieta Castro', 'Bruno Acosta', 'Malena Ríos', 'Joaquín Medina', 'Emilia Suárez', 'Santino Molina', 'Delfina Cabrera', 'Lucía Silva', 'Mateo Vega', 'Paula Acuña', 'Diego Luna', 'Clara Méndez', 'Facundo Costa', 'Ana Benítez', 'Lautaro Paz', 'Micaela Vidal', 'Agustín Peralta', 'Victoria Sosa', 'Simón Duarte', 'Florencia Arias', 'Andrés Navarro']
const models = [['Samsung', 'Galaxy A54'], ['Apple', 'iPhone 11'], ['Motorola', 'Moto G32'], ['Xiaomi', 'Redmi Note 11'], ['Apple', 'iPhone 12'], ['Samsung', 'Galaxy S21'], ['Motorola', 'Moto G52'], ['Apple', 'iPhone 13'], ['Xiaomi', 'Poco X5']]
const issues = ['Pantalla dañada, sin respuesta táctil', 'La batería se descarga rápidamente', 'El conector de carga hace falso contacto', 'No enciende después de una caída', 'Cámara trasera sin enfoque', 'Audio intermitente en llamadas', 'Reinicio inesperado del equipo', 'Pantalla con líneas verticales']
const flow: RepairStatus[] = ['RECEIVED', 'REVIEW', 'BUDGET', 'APPROVED', 'WAITING_PART', 'REPAIRING', 'TESTING', 'READY', 'DELIVERED']
const publicMessages = ['Recibimos tu equipo en el taller.', 'Estamos revisando el equipo para identificar la falla.', 'El presupuesto está disponible para su aprobación.', 'Presupuesto aprobado. Organizamos la reparación.', 'Estamos esperando el repuesto necesario.', 'La reparación está en curso.', 'Estamos realizando las pruebas finales.', 'Tu equipo está listo para retirar.', 'Equipo entregado. Gracias por confiar en nosotros.']
const methods: PaymentMethod[] = ['CASH', 'TRANSFER', 'CARD', 'OTHER']

function assertLocal() {
  let url: URL
  try { url = new URL(process.env.DATABASE_URL ?? '') }
  catch { throw new Error('Landing demo requiere DATABASE_URL PostgreSQL local válida') }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || process.env.NODE_ENV === 'production') {
    throw new Error('Landing demo es LOCAL-ONLY: producción y conexiones remotas están prohibidas, incluso con DEMO_ALLOW_PRODUCTION')
  }
  if (process.env.DEMO_USER_EMAIL?.trim() && process.env.DEMO_USER_EMAIL.trim().toLowerCase() !== email) {
    throw new Error(`Landing demo sólo puede usar la cuenta dedicada ${email}`)
  }
}

/** Atomic historical fixture, never a runtime business mutation service.
 * The runtime services own their transactions, so calling them here would commit
 * partial datasets. These writes follow their current ledger/snapshot contracts;
 * tests reconcile the stored rows independently and exercise the real read APIs.
 */
export async function loadLandingDemo(prisma: PrismaClient) {
  assertLocal() // Before any database query, including account existence checks.
  const now = new Date()
  const ago = (days: number) => new Date(+now - days * day)
  return prisma.$transaction(async tx => {
    // Serializes even the first invocation, before a Business/User row exists.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${marker}))::text`
    let owner = await tx.user.findUnique({ where: { email }, include: { business: true } })
    if (owner) {
      if (owner.role !== 'OWNER' || owner.platformRole !== 'USER' || !owner.isActive || owner.deletedAt || !owner.business.isActive || owner.business.name !== businessName) {
        throw new Error('La cuenta demo existente no es un OWNER local dedicado activo')
      }
      await tx.$queryRaw`SELECT "id" FROM "Business" WHERE "id" = ${owner.businessId} FOR UPDATE`
      if (await tx.client.count({ where: { businessId: owner.businessId, notes: marker } })) {
        return { mode: 'existing', marker, businessId: owner.businessId, message: 'Dataset existente: no se modificaron datos, contraseña ni correlativos.' }
      }
      // Never attach a landing dataset to a populated or partially imported tenant.
      const counts = await Promise.all([
        tx.client.count({ where: { businessId: owner.businessId } }), tx.device.count({ where: { businessId: owner.businessId } }),
        tx.repair.count({ where: { businessId: owner.businessId } }), tx.cashMovement.count({ where: { businessId: owner.businessId } }),
        tx.stockItem.count({ where: { businessId: owner.businessId } }), tx.commerceProduct.count({ where: { businessId: owner.businessId } }),
        tx.commerceCategory.count({ where: { businessId: owner.businessId } }), tx.resaleDevice.count({ where: { businessId: owner.businessId } }),
        tx.user.count({ where: { businessId: owner.businessId, id: { not: owner.id } } }), tx.subscription.count({ where: { businessId: owner.businessId } }),
      ])
      if (counts.some(Boolean)) throw new Error('El negocio dedicado ya contiene datos sin el marker landing; no se modificó')
    } else {
      const password = process.env.LANDING_DEMO_PASSWORD
      if (!password || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
        throw new Error('Definí LANDING_DEMO_PASSWORD con al menos 12 caracteres y hasta 72 bytes para crear la cuenta local')
      }
      const passwordHash = await bcrypt.hash(password, 12)
      owner = await tx.user.create({ data: {
        email, name: 'Alex Demo', firstName: 'Alex', lastName: 'Demo', role: 'OWNER', passwordHash,
        tutorialSeen: true, themePreference: 'LIGHT', createdAt: ago(180),
        business: { create: { name: businessName, createdAt: ago(180) } },
      }, include: { business: true } })
    }
    const businessId = owner.businessId
    await tx.subscription.create({ data: { businessId, planCode: 'COMPLETE', status: 'ACTIVE',
      trialStartedAt: ago(180), trialConsumedAt: ago(180), trialEndsAt: ago(150),
      currentPeriodStart: ago(7), currentPeriodEnd: ago(-23), accessExpiresAt: ago(-23), createdAt: ago(180),
    } })
    for (const [index, name] of ['Lucas Fernández', 'Sofía Gómez', 'Martín López'].entries()) {
      await tx.user.create({ data: { businessId, name, firstName: name.split(' ')[0], lastName: name.split(' ')[1],
        email: `landing-technician-${index + 1}@example.invalid`, role: 'TECHNICIAN',
        // An independently salted unknown secret: these accounts are display fixtures, not shared logins.
        passwordHash: await bcrypt.hash(randomBytes(32).toString('hex'), 12),
        permissions: index === 0 ? [...DEFAULT_TECHNICIAN_PERMISSIONS, 'repairs.viewFinancials', 'clients.delete', 'cash.view']
          : index === 1 ? ['repairs.view', 'repairs.changeStatus', 'clients.view'] : [...DEFAULT_TECHNICIAN_PERMISSIONS, 'commerce.view', 'commerce.sell'],
        createdAt: ago(150 - index * 20), tutorialSeen: true,
      } })
    }
    const clients = []
    for (let i = 0; i < names.length; i++) clients.push(await tx.client.create({ data: {
      businessId, name: `${names[i]} (DEMO)`, notes: marker,
      // Clearly non-dialable demo range, never an actual Argentine telephone number.
      phone: `000-000-${String(i + 1).padStart(4, '0')}`, whatsapp: null,
      email: i % 3 === 0 ? `landing-client-${i + 1}@example.invalid` : null, createdAt: ago(175 - i),
    } }))
    const devices = []
    for (let i = 0; i < 40; i++) devices.push(await tx.device.create({ data: {
      businessId, clientId: clients[i % clients.length].id, brand: models[i % models.length][0], model: models[i % models.length][1],
      color: ['Negro', 'Azul', 'Blanco', 'Grafito'][i % 4], storage: i % 2 ? '128 GB' : '256 GB',
      imei: null, createdAt: ago(135),
    } }))
    const stock = []
    for (let i = 0; i < 18; i++) {
      const [brand, model] = models[i % models.length]
      const quantity = [18, 12, 7, 4, 20, 9][i % 6]
      const item = await tx.stockItem.create({ data: {
        businessId, name: `${i < 9 ? 'Módulo' : 'Batería'} ${brand} ${model}`, sku: `LANDING-${i + 1}`,
        category: i < 9 ? 'Módulos' : 'Baterías', compatibleBrand: brand, compatibleModel: model,
        compatibleModels: [model], quantity, minimumStock: 4, cost: i < 9 ? 24000 + i * 2500 : 16000 + (i - 9) * 1500,
        salePrice: i < 9 ? 47000 + i * 3500 : 31000 + (i - 9) * 2200, notes: marker, createdAt: ago(130),
      } })
      stock.push(item)
      await tx.inventoryMovement.create({ data: { businessId, stockItemId: item.id, type: 'INITIAL_STOCK', quantity,
        unitCost: item.cost, totalCost: quantity * item.cost, previousStock: 0, newStock: quantity,
        createdByUserId: owner.id, notes: marker, createdAt: ago(130),
      } })
    }
    const partUsages: Array<{ repairId: string; stockIndex: number; createdAt: Date }> = []
    const today = getArgentinaDayBounds(now).start
    let recommendedTrackingPath = ''
    for (let i = 0; i < 50; i++) {
      const status: RepairStatus = i < 32 ? flow[Math.floor(i / 4)] : i < 42 ? 'DELIVERED' : i < 46 ? 'WARRANTY' : 'CANCELLED'
      const device = devices[i % devices.length]
      const client = clients.find(row => row.id === device.clientId)!
      const finished = status === 'DELIVERED' || status === 'WARRANTY'
      const cancelled = status === 'CANCELLED'
      const warrantyEnabled = (i >= 32 && i <= 36) || i === 31 || status === 'WARRANTY'
      const age = i < 4 ? 0 : i < 12 ? 1 + i % 6 : i < 24 ? 8 + i % 15 : i < 32 ? 18 + i % 24 : 20 + i % 8
      let createdAt = i < 4 ? new Date(+today + (+now - +today) * (0.1 + i * 0.12)) : ago(age)
      let lastEvent = i < 4 ? new Date(+today + (+now - +today) * 0.85) : ago(Math.min(i % 7, age - 1))
      // Warranty windows: active, about to expire, expired and awaiting initial delivery.
      let deliveredAt = finished ? ago(i === 34 ? 105 : i === 33 ? 27 : status === 'WARRANTY' ? 12 : 3 + i % 12) : null
      if (deliveredAt && +createdAt >= +deliveredAt) createdAt = new Date(+deliveredAt - 8 * day)
      if (status === 'DELIVERED') lastEvent = deliveredAt!
      if (status === 'WARRANTY') lastEvent = ago(4)
      const duration = i === 33 ? 30 : 90
      const at = (fraction: number) => new Date(+createdAt + (+lastEvent - +createdAt) * fraction)
      const originalWorkAt = (fraction: number) => new Date(+createdAt + (+(deliveredAt ?? lastEvent) - +createdAt) * fraction)
      const states: RepairStatus[] = cancelled ? ['RECEIVED', 'REVIEW', 'CANCELLED']
        : status === 'WARRANTY' ? [...flow, 'WARRANTY'] : flow.slice(0, flow.indexOf(status) + 1)
      const part = stock[(i % devices.length) % models.length + (i % 2 ? 9 : 0)]
      const usesPart = !cancelled && !['RECEIVED', 'REVIEW', 'BUDGET', 'WAITING_PART'].includes(status)
      const total = cancelled ? 60000 : 60000 + (i % 7) * 18000
      const paid = cancelled ? [40000, 15000, 20000, 0][i - 46] : finished ? total : i % 4 === 0 ? 0 : i % 4 === 1 ? Math.floor(total * 0.3) : i % 4 === 2 ? Math.floor(total * 0.6) : total
      const trackingEnabled = !finished && !cancelled
      const repair = await tx.repair.create({ data: {
        businessId, number: await allocateRepairNumber(tx, businessId), clientId: client.id, deviceId: device.id,
        deviceBrand: device.brand, deviceModel: device.model, color: device.color, issue: issues[i % issues.length],
        diagnosis: status === 'RECEIVED' ? null : `Revisión de ${device.brand} ${device.model}: ${issues[i % issues.length].toLowerCase()}. Se verificaron conexiones y alimentación.`,
        notes: marker, physicalCondition: i % 3 ? 'Buen estado general' : 'Marcas leves en el marco', accessories: 'Sin accesorios',
        status, total, paid, partsCost: usesPart ? part.cost : 0, laborCost: cancelled ? 0 : 18000 + i % 5 * 4000,
        createdAt, updatedAt: lastEvent, estimatedDeliveryDate: finished || cancelled ? null : new Date(Math.max(+createdAt, +ago(i % 3 === 0 ? 2 : -2 - i % 5))),
        trackingEnabled, trackingToken: trackingEnabled ? randomBytes(32).toString('hex') : null, trackingCreatedAt: trackingEnabled ? createdAt : null,
        deliveredAt, warrantyEnabled, warrantyDurationDays: warrantyEnabled ? duration : null,
        warrantyStartedAt: warrantyEnabled ? deliveredAt : null, warrantyExpiresAt: warrantyEnabled && deliveredAt ? new Date(+deliveredAt + duration * day) : null,
        warrantyConditions: warrantyEnabled ? 'Cobertura sobre el trabajo realizado. No incluye golpes, humedad ni intervenciones de terceros.' : null,
      } })
      if (device.model === 'Galaxy A54' && ['REPAIRING', 'TESTING'].includes(status)) recommendedTrackingPath = `/seguimiento/${repair.trackingToken}`
      for (let s = 0; s < states.length; s++) {
        const historyAt = status === 'WARRANTY' && s <= 8 ? new Date(+createdAt + (+deliveredAt! - +createdAt) * s / 8) : at(states.length === 1 ? 0 : s / (states.length - 1))
        await tx.repairStatusHistory.create({ data: { repairId: repair.id, previousStatus: s ? states[s - 1] : null,
          newStatus: states[s], changedByUserId: owner.id, createdAt: historyAt, internalNote: marker,
          publicMessage: states[s] === 'WARRANTY' ? 'Recibimos el equipo para revisar la garantía.' : states[s] === 'CANCELLED' ? null : publicMessages[s],
        } })
      }
      if (usesPart) {
        await tx.repairPart.create({ data: { repairId: repair.id, stockItemId: part.id, quantity: 1, unitCost: part.cost, unitPrice: part.salePrice, itemNameSnapshot: part.name, createdAt: originalWorkAt(0.7) } })
        partUsages.push({ repairId: repair.id, stockIndex: stock.indexOf(part), createdAt: originalWorkAt(0.7) })
      }
      // See server.ts payment endpoint: the payment and matching cash entry are one event.
      const installments = paid === 0 ? [] : !cancelled && i % 3 === 0 ? [Math.floor(paid * 0.4), paid - Math.floor(paid * 0.4)] : [paid]
      for (let p = 0; p < installments.length; p++) {
        const method = methods[(i + p) % methods.length], createdAt = originalWorkAt(p ? 0.95 : 0.45)
        await tx.payment.create({ data: { businessId, repairId: repair.id, clientId: client.id, amount: installments[p], method, note: marker, createdAt } })
        await tx.cashMovement.create({ data: { businessId, repairId: repair.id, clientName: client.name, amount: installments[p], method, type: 'INCOME', origin: 'REPAIR', description: `${marker} · Pago reparación #${repair.number}`, createdAt } })
      }
      if (cancelled) {
        const fee = [15000, 15000, 30000, 0][i - 46]
        const refund = Math.max(0, paid - fee)
        const cash = refund ? await tx.cashMovement.create({ data: { businessId, repairId: repair.id, clientName: client.name, type: 'EXPENSE', origin: 'REPAIR', amount: refund, method: 'TRANSFER', description: `${marker} · Devolución reparación #${repair.number}`, createdAt: lastEvent } }) : null
        await tx.repair.update({ where: { id: repair.id }, data: { cancelledAt: lastEvent, cancellationPaidAmount: paid,
          cancellationReviewFee: fee, cancellationRefundAmount: refund, cancellationRefundMethod: refund ? 'TRANSFER' : null,
          cancellationRefundMovementId: cash?.id ?? null, updatedAt: lastEvent,
        } })
      }
      if (status === 'WARRANTY') {
        const claimStatus = (['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED'] as const)[i - 42]
        const claimAt = ago(4)
        const claim = await tx.warrantyClaim.create({ data: { businessId, repairId: repair.id,
          description: ['Pantalla presenta una línea intermitente', 'El conector de carga volvió a fallar', 'Batería reemplazada y pruebas completadas', 'Daño por humedad fuera de cobertura'][i - 42],
          status: claimStatus, createdAt: claimAt, updatedAt: ago(1),
          coveredWarrantyStartedAt: repair.warrantyStartedAt, coveredWarrantyExpiresAt: repair.warrantyExpiresAt,
          coveredWarrantyDurationDays: repair.warrantyDurationDays, coveredWarrantyConditions: repair.warrantyConditions,
          resolvedAt: i >= 44 ? ago(1) : null, resolution: i === 44 ? 'Se reemplazó la batería. Pruebas correctas; pendiente de retiro.' : i === 45 ? 'Se detectó humedad posterior a la entrega, fuera de cobertura.' : null,
        } })
        if (i < 45) {
          const concept = ['Módulo de reemplazo', 'Pin de carga', 'Batería'][i - 42]
          const createdAt = i === 42 ? new Date(+today + (+now - +today) * 0.65) : ago(2)
          const movement = await tx.cashMovement.create({ data: { businessId, repairId: repair.id, clientName: client.name,
            type: 'EXPENSE', origin: 'REPAIR', amount: [28000, 6500, 16000][i - 42], method: methods[i % 4],
            description: `Garantía reparación #${repair.number} · ${concept}`, createdAt,
          } })
          await tx.warrantyClaimExpense.create({ data: { businessId, claimId: claim.id, concept, idempotencyKey: randomUUID(), cashMovementId: movement.id, createdAt } })
          if (createdAt > claim.updatedAt) await tx.warrantyClaim.update({ where: { id: claim.id }, data: { updatedAt: createdAt } })
        }
      }
    }
    // Repair fixtures are grouped by state, but the inventory ledger must run in time order.
    for (const usage of partUsages.sort((a, b) => +a.createdAt - +b.createdAt)) {
      const part = stock[usage.stockIndex], previousStock = part.quantity
      part.quantity--
      if (part.quantity < 0) throw new Error('Stock demo insuficiente')
      await tx.stockItem.update({ where: { id: part.id }, data: { quantity: part.quantity, updatedAt: usage.createdAt } })
      await tx.inventoryMovement.create({ data: { businessId, repairId: usage.repairId, stockItemId: part.id, type: 'REPAIR_USAGE', quantity: 1,
        unitCost: part.cost, totalCost: part.cost, previousStock, newStock: part.quantity, createdByUserId: owner.id, notes: marker, createdAt: usage.createdAt,
      } })
    }
    await seedLandingCommerce(tx, businessId, now)
    await tx.cashMovement.create({ data: { businessId, origin: 'GENERAL', type: 'EXPENSE', amount: 8500, method: 'TRANSFER', description: `${marker} · Insumos de limpieza del taller`, createdAt: new Date(+today + (+now - +today) * 0.4) } })
    return { mode: 'created', marker, businessId, email, businessName, recommendedTrackingPath, ...await counts(tx, businessId) }
  }, { maxWait: 120_000, timeout: 120_000 })
}

async function counts(tx: Prisma.TransactionClient, businessId: string) {
  return {
    clients: await tx.client.count({ where: { businessId } }), devices: await tx.device.count({ where: { businessId } }),
    repairs: await tx.repair.count({ where: { businessId } }), payments: await tx.payment.count({ where: { businessId } }),
    cashMovements: await tx.cashMovement.count({ where: { businessId } }), warranties: await tx.repair.count({ where: { businessId, warrantyEnabled: true } }),
    warrantyClaims: await tx.warrantyClaim.count({ where: { businessId } }), warrantyExpenses: await tx.warrantyClaimExpense.count({ where: { businessId } }),
    stockItems: await tx.stockItem.count({ where: { businessId } }), commerceCategories: await tx.commerceCategory.count({ where: { businessId } }),
    commerceProducts: await tx.commerceProduct.count({ where: { businessId } }), commerceSales: await tx.commerceSale.count({ where: { businessId } }),
    resaleDevices: await tx.resaleDevice.count({ where: { businessId } }), technicians: await tx.user.count({ where: { businessId, role: 'TECHNICIAN' } }),
  }
}
