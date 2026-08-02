import { Chip } from '@mui/material'
import type { InventoryItem } from '../types/inventory.types'
export function StockStatusChip({ item }: { item: Pick<InventoryItem,'currentStock'|'minimumStock'|'isActive'> }) { const label=!item.isActive?'Inactivo':item.currentStock===0?'Sin stock':item.currentStock<=item.minimumStock?'Stock bajo':'Disponible'; const color=!item.isActive?'default':item.currentStock===0?'error':item.currentStock<=item.minimumStock?'warning':'success'; return <Chip size="small" variant="outlined" label={label} color={color}/> }
