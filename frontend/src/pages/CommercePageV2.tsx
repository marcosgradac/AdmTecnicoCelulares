import { FormSection } from '../components/admin/AdminPatterns'
import { AdminVisualScope } from '../components/admin/AdminVisualScope'
import { CommerceCategoryCarousel } from '../components/commerce/CommerceCategoryCarousel'
import { CommerceCategoryWorkspace } from '../components/commerce/CommerceCategoryWorkspace'
import { CommerceProductsSection } from '../components/commerce/CommerceProductsSection'
import { LockedCommerce } from '../components/commerce/LockedCommerce'
import { CommerceMetricsRow } from '../components/commerce/CommerceMetricsRow'
import { CATEGORY_ICON_GROUPS, CATEGORY_ICONS, categoryIcon } from '../components/commerce/categoryIcons'
import { isAxiosError } from 'axios'
import { useEffect, useMemo, useState } from 'react'
import { AccountBalanceWalletRounded, AddRounded, ClearRounded, LockRounded, PaidRounded, PriceChangeRounded, ReceiptLongRounded, SearchRounded, TrendingUpRounded } from '@mui/icons-material'
import { alpha } from '@mui/material/styles'
import { Alert, Box, Button, Card, CardContent, Chip, IconButton, InputAdornment, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { canAccess } from '../auth/permissions'
import { useSubscription } from '../features/billing/SubscriptionContext'
import { createCommerceCategory, createCommerceProduct, deleteCommerceCategory, deleteCommerceProduct, getCommerceCategories, getCommerceSummary, updateCommerceProduct, updateCommerceCategory, type CommerceCategory, type CommerceProduct, type CommerceSummary } from '../services/commerce'
import { formatMoney } from '../utils/format'
import { PageHeader } from '../components/common/PageHeader'
import { FormDrawer } from '../components/common/FormDrawer'
import { UiState } from '../components/common/UiState'
import { DeleteCategoryDialog } from '../components/commerce/DeleteCategoryDialog'
import { DeleteProductDialog } from '../components/commerce/DeleteProductDialog'

const emptyProduct = { name: '', category: '', purchaseCost: '', salePrice: '', currentStock: '' }

type Cart = Record<string, { product: CommerceProduct; quantity: number }>

export function CommercePageV2() {
  const navigate = useNavigate(); const { user } = useAuth(); const { commerceEnabled, loading: subscriptionLoading } = useSubscription()
  const [categories, setCategories] = useState<CommerceCategory[]>([]), [summary, setSummary] = useState<CommerceSummary | null>(null)
  const [error, setError] = useState(''), [saving, setSaving] = useState(false)
  const [productOpen, setProductOpen] = useState(false), [categoryOpen, setCategoryOpen] = useState(false)
  const [editing, setEditing] = useState<CommerceProduct | null>(null), [productForm, setProductForm] = useState(emptyProduct), [categoryName, setCategoryName] = useState('')
  const [revision, setRevision] = useState(0)
  // El workspace contextual abre el drawer con la categoría fija; la tabla general lo abre
  // libre para poder elegirla. Al editar siempre se puede cambiar de categoría.
  const [productCategoryLocked, setProductCategoryLocked] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<CommerceCategory | null>(null)
  const [categorySearch, setCategorySearch] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'product'; item: CommerceProduct } | { kind: 'category'; item: CommerceCategory } | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [editingCategory, setEditingCategory] = useState<CommerceCategory | null>(null)
  const [categoryIconKey, setCategoryIconKey] = useState<string | null>(null)
  const [categoryError, setCategoryError] = useState('')

  const canView = canAccess(user, 'commerce.view')
  const canManage = canAccess(user, 'commerce.manage')

  const load = async () => { setRevision(value => value + 1) }

  useEffect(() => {
    if (!canView || !commerceEnabled || subscriptionLoading) return
    let active = true
    void Promise.all([getCommerceSummary(), getCommerceCategories()])
      .then(([overview, categoryList]) => {
        if (!active) return
        setSummary(overview); setCategories(categoryList)
        setSelectedCategory(current => current ? categoryList.find(category => category.id === current.id) ?? null : null)
      })
      .catch(() => { if (active) setError('No pudimos cargar el resumen de Comercio.') })
    return () => { active = false }
  }, [canView, commerceEnabled, subscriptionLoading, revision])

  if (!canView) return <Alert severity="warning">No tenés permiso para ver Comercio.</Alert>
  if (subscriptionLoading) return <UiState loading />
  if (!commerceEnabled) return <LockedCommerce onUpgrade={() => navigate('/admin/suscripcion')} />

  const openNewProduct = (categoryName?: string) => { if (!canManage) return; setError(''); setEditing(null); setProductForm({ ...emptyProduct, category: categoryName ?? '' }); setProductCategoryLocked(Boolean(categoryName)); setProductOpen(true) }
  const openEditProduct = (product: CommerceProduct) => { if (!canManage) return; setError(''); setEditing(product); setProductForm({ name: product.name, category: product.category, purchaseCost: String(product.purchaseCost), salePrice: String(product.salePrice), currentStock: String(product.currentStock) }); setProductOpen(true) }
  const closeProduct = () => { if (!saving) setProductOpen(false) }

  const saveProduct = async () => {
    if (!canManage || saving) return
    const values = { name: productForm.name.trim(), category: productForm.category.trim(), purchaseCost: Number(productForm.purchaseCost), salePrice: Number(productForm.salePrice), currentStock: Number(productForm.currentStock) }
    if (![values.purchaseCost, values.salePrice, values.currentStock].every(Number.isInteger) || !values.name || !values.category || values.purchaseCost < 0 || values.salePrice <= 0 || values.currentStock < 0 || values.salePrice < values.purchaseCost) return setError('Completá datos válidos. El precio debe cubrir el costo.')
    setSaving(true); setError('')
    try {
      if (editing) await updateCommerceProduct(editing.id, { ...values, expectedStock: editing.currentStock })
      else await createCommerceProduct(values)
      setProductOpen(false); await load()
    } catch (failure) {
      setError(isAxiosError(failure) && typeof failure.response?.data?.message === 'string' ? failure.response.data.message : 'No pudimos guardar el producto. Si cambió el stock, cerrá y volvé a abrir el producto.')
      await load()
    } finally { setSaving(false) }
  }

  const removeProduct = (product: CommerceProduct) => { if (canManage) { setDeleteError(''); setDeleteTarget({ kind: 'product', item: product }) } }
  const removeCategory = (category: CommerceCategory) => { if (canManage) { setDeleteError(''); setDeleteTarget({ kind: 'category', item: category }) } }

  const openCategory = (category: CommerceCategory | null = null) => {
    if (!canManage) return
    setCategoryError(''); setEditingCategory(category); setCategoryName(category?.name ?? ''); setCategoryIconKey(category?.iconKey ?? null); setCategoryOpen(true)
  }

  const saveCategory = async () => {
    if (!canManage || saving) return
    const name = categoryName.trim()
    if (name.length < 2 || name.length > 80) return setCategoryError('El nombre debe tener entre 2 y 80 caracteres.')
    setSaving(true); setCategoryError('')
    try {
      if (editingCategory) await updateCommerceCategory(editingCategory.id, name, categoryIconKey)
      else await createCommerceCategory(name, categoryIconKey)
      setCategoryOpen(false); await load()
    } catch (failure) {
      setCategoryError(isAxiosError(failure) && typeof failure.response?.data?.message === 'string' ? failure.response.data.message : 'No pudimos guardar la categoría.')
    } finally { setSaving(false) }
  }

  const confirmDelete = async () => {
    if (!deleteTarget || saving) return
    setSaving(true); setDeleteError('')
    try {
      if (deleteTarget.kind === 'product') await deleteCommerceProduct(deleteTarget.item.id)
      else await deleteCommerceCategory(deleteTarget.item.id)
      setDeleteTarget(null); await load()
    } catch { setDeleteError('No pudimos eliminar el registro.') } finally { setSaving(false) }
  }

  return <Box sx={{ minWidth: 0 }}>
    <PageHeader
      title="Comercio"
      description="Administrá las categorías, productos, stock y precios de tu comercio."
      action={canManage && !saving && !selectedCategory ? (
        <Stack direction="row" gap={1} flexWrap="wrap">
          <Button variant="outlined" startIcon={<AddRounded />} onClick={() => openCategory()}>Nueva categoría</Button>
          <Button variant="contained" startIcon={<AddRounded />} onClick={() => openNewProduct()}>Nuevo producto</Button>
        </Stack>
      ) : undefined}
    />
    {error && <Alert severity="error" sx={{ mb: 2.5 }}>{error}</Alert>}
    {summary && <CommerceMetricsRow metrics={[
      { label: 'Ventas', value: String(summary.sales), tone: 'primary', icon: ReceiptLongRounded },
      { label: 'Ingresos', value: formatMoney(summary.revenue), tone: 'success', icon: PaidRounded },
      { label: 'Costo mercadería', value: formatMoney(summary.costOfGoodsSold), tone: 'warning', icon: PriceChangeRounded },
      { label: 'Egresos comerciales', value: formatMoney(summary.commercialExpenses), tone: 'expense', icon: AccountBalanceWalletRounded },
      { label: 'Ganancia', value: formatMoney(summary.netProfit), tone: summary.netProfit >= 0 ? 'strongSuccess' : 'expense', icon: TrendingUpRounded },
    ]} />}
    {selectedCategory
      ? <CommerceCategoryWorkspace
          key={selectedCategory.id}
          category={selectedCategory}
          canManage={canManage && !saving}
          onBack={() => setSelectedCategory(null)}
          onNewProduct={() => openNewProduct(selectedCategory.name)}
          onEditCategory={() => openCategory(selectedCategory)}
          onDeleteCategory={() => removeCategory(selectedCategory)}
          onEditProduct={openEditProduct}
          onDeleteProduct={removeProduct}
          revision={revision}
        />
      : <>
          <CommerceCategoryCarousel
            categories={categories}
            canManage={canManage && !saving}
            searchQuery={categorySearch}
            onSearchChange={setCategorySearch}
            onSelectCategory={setSelectedCategory}
            onEditCategory={openCategory}
            onDeleteCategory={removeCategory}
          />
          <CommerceProductsSection
            canManage={canManage && !saving}
            onNewProduct={() => openNewProduct()}
            onEditProduct={openEditProduct}
            onDeleteProduct={removeProduct}
            revision={revision}
          />
        </>}
    <ProductDrawer error={error} open={productOpen} editing={editing} form={productForm} categories={categories} categoryLocked={productCategoryLocked} saving={saving} onChange={setProductForm} onClose={closeProduct} onSave={() => void saveProduct()} />
    <AdminVisualScope enabled>
      <CategoryDrawer editing={!!editingCategory} error={categoryError} open={categoryOpen} name={categoryName} iconKey={categoryIconKey} saving={saving} onName={setCategoryName} onIcon={setCategoryIconKey} onClose={() => { if (!saving) setCategoryOpen(false) }} onSave={() => void saveCategory()} />
    </AdminVisualScope>
    <DeleteCategoryDialog category={deleteTarget?.kind === 'category' ? deleteTarget.item : null} deleting={saving} error={deleteError} onClose={() => { if (!saving) setDeleteTarget(null) }} onConfirm={() => void confirmDelete()} />
    <DeleteProductDialog product={deleteTarget?.kind === 'product' ? deleteTarget.item : null} deleting={saving} error={deleteError} onClose={() => { if (!saving) setDeleteTarget(null) }} onConfirm={() => void confirmDelete()} />
  </Box>
}

