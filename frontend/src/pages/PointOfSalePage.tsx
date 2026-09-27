import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Box, Snackbar } from '@mui/material'
import { isAxiosError } from 'axios'
import { CommercePointOfSale } from '../components/commerce/CommercePointOfSale'
import { CommerceSalesTable } from '../components/commerce/CommerceSalesTable'
import { LockedCommerce } from '../components/commerce/LockedCommerce'
import { PageHeader } from '../components/common/PageHeader'
import { UiState } from '../components/common/UiState'
import { useAuth } from '../auth/AuthContext'
import { canAccess } from '../auth/permissions'
import { useSubscription } from '../features/billing/SubscriptionContext'
import { createCommerceSale, type CommercePaymentMethod, type CommerceProduct } from '../services/commerce'

type Cart = Record<string, { product: CommerceProduct; quantity: number }>

/**
 * Pantalla "Punto de venta" del módulo Comercio.
 *
 * Es el hogar del POS: acá vive el carrito, la clave de idempotencia y la confirmación
 * de venta. Reutiliza `CommercePointOfSale` sin duplicarlo, y comparte con Comercio el
 * mismo feature gate de plan y los mismos permisos (`commerce.view` para entrar,
 * `commerce.sell` para vender). El contrato con el backend no cambia: la venta sigue
 * yendo por `createCommerceSale`, que es quien descuenta stock y genera el CashMovement.
 */
export function PointOfSalePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { commerceEnabled, loading: subscriptionLoading } = useSubscription()
  const [cart, setCart] = useState<Cart>({})
  const [paymentMethod, setPaymentMethod] = useState<CommercePaymentMethod>('CASH')
  const [saving, setSaving] = useState(false)
  const [revision, setRevision] = useState(0)
  const [saleError, setSaleError] = useState('')
  const [saleSuccess, setSaleSuccess] = useState(false)
  const [cancelSuccess, setCancelSuccess] = useState(false)
  const submitting = useRef(false)
  const saleAttempt = useRef<{ fingerprint: string; key: string } | null>(null)

  const canView = canAccess(user, 'commerce.view')
  const canSell = canAccess(user, 'commerce.sell')
  /** Cancelar es una acción de gestión: `commerce.sell` alcanza para registrar una venta. */
  const canCancel = canAccess(user, 'commerce.manage')

  const load = async () => { setRevision(value => value + 1) }

  if (!canView) return <Alert severity="warning">No tenés permiso para ver Comercio.</Alert>
  if (subscriptionLoading) return <UiState loading />
  if (!commerceEnabled) return <LockedCommerce onUpgrade={() => navigate('/admin/suscripcion')} />

  const cartLines = Object.values(cart)
  const cartTotal = cartLines.reduce((sum, line) => sum + line.product.salePrice * line.quantity, 0)

  const changeCart = (product: CommerceProduct, delta: number) => {
    if (!canSell || saving || submitting.current) return
    setCart(current => {
      const line = current[product.id]
      const quantity = Math.max(0, Math.min(product.currentStock, (line?.quantity ?? 0) + delta))
      if (quantity === 0) { const { [product.id]: _removed, ...rest } = current; return rest }
      return { ...current, [product.id]: { product, quantity } }
    })
  }

  const confirmSale = async () => {
    if (!canSell || saving || !cartLines.length) return
    const input = {
      lines: cartLines.map(line => ({ productId: line.product.id, quantity: line.quantity, expectedUnitPrice: line.product.salePrice })),
      paymentMethod,
      expectedTotal: cartTotal,
    }
    const fingerprint = JSON.stringify(input)
    if (saleAttempt.current?.fingerprint !== fingerprint) saleAttempt.current = { fingerprint, key: crypto.randomUUID() }
    submitting.current = true; setSaving(true); setSaleError('')
    try {
      await createCommerceSale({ ...input, idempotencyKey: saleAttempt.current.key })
      saleAttempt.current = null
      setCart({}); setSaleSuccess(true); await load()
    } catch (failure) {
      // Se conserva la clave: perder la respuesta no significa que el servidor haya revertido.
      setSaleError(isAxiosError(failure) && typeof failure.response?.data?.message === 'string' ? failure.response.data.message : 'No pudimos confirmar la venta. Podés reintentar sin duplicarla.')
      await load()
    } finally { submitting.current = false; setSaving(false) }
  }

  return <Box sx={{ minWidth: 0 }}>
    <PageHeader title="Punto de venta" description="Buscá productos, armá el carrito y registrá la venta." />
    <CommercePointOfSale
      canSell={canSell}
      cart={cart}
      paymentMethod={paymentMethod}
      saving={saving}
      error={saleError}
      onCartChange={changeCart}
      onRemoveCartLine={id => { if (canSell && !saving && !submitting.current) setCart(current => { const { [id]: _removed, ...rest } = current; return rest }) }}
      onPaymentMethodChange={method => { if (canSell && !saving && !submitting.current) setPaymentMethod(method) }}
      onConfirmSale={() => void confirmSale()}
      revision={revision}
    />
    {/* El historial se refresca con la misma revision que los productos, asi una venta
        nueva o una cancelacion actualizan stock y listado sin recargar la pagina. */}
    <CommerceSalesTable revision={revision} canManage={canCancel} onCancelled={() => { void load(); setCancelSuccess(true) }} />
    <Snackbar open={cancelSuccess} autoHideDuration={6000} onClose={() => setCancelSuccess(false)}><Alert severity="info" onClose={() => setCancelSuccess(false)}>Venta cancelada. Se restauro el stock y se registro la devolucion en Caja.</Alert></Snackbar>
    <Snackbar open={saleSuccess} autoHideDuration={6000} onClose={() => setSaleSuccess(false)}><Alert severity="success" onClose={() => setSaleSuccess(false)}>Venta registrada correctamente.</Alert></Snackbar>
  </Box>
}