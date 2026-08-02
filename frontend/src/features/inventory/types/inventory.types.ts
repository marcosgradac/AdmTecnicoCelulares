export type InventoryCategory = 'modulo' | 'bateria' | 'pin_carga' | 'flex' | 'camara' | 'parlante' | 'microfono' | 'tapa_trasera' | 'boton' | 'adhesivo' | 'placa' | 'herramienta' | 'consumible' | 'accesorio' | 'otro'
export type InventoryMovementType = 'initial_stock' | 'purchase' | 'manual_entry' | 'repair_usage' | 'adjustment_in' | 'adjustment_out' | 'return' | 'damaged' | 'cancelled_repair_return'

export interface InventoryItem {
  id: string; sku: string | null; name: string; category: InventoryCategory; brand: string | null
  compatibleModels: string[]; quality: string | null; supplier: string | null; purchaseCost: number
  salePrice: number; currentStock: number; minimumStock: number; notes: string | null; isActive: boolean
  isLowStock: boolean; isOutOfStock: boolean; inventoryValue: number; createdAt: string; updatedAt: string
}
export interface InventoryMovement {
  id: string; inventoryItemId: string; repairId: string | null; type: InventoryMovementType; quantity: number
  unitCost: number; totalCost: number; previousStock: number; newStock: number; notes: string | null; createdAt: string
  item?: { id?: string; name: string; sku: string | null }
}
export interface InventoryItemDetail extends InventoryItem {
  movements: InventoryMovement[]
  repairs: Array<{ repairPartId: string; quantity: number; unitCost: number; createdAt: string; repair: { id: string; number: number; deviceBrand: string; deviceModel: string } }>
}
export interface InventorySummary { totalItems: number; totalUnits: number; lowStockItems: number; outOfStockItems: number; inventoryValue: number; recentMovements: InventoryMovement[] }
export interface InventoryList { items: InventoryItem[]; total: number; page: number; pageSize: number; pages: number }
export interface InventoryItemInput { sku?: string | null; name: string; category: InventoryCategory; brand?: string | null; compatibleModels: string[]; quality?: string | null; supplier?: string | null; purchaseCost: number; salePrice?: number | null; currentStock: number; minimumStock: number; notes?: string | null }
export interface InventoryMovementInput { type: 'purchase' | 'manual_entry' | 'adjustment_in' | 'adjustment_out' | 'return' | 'damaged'; quantity: number; unitCost?: number; supplier?: string; notes: string }
