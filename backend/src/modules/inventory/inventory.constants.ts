export const inventoryCategories = [
  'modulo', 'bateria', 'pin_carga', 'flex', 'camara', 'parlante', 'microfono',
  'tapa_trasera', 'boton', 'adhesivo', 'placa', 'herramienta', 'consumible',
  'accesorio', 'otro',
] as const

export const inventoryMovementTypes = [
  'initial_stock', 'purchase', 'manual_entry', 'repair_usage', 'adjustment_in',
  'adjustment_out', 'return', 'damaged', 'cancelled_repair_return',
] as const

export type InventoryMovementKey = typeof inventoryMovementTypes[number]

export const movementToPrisma = (type: InventoryMovementKey) => type.toUpperCase() as Uppercase<InventoryMovementKey>
export const movementFromPrisma = (type: string) => type.toLowerCase() as InventoryMovementKey
