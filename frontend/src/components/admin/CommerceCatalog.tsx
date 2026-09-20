import { EditRounded, DeleteOutlineRounded, Inventory2Rounded } from '@mui/icons-material'
import { Box, Chip, Stack } from '@mui/material'
import type { CommerceProduct } from '../../services/commerce'
import { formatMoney } from '../../utils/format'
import { RowActionsMenu } from '../common/RowActionsMenu'
import { RecordCard, RecordField } from './AdminPatterns'

export function CommerceCatalog({ products, canManage, onEdit, onDelete }: { products: CommerceProduct[]; canManage: boolean; onEdit: (product: CommerceProduct) => void; onDelete: (product: CommerceProduct) => void }) {
  return <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
    {products.map(product => <RecordCard key={product.id} title={product.name} subtitle={product.category} status={<Stack direction="row" alignItems="center" gap={1}><Inventory2Rounded sx={{ fontSize: 20, color: 'primary.main' }} /><Chip size="small" color={product.currentStock > 0 ? 'success' : 'default'} variant="outlined" label={product.currentStock > 0 ? `${product.currentStock} en stock` : 'Sin stock'} /></Stack>} actions={<RowActionsMenu label={`Acciones de ${product.name}`} actions={[
      { label: 'Editar', icon: <EditRounded />, onClick: () => onEdit(product), disabled: !canManage },
      { label: 'Eliminar', icon: <DeleteOutlineRounded />, destructive: true, onClick: () => onDelete(product), disabled: !canManage },
    ]} />}>
      <RecordField label="Precio de venta"><Box component="span" sx={{ fontSize: '1.25rem', fontWeight: 800 }}>{formatMoney(product.salePrice)}</Box></RecordField>
      <RecordField label="Ganancia por unidad" color={product.unitProfit >= 0 ? 'success.main' : 'error.main'}>{formatMoney(product.unitProfit)}</RecordField>
    </RecordCard>)}
  </Box>
}
