import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Grid, IconButton, InputAdornment, Stack, TextField, Tooltip, Typography } from '@mui/material'
import { AddRounded, DeleteOutlineRounded, EditRounded, Inventory2Rounded, SearchRounded, WarningAmberRounded } from '@mui/icons-material'
import { PageHeader } from '../components/common/PageHeader'
import { StatCard } from '../components/common/StatCard'
import { UiState } from '../components/common/UiState'
import { formatMoney } from '../utils/format'
import { createStockItem, deactivateStockItem, getStock, updateStockItem, type StockItem } from '../services/operations'

type StockForm = Omit<StockItem, 'id'>
const emptyItem: StockForm = { name: '', category: '', compatibleBrand: '', compatibleModel: '', quantity: 0, minimumStock: 0, cost: 0, salePrice: 0 }
const labels: Record<keyof StockForm, string> = { name: 'Nombre', category: 'Categoría', compatibleBrand: 'Marca compatible', compatibleModel: 'Modelo compatible', quantity: 'Cantidad', minimumStock: 'Stock mínimo', cost: 'Costo', salePrice: 'Precio de venta' }
const errorMessage = (error: unknown, fallback: string) => axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message ?? fallback : fallback

export function StockPage() {
  const [items, setItems] = useState<StockItem[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deactivating, setDeactivating] = useState<StockItem | null>(null)
  const [form, setForm] = useState<StockForm>(emptyItem)
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setItems(await getStock()) } catch (loadError) { setError(errorMessage(loadError, 'No pudimos cargar el stock.')) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  const filtered = useMemo(() => items.filter(item => `${item.name} ${item.category} ${item.compatibleBrand ?? ''} ${item.compatibleModel ?? ''}`.toLowerCase().includes(query.toLowerCase())), [items, query])
  const startCreate = () => { setEditingId(null); setForm(emptyItem); setOpen(true); setError(''); setSuccess('') }
  const startEdit = (item: StockItem) => {
    setEditingId(item.id)
    setForm({ name: item.name, category: item.category, compatibleBrand: item.compatibleBrand ?? '', compatibleModel: item.compatibleModel ?? '', quantity: item.quantity, minimumStock: item.minimumStock, cost: item.cost, salePrice: item.salePrice })
    setOpen(true); setError(''); setSuccess('')
  }
  const save = async () => {
    if (!form.name.trim() || !form.category.trim() || [form.quantity, form.minimumStock, form.cost, form.salePrice].some(value => value < 0)) {
      setError('Completá nombre y categoría. Los valores numéricos no pueden ser negativos.'); return
    }
    setSaving(true); setError(''); setSuccess('')
    try {
      if (editingId) await updateStockItem(editingId, form)
      else await createStockItem(form)
      setOpen(false); setSuccess(editingId ? 'Repuesto actualizado correctamente.' : 'Repuesto creado correctamente.'); await load()
    } catch (saveError) { setError(errorMessage(saveError, 'No pudimos guardar el repuesto.')) }
    finally { setSaving(false) }
  }
  const deactivate = async () => {
    if (!deactivating) return
    setSaving(true); setError(''); setSuccess('')
    try { await deactivateStockItem(deactivating.id); setDeactivating(null); setSuccess('Repuesto desactivado correctamente.'); await load() }
    catch (deleteError) { setError(errorMessage(deleteError, 'No pudimos desactivar el repuesto.')) }
    finally { setSaving(false) }
  }
  return <Box>
    <PageHeader eyebrow="INVENTARIO" title="Stock de repuestos" description="Controlá existencias, costos y precios de venta." action={<Button variant="contained" startIcon={<AddRounded />} onClick={startCreate}>Nuevo repuesto</Button>} />
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
    <Grid container spacing={1.5} mb={2.2}><Grid size={{ xs: 6, md: 3 }}><StatCard label="Repuestos" value={String(items.length)} icon={<Inventory2Rounded />} /></Grid><Grid size={{ xs: 6, md: 3 }}><StatCard label="Unidades" value={String(items.reduce((sum, item) => sum + item.quantity, 0))} icon={<Inventory2Rounded />} tone="info" /></Grid><Grid size={{ xs: 6, md: 3 }}><StatCard label="Stock bajo" value={String(items.filter(item => item.quantity > 0 && item.quantity <= item.minimumStock).length)} icon={<WarningAmberRounded />} tone="warning" /></Grid><Grid size={{ xs: 6, md: 3 }}><StatCard label="Sin stock" value={String(items.filter(item => item.quantity === 0).length)} icon={<WarningAmberRounded />} tone="warning" /></Grid></Grid>
    <Card><CardContent><TextField fullWidth value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar repuesto, marca o modelo" InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded /></InputAdornment> }} sx={{ mb: 2 }} />
      {loading ? <UiState loading/> : !filtered.length ? <UiState title={items.length ? 'Sin resultados' : 'Todavía no hay repuestos'}/> : <Stack divider={<Box borderTop="1px solid" borderColor="divider"/>}>{filtered.map(item => { const state = item.quantity === 0 ? 'Sin stock' : item.quantity <= item.minimumStock ? 'Stock bajo' : 'Disponible'; return <Stack key={item.id} direction={{ xs: 'column', md: 'row' }} gap={2} alignItems={{ md: 'center' }} py={1.8}><Box flex={1}><Typography fontWeight={750}>{item.name}</Typography><Typography variant="body2" color="text.secondary">{item.category} · {[item.compatibleBrand,item.compatibleModel].filter(Boolean).join(' ') || 'Universal'}</Typography></Box><Typography>{item.quantity} / mín. {item.minimumStock}</Typography><Typography>{formatMoney(item.cost)}</Typography><Typography>{formatMoney(item.salePrice)}</Typography><Chip label={state} color={state === 'Disponible' ? 'success' : state === 'Stock bajo' ? 'warning' : 'error'} variant="outlined"/><Stack direction="row"><Tooltip title="Editar"><IconButton aria-label={`Editar ${item.name}`} onClick={() => startEdit(item)}><EditRounded/></IconButton></Tooltip><Tooltip title="Desactivar"><IconButton color="error" aria-label={`Desactivar ${item.name}`} onClick={() => setDeactivating(item)}><DeleteOutlineRounded/></IconButton></Tooltip></Stack></Stack>})}</Stack>}
    </CardContent></Card>
    <Dialog open={open} onClose={() => !saving && setOpen(false)} fullWidth maxWidth="sm"><DialogTitle>{editingId ? 'Editar repuesto' : 'Nuevo repuesto'}</DialogTitle><DialogContent><Grid container spacing={2} mt={0.5}>{(Object.entries(form) as Array<[keyof StockForm, string | number]>).map(([key, value]) => <Grid size={{ xs: 12, sm: 6 }} key={key}><TextField required={key === 'name' || key === 'category'} fullWidth type={typeof value === 'number' ? 'number' : 'text'} label={labels[key]} value={value ?? ''} inputProps={typeof value === 'number' ? { min: 0 } : undefined} onChange={event => setForm(current => ({ ...current, [key]: typeof value === 'number' ? Number(event.target.value) : event.target.value }))}/></Grid>)}</Grid></DialogContent><DialogActions><Button onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button><Button variant="contained" disabled={saving || !form.name.trim() || !form.category.trim()} onClick={() => void save()}>{saving ? 'Guardando…' : 'Guardar cambios'}</Button></DialogActions></Dialog>
    <Dialog open={Boolean(deactivating)} onClose={() => !saving && setDeactivating(null)}><DialogTitle>Desactivar repuesto</DialogTitle><DialogContent><DialogContentText>¿Confirmás que querés desactivar “{deactivating?.name}”? Dejará de aparecer en el listado activo, pero conservará sus datos.</DialogContentText></DialogContent><DialogActions><Button onClick={() => setDeactivating(null)} disabled={saving}>Cancelar</Button><Button color="error" variant="contained" disabled={saving} onClick={() => void deactivate()}>{saving ? 'Desactivando…' : 'Desactivar'}</Button></DialogActions></Dialog>
  </Box>
}
