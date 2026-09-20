import { PreserveAdminVisual } from '../components/admin/AdminVisualScope'
import { FilterBar, FormSection } from '../components/admin/AdminPatterns'
import { CommerceCatalog } from '../components/admin/CommerceCatalog'
import { StatCard } from '../components/common/StatCard'
import { isAxiosError } from 'axios'
import { useEffect, useRef, useState } from 'react'
import { AddRounded, CategoryRounded, DeleteOutlineRounded, EditRounded, Inventory2Rounded, LockRounded, PointOfSaleRounded, RemoveRounded } from '@mui/icons-material'
import { Alert, Box, Button, Card, CardContent, Chip, Divider, Grid, IconButton, MenuItem, Stack, TablePagination, TextField, Typography } from '@mui/material'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { canAccess } from '../auth/permissions'
import { useSubscription } from '../features/billing/SubscriptionContext'
import { createCommerceCategory, createCommerceExpense, createCommerceProduct, createCommerceSale, deleteCommerceCategory, deleteCommerceProduct, getCommerceCategories, getCommerceProducts, getCommerceSales, getCommerceSummary, updateCommerceProduct, updateCommerceCategory, type CommerceCategory, type CommercePaymentMethod, type CommerceProduct, type CommerceSummary } from '../services/commerce'
import { formatMoney } from '../utils/format'
import { PageHeader } from '../components/common/PageHeader'
import { FormDrawer } from '../components/common/FormDrawer'
import { RowActionsMenu } from '../components/common/RowActionsMenu'
import { UiState } from '../components/common/UiState'

const emptyProduct = { name: '', category: '', purchaseCost: '', salePrice: '', currentStock: '' }
const paymentOptions: Array<[CommercePaymentMethod, string]> = [['CASH', 'Efectivo'], ['TRANSFER', 'Transferencia'], ['CARD', 'Tarjeta'], ['OTHER', 'Otro']]

type Cart = Record<string, { product: CommerceProduct; quantity: number }>

