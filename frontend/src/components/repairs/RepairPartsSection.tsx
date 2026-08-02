import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Divider, Grid, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { AddRounded, DeleteOutlineRounded, Inventory2Rounded } from '@mui/icons-material'
import { UiState } from '../common/UiState'
import { formatMoney } from '../../utils/format'
import { addRepairPart, getRepairParts, removeRepairPart, type RepairPart } from '../../services/repairParts'
import { listInventory } from '../../features/inventory/api/inventory.api'
import type { InventoryItem } from '../../features/inventory/types/inventory.types'
import { StockStatusChip } from '../../features/inventory/components/StockStatusChip'

const apiMessage = (error: unknown, fallback: string) =>
  axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message ?? fallback : fallback

export function RepairPartsSection({ repairId, repairTotal }: { repairId: string; repairTotal: number }) {
  const [parts, setParts] = useState<RepairPart[]>([])
  const [stock, setStock] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [removing, setRemoving] = useState<RepairPart | null>(null)
  const [form, setForm] = useState({ inventoryItemId: '', quantity: 1 })
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [partData, stockData] = await Promise.all([getRepairParts(repairId), listInventory({ pageSize: 100, active: 'true' })])
      setParts(partData); setStock(stockData.items)
    } catch (loadError) { setError(apiMessage(loadError, 'No pudimos cargar los repuestos utilizados.')) }
    finally { setLoading(false) }
  }, [repairId])
  useEffect(() => { void load() }, [load])
  const selected = stock.find(item => item.id === form.inventoryItemId)
  const visibleStock = useMemo(() => stock.filter(item => `${item.name} ${item.sku ?? ''} ${item.brand ?? ''} ${item.compatibleModels.join(' ')}`.toLowerCase().includes(search.toLowerCase())), [stock, search])
  const partsTotal = parts.reduce((sum, part) => sum + part.subtotal, 0)
  const openAdd = () => { setForm({ inventoryItemId: '', quantity: 1 }); setSearch(''); setError(''); setSuccess(''); setOpen(true) }
  const selectItem = (id: string) => {
    const item = stock.find(stockItem => stockItem.id === id)
    setForm({ inventoryItemId: id, quantity: 1 })
  }
  const add = async () => {
    if (!selected || form.quantity <= 0 || form.quantity > selected.currentStock) return
    setSaving(true); setError(''); setSuccess('')
    try {
      await addRepairPart(repairId, form)
      setOpen(false); setSuccess('Repuesto agregado y stock actualizado.'); await load()
    } catch (addError) { setError(apiMessage(addError, 'No pudimos agregar el repuesto.')) }
    finally { setSaving(false) }
  }
  const remove = async () => {
    if (!removing) return
    setSaving(true); setError(''); setSuccess('')
    try {
      await removeRepairPart(repairId, removing.id)
      setRemoving(null); setSuccess('Repuesto eliminado y stock restaurado.'); await load()
    } catch (removeError) { setError(apiMessage(removeError, 'No pudimos eliminar el repuesto.')) }
    finally { setSaving(false) }
  }
  return <Card><CardContent>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={2} mb={2}>
      <Box><Stack direction="row" gap={1} alignItems="center"><Inventory2Rounded color="primary"/><Typography variant="h2">Repuestos utilizados</Typography></Stack><Typography variant="body2" color="text.secondary">Componentes descontados del stock para esta reparación</Typography></Box>
      <Button variant="outlined" startIcon={<AddRounded/>} onClick={openAdd}>Agregar repuesto</Button>
    </Stack>
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
    {loading ? <UiState loading/> : !parts.length ? <UiState title="No hay repuestos utilizados" description="Agregá un repuesto cuando sea necesario para esta reparación."/> : <Stack divider={<Divider/>}>{parts.map(part => <Grid container spacing={1.5} alignItems="center" py={1.7} key={part.id}>
      <Grid size={{ xs: 12, md: 4 }}><Typography fontWeight={750}>{part.name}</Typography><Typography variant="caption" color="text.secondary">Cantidad: {part.quantity}</Typography></Grid>
      <Grid size={{ xs: 6, md: 2 }}><Typography variant="caption" color="text.secondary">Costo unitario</Typography><Typography>{formatMoney(part.unitCost)}</Typography></Grid>
      <Grid size={{ xs: 6, md: 2 }}><Typography variant="caption" color="text.secondary">Costo total</Typography><Typography>{formatMoney(part.totalCost)}</Typography></Grid>
      <Grid size={{ xs: 8, md: 2 }}><Typography variant="caption" color="text.secondary">Total</Typography><Typography fontWeight={800}>{formatMoney(part.totalCost)}</Typography></Grid>
      <Grid size={{ xs: 4, md: 2 }} textAlign="right"><Button color="error" startIcon={<DeleteOutlineRounded/>} onClick={() => setRemoving(part)}>Eliminar</Button></Grid>
    </Grid>)}</Stack>}
    <Divider sx={{ my: 2 }}/>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1}><Typography color="text.secondary">Total de repuestos utilizados</Typography><Typography variant="h2">{formatMoney(partsTotal)}</Typography></Stack>
    {partsTotal > repairTotal && <Alert severity="warning" sx={{ mt: 2 }}>El total de repuestos supera el presupuesto actual. Actualizá el presupuesto manualmente si corresponde.</Alert>}
    <Dialog open={open} onClose={() => !saving && setOpen(false)} fullWidth maxWidth="sm" fullScreen={false}>
      <DialogTitle>Agregar repuesto</DialogTitle><DialogContent>
        <Stack spacing={2} mt={1}>
          <TextField label="Buscar repuesto" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nombre, marca o modelo"/>
          <TextField select label="Repuesto activo" value={form.inventoryItemId} onChange={event => selectItem(event.target.value)}>{visibleStock.map(item => <MenuItem key={item.id} value={item.id} disabled={item.currentStock === 0}>{item.sku ? `${item.sku} · ` : ''}{item.name} · Stock {item.currentStock}</MenuItem>)}</TextField>
          {selected && <Alert severity={selected.currentStock ? 'info' : 'warning'}><Stack direction="row" justifyContent="space-between" alignItems="center"><span>Stock disponible: {selected.currentStock} · Costo: {formatMoney(selected.purchaseCost)}</span><StockStatusChip item={selected}/></Stack></Alert>}
          <TextField fullWidth type="number" label="Cantidad" value={form.quantity} inputProps={{ min: 1, max: selected?.currentStock ?? 1, step: 1 }} onChange={event => setForm(current => ({ ...current, quantity: Number(event.target.value) }))} error={Boolean(selected && form.quantity > selected.currentStock)} helperText={selected && form.quantity > selected.currentStock ? 'Supera el stock disponible' : ''}/>
          <Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">Costo total</Typography><Typography fontWeight={800}>{formatMoney(Math.max(0, form.quantity) * (selected?.purchaseCost ?? 0))}</Typography></Stack>
        </Stack>
      </DialogContent><DialogActions><Button onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button><Button variant="contained" disabled={saving || !selected || form.quantity <= 0 || form.quantity > (selected?.currentStock ?? 0) || !Number.isInteger(form.quantity)} onClick={() => void add()}>{saving ? 'Agregando…' : 'Confirmar'}</Button></DialogActions>
    </Dialog>
    <Dialog open={Boolean(removing)} onClose={() => !saving && setRemoving(null)}><DialogTitle>Eliminar repuesto utilizado</DialogTitle><DialogContent><DialogContentText>¿Confirmás que querés eliminar “{removing?.name}”? Se devolverán {removing?.quantity} unidades al stock.</DialogContentText></DialogContent><DialogActions><Button onClick={() => setRemoving(null)} disabled={saving}>Cancelar</Button><Button variant="contained" color="error" disabled={saving} onClick={() => void remove()}>{saving ? 'Eliminando…' : 'Eliminar y devolver stock'}</Button></DialogActions></Dialog>
  </CardContent></Card>
}
