import { RecordCard, RecordField } from '../../components/admin/AdminPatterns'
import { BuildRounded, DeleteRounded, EditRounded, SellRounded, VisibilityRounded } from '@mui/icons-material'
import { Box, Chip, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, useMediaQuery, useTheme } from '@mui/material'
import { DeviceBrandAvatar } from '../../components/common/DeviceBrandAvatar'
import { RowActionsMenu } from '../../components/common/RowActionsMenu'
import type { ResaleDevice } from '../../services/equipmentSales'
import { formatMoney } from '../../utils/format'
import { statusColors, statusLabels } from './equipmentPresentation'
import { TABLE_BORDER } from '../../theme/tokens'

type Props = { devices: ResaleDevice[]; canManage: boolean; canSell: boolean; canDelete: boolean; onView: (device: ResaleDevice) => void; onDelete: (device: ResaleDevice) => void; onEdit: (device: ResaleDevice) => void; onSell: (device: ResaleDevice) => void; onChangeStatus: (device: ResaleDevice) => void }
export function EquipmentDeviceList({ devices, canManage, canSell, canDelete, onView, onDelete, onEdit, onSell, onChangeStatus }: Props) {
  const mobile = useMediaQuery(useTheme().breakpoints.down('md'))
  const actions = (device: ResaleDevice) => <RowActionsMenu label={`Opciones de ${device.brand} ${device.model}`} actions={[
    { label: 'Ver detalles', icon: <VisibilityRounded />, onClick: () => onView(device) },
    ...(device.status !== 'SOLD' && canManage ? [
      { label: 'Editar equipo', icon: <EditRounded />, onClick: () => onEdit(device) },
      { label: 'Cambiar estado', icon: <BuildRounded />, onClick: () => onChangeStatus(device) },
    ] : []),
    ...(device.status === 'READY_FOR_SALE' && canSell ? [{ label: 'Registrar venta', icon: <SellRounded />, onClick: () => onSell(device) }] : []),
    ...(canDelete ? [{ label: 'Eliminar equipo', icon: <DeleteRounded />, destructive: true, dividerBefore: true, onClick: () => onDelete(device) }] : []),
  ]} />
  const status = (device: ResaleDevice) => <Chip size="small" variant="outlined" label={statusLabels[device.status]} color={statusColors[device.status]} />
  const priceLabel = (device: ResaleDevice) => device.status === 'SOLD' ? 'Precio real de venta' : 'Precio estimado de venta'
  const price = (device: ResaleDevice) => formatMoney(device.status === 'SOLD' ? device.actualSalePrice ?? 0 : device.estimatedSalePrice)
  if (mobile) return <Stack spacing={1.5}>{devices.map(device => <RecordCard key={device.id} leading={<DeviceBrandAvatar brand={device.brand} />} title={device.brand} status={status(device)} actions={actions(device)} subtitle={device.model}><RecordField label="Inversión total" color="error.main">{formatMoney(device.totalCost)}</RecordField><RecordField label={priceLabel(device)} color="success.main">{price(device)}</RecordField></RecordCard>)}</Stack>
  return <TableContainer><Table aria-label="Equipos para reventa" sx={{ width: '100%', '& .MuiTableCell-root': { px: 1.5, py: 1.5, borderBottom: `1px solid ${TABLE_BORDER}` }, '& .MuiTableCell-head': { fontSize: 11, fontWeight: 800, color: 'text.secondary' } }}><TableHead><TableRow><TableCell>Equipo</TableCell><TableCell>Estado</TableCell><TableCell align="right">Inversión total</TableCell><TableCell align="right">Precio de venta</TableCell><TableCell align="right">Opciones</TableCell></TableRow></TableHead><TableBody>{devices.map(device => <TableRow key={device.id} hover>
    <TableCell><Stack direction="row" spacing={1.25} alignItems="center"><DeviceBrandAvatar brand={device.brand} size={36} /><Box sx={{ overflowWrap: 'anywhere' }}><Typography variant="body2" fontWeight={750}>{device.brand}</Typography><Typography variant="body2" color="text.secondary">{device.model}</Typography></Box></Stack></TableCell><TableCell>{status(device)}</TableCell>
    <TableCell align="right"><Typography variant="body2" fontWeight={700} color="error.main">{formatMoney(device.totalCost)}</Typography></TableCell>
    <TableCell align="right"><Typography variant="body2" fontWeight={700} color="success.main">{price(device)}</Typography><Typography variant="caption" color="text.secondary">{device.status === 'SOLD' ? 'Real' : 'Estimado'}</Typography></TableCell>
    <TableCell align="right">{actions(device)}</TableCell>
  </TableRow>)}</TableBody></Table></TableContainer>
}
