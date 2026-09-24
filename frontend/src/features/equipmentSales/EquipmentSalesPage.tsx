import { FilterBar, ListPagination } from '../../components/admin/AdminPatterns'
import { useEffect, useState } from 'react'
import { AddRounded, ArrowForwardRounded, BuildRounded, CheckCircleRounded, PaymentsRounded, PhoneIphoneRounded, SearchRounded, TrendingUpRounded } from '@mui/icons-material'
import { Alert, Box, Button, Card, CardContent, Chip, Grid, InputAdornment, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { canAccess } from '../../auth/permissions'
import { PageHeader } from '../../components/common/PageHeader'
import { StatCard } from '../../components/common/StatCard'
import { UiState } from '../../components/common/UiState'
import { getEquipmentPage, getEquipmentSummary, type EquipmentStatus, type EquipmentSummary, type ResaleDevice } from '../../services/equipmentSales'
import { formatMoney } from '../../utils/format'
import { EquipmentDeviceList } from './EquipmentDeviceList'
import { EquipmentEditor, EquipmentSaleDrawer } from './EquipmentDrawers'
import { equipmentError, statusColors, statusLabels } from './equipmentPresentation'

export function EquipmentSalesPage() {
  const { user } = useAuth()
  const canManage = canAccess(user, 'equipmentSales.manage'), canSell = canAccess(user, 'equipmentSales.sell')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<{ page: number; search: string; status: '' | EquipmentStatus }>({ page: 0, search: '', status: '' })
  const [devices, setDevices] = useState<ResaleDevice[]>([]), [total, setTotal] = useState(0)
  const [summary, setSummary] = useState<EquipmentSummary | null>(null)
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [summaryError, setSummaryError] = useState('')
  const [revision, setRevision] = useState(0), [listRetry, setListRetry] = useState(0), [summaryRetry, setSummaryRetry] = useState(0)
  const [editor, setEditor] = useState<ResaleDevice | null | undefined>(undefined)
  const [selling, setSelling] = useState<ResaleDevice | null>(null)
  useEffect(() => {
    const timer = setTimeout(() => {
      const normalized = search.trim().toLocaleLowerCase()
      setFilters(current => current.search === normalized ? current : { ...current, search: normalized, page: 0 })
    }, 300)
    return () => clearTimeout(timer)
  }, [search])
  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    void getEquipmentPage({ page: filters.page + 1, pageSize: 20, search: filters.search || undefined, status: filters.status || undefined }).then(data => {
      if (!active) return
      if (filters.page > 0 && filters.page >= data.pages) { setFilters(current => ({ ...current, page: Math.max(0, data.pages - 1) })); return }
      setDevices(data.items); setTotal(data.total)
    }).catch(error => { if (active) setError(equipmentError(error, 'No pudimos cargar los equipos.')) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [filters.page, filters.search, filters.status, revision, listRetry])
  useEffect(() => {
    let active = true
    setSummaryError('')
    void getEquipmentSummary().then(data => { if (active) setSummary(data) }).catch(error => { if (active) setSummaryError(equipmentError(error, 'No pudimos cargar el resumen.')) })
    return () => { active = false }
  }, [revision, summaryRetry])
  const refresh = () => { setEditor(undefined); setSelling(null); setRevision(value => value + 1) }
  return <Box>
    <PageHeader eyebrow="VENTA DE EQUIPOS" title="Compra y venta de equipos" description="Controlá cuánto invertís, qué equipos están listos para vender y cuánto ganás en cada operación." action={canManage ? <Button variant="contained" startIcon={<AddRounded />} onClick={() => setEditor(null)}>Nuevo equipo</Button> : undefined} />
    {summaryError && <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" onClick={() => setSummaryRetry(value => value + 1)}>Reintentar resumen</Button>}>{summaryError}</Alert>}
    <Grid container spacing={1.5} mb={2}>
      <Grid size={{ xs: 6, lg: 3 }}><StatCard label="Equipos en proceso" value={summary ? String(summary.inProcess) : '—'} icon={<BuildRounded />} tone="warning" /></Grid>
      <Grid size={{ xs: 6, lg: 3 }}><StatCard label="Total invertido" value={summary ? formatMoney(summary.totalInvested) : '—'} icon={<PaymentsRounded />} /></Grid>
      <Grid size={{ xs: 6, lg: 3 }}><StatCard label="Listos para vender" value={summary ? String(summary.readyForSale) : '—'} icon={<CheckCircleRounded />} tone="info" /></Grid>
      <Grid size={{ xs: 6, lg: 3 }}><StatCard label="Ganancia realizada" value={summary ? formatMoney(summary.realizedProfit) : '—'} icon={<TrendingUpRounded />} tone={summary && summary.realizedProfit < 0 ? 'warning' : 'success'} /></Grid>
    </Grid>
    {summary && <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="space-between" mb={2.5}><Typography variant="body2" color="text.secondary">{summary.salesCount} ventas realizadas · Compras: {formatMoney(summary.purchaseInvestment)} · Reparaciones: {formatMoney(summary.repairInvestment)}<br />Inversión histórica neta de ajustes, incluidos equipos vendidos.</Typography>{canAccess(user, 'cash.view') && <Button component={RouterLink} to="/admin/caja?origin=EQUIPMENT" size="small" endIcon={<ArrowForwardRounded />}>Ver movimientos en Caja</Button>}</Stack>}
    <Card><CardContent>
      <Stack direction="row" spacing={1} alignItems="center" mb={2}><PhoneIphoneRounded color="primary" /><Typography variant="h2" sx={{ flex: 1 }}>Tus equipos</Typography><Chip size="small" label={`${total} equipos`} /></Stack>
      <Stack direction={{ xs: 'column', md: 'row' }} flexWrap="wrap" gap={1} mb={2.5} aria-label="Flujo del equipo" sx={{ p: 1.5, bgcolor: '#F7F8FC', borderRadius: 3 }}>{(Object.keys(statusLabels) as EquipmentStatus[]).map((status, index) => <Stack key={status} direction="row" alignItems="center" spacing={1} sx={{ flex: 1 }}><Typography variant="caption" color="text.secondary" fontWeight={700}>{index + 1}.</Typography><Chip size="small" variant="outlined" color={statusColors[status]} label={statusLabels[status]} />{index < 3 && <ArrowForwardRounded sx={{ fontSize: 15, color: 'text.disabled' }} />}</Stack>)}</Stack>
      <FilterBar onClear={search || filters.status ? () => { setSearch(''); setFilters({ search: '', status: '', page: 0 }) } : undefined}>
        <TextField fullWidth size="small" label="Buscar por marca o modelo" value={search} onChange={event => setSearch(event.target.value)} slotProps={{ htmlInput: { maxLength: 120 }, input: { startAdornment: <InputAdornment position="start"><SearchRounded /></InputAdornment> } }} />
        <TextField select size="small" label="Estado" value={filters.status} onChange={event => setFilters(current => ({ ...current, page: 0, status: event.target.value as '' | EquipmentStatus }))} sx={{ minWidth: { sm: 210 } }}><MenuItem value="">Todos los estados</MenuItem>{Object.entries(statusLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
      </FilterBar>
      {loading ? <UiState loading /> : error ? <UiState title="No pudimos cargar los equipos" description={error} action={() => setListRetry(value => value + 1)} actionLabel="Reintentar" /> : devices.length ? <EquipmentDeviceList devices={devices} canManage={canManage} canSell={canSell} onEdit={setEditor} onSell={setSelling} /> : <UiState title={filters.search || filters.status ? 'No encontramos equipos' : 'Tu próximo equipo empieza acá'} description={filters.search || filters.status ? 'Probá otra búsqueda o cambiá el estado.' : 'Registrá una compra y acompañá el equipo hasta su venta.'} action={canManage && !filters.search && !filters.status ? () => setEditor(null) : undefined} actionLabel="Nuevo equipo" />}
      {!error && <ListPagination count={total} page={filters.page} rowsPerPage={20} onPageChange={next => setFilters(current => ({ ...current, page: next }))} />}
    </CardContent></Card>
    {editor !== undefined && <EquipmentEditor key={editor?.id ?? 'new'} device={editor} onClose={() => setEditor(undefined)} onSaved={refresh} onRefresh={refresh} />}
    {selling && <EquipmentSaleDrawer key={selling.id} device={selling} onClose={() => setSelling(null)} onSaved={refresh} onRefresh={refresh} />}
  </Box>
}