export function CommercePageV2() {
  const navigate = useNavigate(); const { user } = useAuth(); const { commerceEnabled, loading: subscriptionLoading } = useSubscription()
  const [products, setProducts] = useState<CommerceProduct[]>([]), [categories, setCategories] = useState<CommerceCategory[]>([]), [summary, setSummary] = useState<CommerceSummary | null>(null), [sales, setSales] = useState<Array<{ id: string; total: number; profit: number; createdAt: string }>>([])
  const [totalProducts, setTotalProducts] = useState(0), [page, setPage] = useState(0), [loading, setLoading] = useState(true), [error, setError] = useState(''), [saving, setSaving] = useState(false)
  const [productOpen, setProductOpen] = useState(false), [categoryOpen, setCategoryOpen] = useState(false), [saleOpen, setSaleOpen] = useState(false), [expenseOpen, setExpenseOpen] = useState(false)
  const [editing, setEditing] = useState<CommerceProduct | null>(null), [productForm, setProductForm] = useState(emptyProduct), [categoryName, setCategoryName] = useState('')
  const [cart, setCart] = useState<Cart>({}), [saleProductId, setSaleProductId] = useState(''), [paymentMethod, setPaymentMethod] = useState<CommercePaymentMethod>('CASH')
  const [expense, setExpense] = useState({ description: '', amount: '', paymentMethod: 'TRANSFER' as CommercePaymentMethod })
  const [revision, setRevision] = useState(0)
  const [search, setSearch] = useState(''), [productSearch, setProductSearch] = useState('')
  const [saleProducts, setSaleProducts] = useState<CommerceProduct[]>([]), [saleSearch, setSaleSearch] = useState(''), [salePage, setSalePage] = useState(0), [saleTotal, setSaleTotal] = useState(0)
  const [saleLoading, setSaleLoading] = useState(false)
  const [saleSearchError, setSaleSearchError] = useState(''), [saleSearchRetry, setSaleSearchRetry] = useState(0)
  const saleCache = useRef(new Map<string, Awaited<ReturnType<typeof getCommerceProducts>>>())
  const [editingCategory, setEditingCategory] = useState<CommerceCategory | null>(null)
  const [categoryError, setCategoryError] = useState('')
  const [salesPage, setSalesPage] = useState(0), [totalSales, setTotalSales] = useState(0)
  const [salesRevision, setSalesRevision] = useState(0), [salesError, setSalesError] = useState(''), [salesLoading, setSalesLoading] = useState(false)
  const submitting = useRef(false)
  const saleAttempt = useRef<{ fingerprint: string; key: string } | null>(null)

  const load = async () => { setRevision(value => value + 1) }
  useEffect(() => { const timer = setTimeout(() => { setProductSearch(search); setPage(0) }, 300); return () => clearTimeout(timer) }, [search])
  useEffect(() => {
    if (!commerceEnabled || subscriptionLoading) { setLoading(false); return }
    let active = true
    setLoading(true)
    void getCommerceProducts({ page: page + 1, pageSize: 20, search: productSearch }).then(data => {
      if (!active) return
      if (page > 0 && !data.items.length) { setPage(Math.max(0, data.pages - 1)); return }
      setProducts(data.items); setTotalProducts(data.total)
    }).catch(() => { if (active) setError('No pudimos cargar los productos.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [page, productSearch, commerceEnabled, subscriptionLoading, revision])
  useEffect(() => {
    if (!commerceEnabled || subscriptionLoading) return
    let active = true
    void Promise.all([getCommerceSummary(), getCommerceCategories()]).then(([overview, categoryList]) => { if (active) { setSummary(overview); setCategories(categoryList) } }).catch(() => { if (active) setError('No pudimos cargar el resumen de Comercio.') })
    return () => { active = false }
  }, [commerceEnabled, subscriptionLoading, revision])
  useEffect(() => {
    if (!commerceEnabled || subscriptionLoading) return
    let active = true
    setSalesLoading(true); setSalesError('')
    void getCommerceSales({ page: salesPage + 1, pageSize: 5 })
      .then(data => { if (active) { setSales(data.items); setTotalSales(data.total) } })
      .catch(() => { if (active) setSalesError('No pudimos cargar las ventas.') })
      .finally(() => { if (active) setSalesLoading(false) })
    return () => { active = false }
  }, [salesPage, commerceEnabled, subscriptionLoading, salesRevision])
  useEffect(() => { saleCache.current.clear() }, [revision])
  const normalizedSaleSearch = saleSearch.trim().toLocaleLowerCase()
  useEffect(() => {
    if (!saleOpen || !commerceEnabled) return
    let active = true
    setSaleLoading(true); setSaleProductId(''); setSaleSearchError(''); setSaleProducts([])
    const key = JSON.stringify([normalizedSaleSearch, salePage])
    const apply = (data: Awaited<ReturnType<typeof getCommerceProducts>>) => {
      if (!active) return
      if (salePage > 0 && !data.items.length) { setSalePage(Math.max(0, data.pages - 1)); return }
      setSaleProducts(data.items); setSaleTotal(data.total); setSaleLoading(false)
    }
    const cached = saleCache.current.get(key)
    if (cached) { apply(cached); return () => { active = false } }
    const timer = setTimeout(() => {
      void getCommerceProducts({ page: salePage + 1, pageSize: 20, search: normalizedSaleSearch, inStock: true }).then(data => {
        if (active) { saleCache.current.set(key, data); apply(data) }
      }).catch(() => { if (active) { setSaleSearchError('No pudimos buscar productos para la venta.'); setSaleTotal(0) } }).finally(() => { if (active) setSaleLoading(false) })
    }, 300)
    return () => { active = false; clearTimeout(timer) }
  }, [saleOpen, normalizedSaleSearch, salePage, commerceEnabled, revision, saleSearchRetry])
  if (subscriptionLoading || loading && !summary && !error) return <UiState loading />
  if (!commerceEnabled) return <LockedCommerce onUpgrade={() => navigate('/admin/suscripcion')} />

  const cartLines = Object.values(cart); const cartTotal = cartLines.reduce((sum, line) => sum + line.product.salePrice * line.quantity, 0)
  const openNewProduct = () => { setEditing(null); setProductForm(emptyProduct); setProductOpen(true) }
  const openEditProduct = (product: CommerceProduct) => { setEditing(product); setProductForm({ name: product.name, category: product.category, purchaseCost: String(product.purchaseCost), salePrice: String(product.salePrice), currentStock: String(product.currentStock) }); setProductOpen(true) }
  const closeProduct = () => { if (!saving) setProductOpen(false) }
  const saveProduct = async () => { const values = { name: productForm.name.trim(), category: productForm.category.trim(), purchaseCost: Number(productForm.purchaseCost), salePrice: Number(productForm.salePrice), currentStock: Number(productForm.currentStock) }; if (![values.purchaseCost, values.salePrice, values.currentStock].every(Number.isInteger) || !values.name || !values.category || values.purchaseCost < 0 || values.salePrice <= 0 || values.currentStock < 0 || values.salePrice < values.purchaseCost) return setError('Completá datos válidos. El precio debe cubrir el costo.'); setSaving(true); setError(''); try { if (editing) await updateCommerceProduct(editing.id, { ...values, expectedStock: editing.currentStock }); else await createCommerceProduct(values); setProductOpen(false); await load() } catch { setError('No pudimos guardar el producto. Si cambió el stock, cerrá y volvé a abrir el producto.'); await load() } finally { setSaving(false) } }
  const removeProduct = async (product: CommerceProduct) => { if (!window.confirm(`¿Eliminar ${product.name}?`)) return; setError(''); try { await deleteCommerceProduct(product.id); await load() } catch { setError('No pudimos eliminar el producto.') } }
  const openCategory = (category: CommerceCategory | null = null) => { setEditingCategory(category); setCategoryName(category?.name ?? ''); setCategoryError(''); setCategoryOpen(true) }
  const saveCategory = async () => {
    const name = categoryName.trim()
    if (name.length < 2 || name.length > 80) return setCategoryError('Usá entre 2 y 80 caracteres.')
    setSaving(true); setCategoryError('')
    try {
      if (editingCategory) await updateCommerceCategory(editingCategory.id, name)
      else await createCommerceCategory(name)
      setCategoryOpen(false); await load()
    } catch (error) { setCategoryError(isAxiosError(error) && typeof error.response?.data?.message === 'string' ? error.response.data.message : 'No pudimos guardar la categoría. Revisá si ya existe.') }
    finally { setSaving(false) }
  }
  const removeCategory = async (category: CommerceCategory) => { if (!window.confirm(`¿Eliminar la categoría ${category.name}?`)) return; setError(''); try { await deleteCommerceCategory(category.id); await load() } catch { setError('No podés eliminar una categoría que todavía tiene productos.') } }
  const changeCart = (product: CommerceProduct, amount: number) => setCart(current => { const next = Math.max(0, Math.min(product.currentStock, (current[product.id]?.quantity ?? 0) + amount)); if (!next) { const { [product.id]: _, ...rest } = current; return rest } return { ...current, [product.id]: { product, quantity: next } } })
  const addSelected = () => { const product = saleProducts.find(item => item.id === saleProductId); if (product) { changeCart(product, 1); setSaleProductId('') } }
  const confirmSale = async () => {
    if (!cartLines.length || submitting.current) return
    const input = {
      lines: cartLines.map(line => ({ productId: line.product.id, quantity: line.quantity, expectedUnitPrice: line.product.salePrice })).sort((a, b) => a.productId.localeCompare(b.productId)),
      paymentMethod,
      expectedTotal: cartTotal,
    }
    const fingerprint = JSON.stringify(input)
    if (saleAttempt.current?.fingerprint !== fingerprint) saleAttempt.current = { fingerprint, key: crypto.randomUUID() }
    submitting.current = true; setSaving(true); setError('')
    try {
      await createCommerceSale({ ...input, idempotencyKey: saleAttempt.current.key })
      saleAttempt.current = null
      setSalesRevision(value => value + 1)
      setCart({}); setSaleOpen(false); await load()
    } catch (error) {
      // Preserve the key: a lost response does not mean the server rolled back.
      setError(isAxiosError(error) && typeof error.response?.data?.message === 'string' ? error.response.data.message : 'No pudimos confirmar la venta. Podés reintentar sin duplicarla.')
      await load()
    } finally { submitting.current = false; setSaving(false) }
  }
  const saveExpense = async () => { const amount = Number(expense.amount); if (!expense.description.trim() || !Number.isInteger(amount) || amount <= 0) return setError('Completá descripción e importe.'); setSaving(true); setError(''); try { await createCommerceExpense({ description: expense.description.trim(), amount, paymentMethod: expense.paymentMethod }); setExpense({ description: '', amount: '', paymentMethod: 'TRANSFER' }); setExpenseOpen(false); await load() } catch { setError('No pudimos registrar el egreso.') } finally { setSaving(false) } }

  return <Box><PageHeader eyebrow="COMERCIO" title="Venta de accesorios y productos" description="Productos, stock y ventas de mostrador, separados de Reparaciones." action={<Stack direction="row" gap={1} flexWrap="wrap" justifyContent="flex-end"><Button variant="outlined" onClick={() => openCategory()} disabled={!canAccess(user, 'commerce.manage')}>Nueva categoría</Button><Button variant="outlined" startIcon={<Inventory2Rounded />} onClick={openNewProduct} disabled={!canAccess(user, 'commerce.manage')}>Nuevo producto</Button><Button variant="outlined" onClick={() => setExpenseOpen(true)} disabled={!canAccess(user, 'commerce.manage')}>Nuevo egreso</Button><Button variant="contained" startIcon={<PointOfSaleRounded />} onClick={() => setSaleOpen(true)} disabled={!canAccess(user, 'commerce.sell')}>Nueva venta</Button></Stack>} />
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    {summary && <Grid container spacing={1.5} mb={2.2}><Metric label="Ventas" value={String(summary.sales)} /><Metric label="Ingresos" value={formatMoney(summary.revenue)} /><Metric label="Costo mercadería" value={formatMoney(summary.costOfGoodsSold)} /><Metric label="Egresos comerciales" value={formatMoney(summary.commercialExpenses)} /><Metric label="Ganancia" value={formatMoney(summary.netProfit)} tone={summary.netProfit >= 0 ? 'success.main' : 'error.main'} /></Grid>}
    <PreserveAdminVisual><Card sx={{ mb: 2.2 }}><CardContent>
      <Stack direction="row" alignItems="center" spacing={1.5} mb={2}>
        <CategoryRounded color="primary" /><Box sx={{ flex: 1 }}><Typography variant="h2">Categorías</Typography><Typography variant="body2" color="text.secondary">Organizá tus productos.</Typography></Box><Chip size="small" label={categories.length} />
      </Stack>
      {categories.length ? <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 }}>
        {categories.map(category => <Stack key={category.id} direction="row" alignItems="center" spacing={1.5} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 1.5 }}>
          <Box sx={{ p: 1, display: 'flex', borderRadius: 2, bgcolor: 'action.hover', color: 'primary.main' }}><CategoryRounded fontSize="small" /></Box>
          <Box sx={{ flex: 1, minWidth: 0 }}><Typography fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{category.name}</Typography><Typography variant="body2" color="text.secondary">{category.productCount} {category.productCount === 1 ? 'producto activo' : 'productos activos'}</Typography></Box>
          {canAccess(user, 'commerce.manage') && <RowActionsMenu label={'Acciones de la categoría ' + category.name} actions={[
            { label: 'Editar nombre', icon: <EditRounded />, onClick: () => openCategory(category) },
            { label: category.productCount ? 'Eliminar (tiene productos)' : 'Eliminar', icon: <DeleteOutlineRounded />, destructive: true, disabled: category.productCount > 0, onClick: () => void removeCategory(category) },
          ]} />}
        </Stack>)}
      </Box> : <Typography color="text.secondary">Todavía no hay categorías creadas.</Typography>}
    </CardContent></Card></PreserveAdminVisual>
    <Card><CardContent><Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5} justifyContent="space-between" alignItems={{ sm: 'center' }} mb={2}><Box><Typography variant="h2">Productos</Typography><Typography variant="body2" color="text.secondary">Buscá productos o usá Nueva venta para agregarlos al carrito.</Typography></Box><Chip label={`${totalProducts} productos`} icon={<Inventory2Rounded />} /></Stack><FilterBar onClear={search ? () => setSearch('') : undefined}><TextField fullWidth label="Buscar productos" value={search} onChange={event => setSearch(event.target.value)} size="small" /></FilterBar>{loading ? <UiState loading /> : products.length ? <CommerceCatalog products={products} canManage={canAccess(user, 'commerce.manage')} onEdit={openEditProduct} onDelete={product => void removeProduct(product)} /> : <UiState title={productSearch ? 'No encontramos productos' : 'Todavía no hay productos'} description={productSearch ? 'Probá otro nombre o limpiá la búsqueda.' : 'Cargá tu primer accesorio para comenzar.'} action={canAccess(user, 'commerce.manage') ? openNewProduct : undefined} actionLabel="Nuevo producto"/>}{totalProducts > 20 && <TablePagination component="div" count={totalProducts} page={page} onPageChange={(_, next) => setPage(next)} rowsPerPage={20} rowsPerPageOptions={[20]} />}</CardContent></Card>
    <Card sx={{ mt: 2.2 }}><CardContent><Typography variant="h2" mb={2}>Ventas</Typography>{salesError && <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" disabled={salesLoading} onClick={() => setSalesRevision(value => value + 1)}>Reintentar ventas</Button>}>{salesError}</Alert>}{totalSales > 5 && <TablePagination component="div" count={totalSales} page={salesPage} rowsPerPage={5} rowsPerPageOptions={[5]} onPageChange={(_, next) => setSalesPage(next)} />}{salesLoading ? <UiState loading /> : sales.length ? <Stack divider={<Divider />} spacing={1}>{sales.map(sale => <Stack key={sale.id} direction={{ xs: 'column', sm: 'row' }} gap={1} justifyContent="space-between" py={1.5}><Typography>{new Date(sale.createdAt).toLocaleString('es-AR')}</Typography><Typography fontWeight={750}>{formatMoney(sale.total)} · ganancia {formatMoney(sale.profit)}</Typography></Stack>)}</Stack> : !salesError && <Typography color="text.secondary">Todavía no hay ventas de mostrador.</Typography>}</CardContent></Card>
    <ProductDrawer error={error} open={productOpen} editing={editing} form={productForm} categories={categories} saving={saving} onChange={setProductForm} onClose={closeProduct} onSave={() => void saveProduct()} />
    <PreserveAdminVisual><CategoryDrawer editing={!!editingCategory} error={categoryError} open={categoryOpen} name={categoryName} saving={saving} onName={setCategoryName} onClose={() => { if (!saving) setCategoryOpen(false) }} onSave={() => void saveCategory()} /></PreserveAdminVisual>
    <ExpenseDrawer open={expenseOpen} expense={expense} saving={saving} onChange={setExpense} onClose={() => setExpenseOpen(false)} onSave={() => void saveExpense()} />
    <SaleDrawer searchError={saleSearchError} onRetry={() => setSaleSearchRetry(value => value + 1)} open={saleOpen} error={error} search={saleSearch} onSearch={value => { setSaleSearch(value); setSalePage(0) }} page={salePage} count={saleTotal} onPage={setSalePage} loading={saleLoading} products={saleProducts} selected={saleProductId} cartLines={cartLines} total={cartTotal} paymentMethod={paymentMethod} saving={saving} onSelected={setSaleProductId} onAdd={addSelected} onChange={changeCart} onPayment={setPaymentMethod} onClose={() => { if (!saving) setSaleOpen(false) }} onSave={() => void confirmSale()} />
  </Box>
}

function ProductDrawer({ open, error, editing, form, categories, saving, onChange, onClose, onSave }: { open: boolean; error: string; editing: CommerceProduct | null; form: typeof emptyProduct; categories: CommerceCategory[]; saving: boolean; onChange: (value: typeof emptyProduct) => void; onClose: () => void; onSave: () => void }) { const field = (key: keyof typeof emptyProduct) => (event: React.ChangeEvent<HTMLInputElement>) => onChange({ ...form, [key]: event.target.value }); return <FormDrawer open={open} context="COMERCIO" title={editing ? 'Editar producto' : 'Nuevo producto'} saving={saving} submitLabel={editing ? 'Guardar cambios' : 'Crear producto'} submitDisabled={!form.name.trim() || !form.category || !form.purchaseCost || !form.salePrice} onClose={onClose} onSubmit={onSave}>{error && <Alert severity="error">{error}</Alert>}<FormSection title="Producto" description="Nombre y categoría para identificarlo en el catálogo."><TextField required label="Nombre" value={form.name} onChange={field('name')} /><TextField required select label="Categoría" value={form.category} onChange={field('category')}>{categories.map(category => <MenuItem key={category.id} value={category.name}>{category.name}</MenuItem>)}</TextField></FormSection><FormSection title="Precio y disponibilidad"><Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><TextField required type="number" label="Costo de compra" value={form.purchaseCost} onChange={field('purchaseCost')} /><TextField required type="number" label="Precio de venta" value={form.salePrice} onChange={field('salePrice')} /></Stack><Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><TextField required type="number" label="Stock actual" value={form.currentStock} onChange={field('currentStock')} /></Stack></FormSection></FormDrawer> }
function CategoryDrawer({ editing, error, open, name, saving, onName, onClose, onSave }: { editing: boolean; error: string; open: boolean; name: string; saving: boolean; onName: (value: string) => void; onClose: () => void; onSave: () => void }) { return <FormDrawer open={open} context="COMERCIO" title={editing ? 'Editar categoría' : 'Nueva categoría'} saving={saving} submitLabel={editing ? 'Guardar cambios' : 'Crear categoría'} submitDisabled={name.trim().length < 2 || name.trim().length > 80} onClose={onClose} onSubmit={onSave}>{error && <Alert severity="error">{error}</Alert>}<TextField autoFocus fullWidth required label="Nombre de categoría" value={name} onChange={event => onName(event.target.value)} /></FormDrawer> }
function ExpenseDrawer({ open, expense, saving, onChange, onClose, onSave }: { open: boolean; expense: { description: string; amount: string; paymentMethod: CommercePaymentMethod }; saving: boolean; onChange: (value: typeof expense) => void; onClose: () => void; onSave: () => void }) { return <FormDrawer open={open} context="COMERCIO" title="Nuevo egreso" saving={saving} submitLabel="Registrar egreso" submitDisabled={!expense.description.trim() || !expense.amount} onClose={onClose} onSubmit={onSave}><TextField required label="Descripción" value={expense.description} onChange={event => onChange({ ...expense, description: event.target.value })} /><TextField required type="number" label="Importe" value={expense.amount} onChange={event => onChange({ ...expense, amount: event.target.value })} /><TextField select label="Medio de pago" value={expense.paymentMethod} onChange={event => onChange({ ...expense, paymentMethod: event.target.value as CommercePaymentMethod })}>{paymentOptions.map(option => <MenuItem key={option[0]} value={option[0]}>{option[1]}</MenuItem>)}</TextField></FormDrawer> }
function SaleDrawer({ searchError, onRetry, open, error, search, onSearch, page, count, onPage, loading, products, selected, cartLines, total, paymentMethod, saving, onSelected, onAdd, onChange, onPayment, onClose, onSave }: { searchError: string; onRetry: () => void; open: boolean; error: string; search: string; onSearch: (value: string) => void; page: number; count: number; onPage: (page: number) => void; loading: boolean; products: CommerceProduct[]; selected: string; cartLines: Array<{ product: CommerceProduct; quantity: number }>; total: number; paymentMethod: CommercePaymentMethod; saving: boolean; onSelected: (value: string) => void; onAdd: () => void; onChange: (product: CommerceProduct, amount: number) => void; onPayment: (value: CommercePaymentMethod) => void; onClose: () => void; onSave: () => void }) { return <FormDrawer open={open} context="COMERCIO" title="Nueva venta" saving={saving} submitLabel="Confirmar venta" submitDisabled={!cartLines.length} onClose={onClose} onSubmit={onSave}>{error && <Alert severity="error">{error}</Alert>}<FormSection title="Agregar productos" description="Buscá un producto y agregalo a la venta."><TextField label="Buscar productos" value={search} onChange={event => onSearch(event.target.value)} />{searchError && <Alert severity="error" action={<Button onClick={onRetry}>Reintentar</Button>}>{searchError}</Alert>}{!loading && !searchError && !products.length && <Alert severity="info">{search.trim() ? 'No hay productos con stock que coincidan con tu búsqueda.' : 'No hay productos con stock disponibles.'}</Alert>}<TablePagination component="div" count={count} page={page} rowsPerPage={20} rowsPerPageOptions={[20]} onPageChange={(_, next) => onPage(next)} /><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'flex-start' }}><TextField fullWidth select disabled={loading || saving} label="Producto" value={selected} onChange={event => onSelected(event.target.value)}><MenuItem value="">Seleccionar producto</MenuItem>{products.map(product => <MenuItem key={product.id} value={product.id}>{product.name} · {formatMoney(product.salePrice)} · stock {product.currentStock}</MenuItem>)}</TextField><Button variant="outlined" startIcon={<AddRounded />} onClick={onAdd} disabled={!selected || loading || saving}>Agregar</Button></Stack></FormSection><FormSection title="Carrito">{cartLines.length ? <Stack spacing={1}>{cartLines.map(line => <Stack key={line.product.id} direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems={{ sm: 'center' }} justifyContent="space-between" sx={{ p: 1.5, bgcolor: '#F7F8FC', borderRadius: 2 }}><Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}><Typography fontWeight={700}>{line.product.name}</Typography><Typography variant="caption">{formatMoney(line.product.salePrice)} por unidad</Typography></Box><Stack direction="row" alignItems="center"><IconButton aria-label={'Quitar una unidad de '+line.product.name} size="small" onClick={() => onChange(line.product, -1)}><RemoveRounded /></IconButton><Typography width={24} textAlign="center">{line.quantity}</Typography><IconButton aria-label={'Agregar una unidad de '+line.product.name} size="small" onClick={() => onChange(line.product, 1)} disabled={line.quantity >= line.product.currentStock}><AddRounded /></IconButton></Stack></Stack>)}</Stack> : <Typography color="text.secondary">Agregá productos para preparar la venta.</Typography>}</FormSection><FormSection title="Cobro"><TextField select label="Medio de pago" value={paymentMethod} onChange={event => onPayment(event.target.value as CommercePaymentMethod)}>{paymentOptions.map(option => <MenuItem key={option[0]} value={option[0]}>{option[1]}</MenuItem>)}</TextField><Stack direction="row" justifyContent="space-between"><Typography variant="h2">Total</Typography><Typography variant="h2">{formatMoney(total)}</Typography></Stack></FormSection></FormDrawer> }
function LockedCommerce({ onUpgrade }: { onUpgrade: () => void }) { return <Card><CardContent><Stack alignItems="center" textAlign="center" spacing={2} py={8}><LockRounded color="primary" sx={{ fontSize: 52 }} /><Typography variant="h1">Comercio está incluido en el Plan Completo</Typography><Typography color="text.secondary" maxWidth={560}>Vendé cargadores, cables, fundas y otros accesorios con stock, caja y ganancia por producto.</Typography><Button variant="contained" onClick={onUpgrade}>Mejorar plan</Button></Stack></CardContent></Card> }
function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) { return <Grid size={{ xs: 6, md: 4, xl: 2.4 }}><StatCard label={label} value={value} icon={<PointOfSaleRounded />} tone={tone === 'success.main' ? 'success' : tone === 'error.main' ? 'warning' : 'primary'} /></Grid> }