function ProductDrawer({ open, error, editing, form, categories, categoryLocked, saving, onChange, onClose, onSave }: { open: boolean; error: string; editing: CommerceProduct | null; form: typeof emptyProduct; categories: CommerceCategory[]; categoryLocked: boolean; saving: boolean; onChange: (value: typeof emptyProduct) => void; onClose: () => void; onSave: () => void }) {
  const field = (key: keyof typeof emptyProduct) => (event: React.ChangeEvent<HTMLInputElement>) => onChange({ ...form, [key]: event.target.value })
  return (
    <FormDrawer open={open} context="COMERCIO" title={editing ? 'Editar producto' : 'Nuevo producto'} saving={saving} submitLabel={editing ? 'Guardar cambios' : 'Crear producto'} submitDisabled={!form.name.trim() || !form.category || !form.purchaseCost || !form.salePrice} onClose={onClose} onSubmit={onSave}>
      {error && <Alert severity="error">{error}</Alert>}
      <FormSection title="Información del producto" description="Nombre y categoría para identificarlo en el catálogo.">
        <TextField required autoFocus fullWidth label="Nombre" placeholder="Ej.: Cable USB-C 1 m" value={form.name} onChange={field('name')} helperText="Se muestra en el catálogo y en el punto de venta." />
        {editing || !categoryLocked
          ? categories.length > 0
            ? <TextField required select fullWidth label="Categoría" value={form.category} onChange={field('category')}>{categories.map(category => <MenuItem key={category.id} value={category.name}>{category.name}</MenuItem>)}</TextField>
            : <Alert severity="warning">Primero creá una categoría: todo producto necesita una para organizarse.</Alert>
          : <Stack direction="row" alignItems="center" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}><Typography variant="caption" color="text.secondary">Se creará en la categoría</Typography><Chip size="small" color="primary" variant="outlined" label={form.category} /></Stack>}
      </FormSection>
      <FormSection title="Precios y stock" description="Completá el costo, el precio de venta y las unidades disponibles.">
        <Stack spacing={2.25}>
          <TextField required fullWidth type="number" label="Costo de compra" value={form.purchaseCost} onChange={field('purchaseCost')} helperText="Lo que pagás por unidad." slotProps={{ htmlInput: { min: 0 } }} />
          <TextField required fullWidth type="number" label="Precio de venta" value={form.salePrice} onChange={field('salePrice')} helperText="Precio final para el cliente. Debe cubrir el costo." slotProps={{ htmlInput: { min: 0 } }} />
          <TextField required fullWidth type="number" label="Stock actual" value={form.currentStock} onChange={field('currentStock')} helperText="Unidades disponibles ahora." slotProps={{ htmlInput: { min: 0 } }} />
        </Stack>
      </FormSection>
    </FormDrawer>
  )
}

