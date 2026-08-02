import type { InventoryCategory, InventoryMovementType } from '../types/inventory.types'

export const inventoryCategories: Array<{ value: InventoryCategory; label: string }> = [
  ['modulo','Módulo'],['bateria','Batería'],['pin_carga','Pin de carga'],['flex','Flex'],['camara','Cámara'],['parlante','Parlante'],['microfono','Micrófono'],['tapa_trasera','Tapa trasera'],['boton','Botón'],['adhesivo','Adhesivo'],['placa','Placa'],['herramienta','Herramienta'],['consumible','Consumible'],['accesorio','Accesorio'],['otro','Otro'],
].map(([value,label]) => ({ value: value as InventoryCategory, label }))
export const categoryLabel = (value: InventoryCategory) => inventoryCategories.find(category => category.value === value)?.label ?? value
export const movementLabels: Record<InventoryMovementType, string> = { initial_stock:'Stock inicial', purchase:'Compra', manual_entry:'Entrada manual', repair_usage:'Uso en reparación', adjustment_in:'Ajuste positivo', adjustment_out:'Ajuste negativo', return:'Devolución', damaged:'Producto dañado', cancelled_repair_return:'Devolución de reparación' }