function CategoryIconPicker({ value, onChange }: { value: string | null; onChange: (key: string | null) => void }) {
  const [query, setQuery] = useState('')
  const normalized = query.trim().toLocaleLowerCase()
  const matches = useMemo(() => {
    if (!normalized) return CATEGORY_ICONS
    return CATEGORY_ICONS.filter(entry => `${entry.label} ${entry.group}`.toLocaleLowerCase().includes(normalized))
  }, [normalized])
  const visibleGroups = useMemo(
    () => CATEGORY_ICON_GROUPS
      .map(group => ({ group, entries: matches.filter(entry => entry.group === group) }))
      .filter(section => section.entries.length > 0),
    [matches],
  )
  const selectedLabel = CATEGORY_ICONS.find(entry => entry.key === (value ?? 'generic'))?.label ?? 'General'
  const Selected = categoryIcon(value)

  return <Box>
    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1.5} sx={{ mb: 1, flexWrap: 'wrap', rowGap: 0.5 }}>
      <Typography variant="body2" fontWeight={650}>Icono de la categoría</Typography>
      <Typography variant="caption" color="text.secondary">{CATEGORY_ICONS.length} opciones</Typography>
    </Stack>
    <Stack spacing={1.25} sx={{ mb: 1.5, p: 1, pl: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2.5, bgcolor: 'background.paper' }}>
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <Box sx={{ width: 40, height: 40, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 2, bgcolor: theme => alpha(theme.palette.primary.main, 0.1), color: 'primary.main' }}>
          <Selected sx={{ fontSize: 21 }} />
        </Box>
        <Box minWidth={0}>
          <Typography variant="caption" color="text.secondary" display="block">Icono elegido</Typography>
          <Typography variant="body2" fontWeight={700} noWrap title={selectedLabel}>{selectedLabel}</Typography>
        </Box>
      </Box>
      <TextField
        fullWidth
        size="small"
        placeholder="Buscar icono"
        value={query}
        onChange={event => setQuery(event.target.value)}
        slotProps={{
          input: {
            startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" color="action" /></InputAdornment>,
            endAdornment: query ? <InputAdornment position="end"><IconButton size="small" edge="end" aria-label="Limpiar búsqueda de iconos" onClick={() => setQuery('')}><ClearRounded fontSize="small" /></IconButton></InputAdornment> : null,
          },
        }}
      />
    </Stack>
    {visibleGroups.length === 0 ? (
      <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center', borderRadius: 2, bgcolor: 'action.hover' }}>
        No encontramos iconos que coincidan con «{query.trim()}».
      </Typography>
    ) : (
      <Box sx={{ maxHeight: 300, overflowY: 'auto', px: 0.5, mx: -0.5 }}>
        {visibleGroups.map(({ group, entries }) => (
          <Box key={group} sx={{ mb: 1.5 }}>
            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '.04em' }} display="block" mb={0.75}>{group}</Typography>
            <Box role="radiogroup" aria-label={`Iconos de ${group}`} sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(52px, 1fr))', gap: 0.75 }}>
              {entries.map(({ key, label, icon: Option }) => {
                const selected = (value ?? 'generic') === key
                return <Box
                  key={key}
                  role="radio"
                  tabIndex={selected ? 0 : -1}
                  aria-checked={selected}
                  aria-label={label}
                  title={label}
                  onClick={() => onChange(key === 'generic' ? null : key)}
                  onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onChange(key === 'generic' ? null : key) } }}
                  sx={{
                    display: 'grid', placeItems: 'center', height: 48, minWidth: 0, borderRadius: 2, cursor: 'pointer',
                    border: '1px solid',
                    borderColor: selected ? 'primary.main' : 'divider',
                    bgcolor: selected ? theme => alpha(theme.palette.primary.main, 0.1) : 'background.paper',
                    color: selected ? 'primary.main' : 'text.secondary',
                    transition: 'border-color .15s ease, background-color .15s ease, color .15s ease',
                    '&:hover': { borderColor: 'primary.main', color: 'primary.main' },
                    '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 1 },
                  }}
                >
                  <Option sx={{ fontSize: 21 }} />
                </Box>
              })}
            </Box>
          </Box>
        ))}
      </Box>
    )}
  </Box>
}

function CategoryDrawer({ editing, error, open, name, iconKey, saving, onName, onIcon, onClose, onSave }: { editing: boolean; error: string; open: boolean; name: string; iconKey: string | null; saving: boolean; onName: (value: string) => void; onIcon: (value: string | null) => void; onClose: () => void; onSave: () => void }) {
  return <FormDrawer open={open} context="COMERCIO" title={editing ? 'Editar categoría' : 'Nueva categoría'} saving={saving} submitLabel={editing ? 'Guardar cambios' : 'Crear categoría'} submitDisabled={name.trim().length < 2 || name.trim().length > 80} onClose={onClose} onSubmit={onSave}>
    {error && <Alert severity="error">{error}</Alert>}
    <Stack spacing={2.25}>
      <TextField autoFocus fullWidth required label="Nombre de categoría" value={name} onChange={event => onName(event.target.value)} />
      <CategoryIconPicker value={iconKey} onChange={onIcon} />
    </Stack>
  </FormDrawer>
}
