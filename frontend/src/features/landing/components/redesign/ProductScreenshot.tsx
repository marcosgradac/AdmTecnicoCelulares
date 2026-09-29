import type { ReactNode } from 'react'
import dashboardDesktop from '../../../../assets/landing/product/03-dashboard-desktop.webp'
import dashboardMobile from '../../../../assets/landing/product/05-dashboard-mobile.webp'
import repairsDesktop from '../../../../assets/landing/product/06-repairs-desktop.webp'
import repairDetailDesktop from '../../../../assets/landing/product/08-repair-detail-desktop.webp'
import clientDetailDesktop from '../../../../assets/landing/product/12-client-detail-desktop.webp'
import trackingDesktop from '../../../../assets/landing/product/13-tracking-desktop.webp'
import trackingMobile from '../../../../assets/landing/product/14-tracking-mobile.webp'
import cashDesktop from '../../../../assets/landing/product/15-cash-desktop.webp'
import warrantiesDesktop from '../../../../assets/landing/product/17-warranties-desktop.webp'
import posDesktop from '../../../../assets/landing/product/21-pos-desktop.webp'
import equipmentSalesDesktop from '../../../../assets/landing/product/23-equipment-sales-desktop.webp'
import teamDesktop from '../../../../assets/landing/product/25-team-desktop.webp'

/**
 * Capturas reales de TecnoDesk (dataset de demostración), recodificadas a WebP sin
 * alterar la interfaz que muestran. Son las únicas imágenes de producto de la
 * landing: no hay mockups generados ni pantallas reconstruidas en CSS.
 */
export const productShots = {
  dashboardDesktop: { src: dashboardDesktop, width: 1440, height: 900, alt: 'Panel de TecnoDesk con el resultado de caja, reparaciones activas, equipos listos para entregar y el gráfico de ingresos y egresos del mes' },
  dashboardMobile: { src: dashboardMobile, width: 430, height: 900, alt: 'Panel de TecnoDesk visto desde el celular' },
  repairsDesktop: { src: repairsDesktop, width: 1440, height: 900, alt: 'Listado de reparaciones de TecnoDesk con estado, cobro, saldo, fecha de ingreso y fecha de entrega estimada' },
  repairDetailDesktop: { src: repairDetailDesktop, width: 1440, height: 900, alt: 'Detalle de una reparación con datos del equipo, el cliente y la garantía' },
  clientDetailDesktop: { src: clientDetailDesktop, width: 1440, height: 900, alt: 'Ficha de un cliente con sus reparaciones, pagos y dispositivos' },
  trackingDesktop: { src: trackingDesktop, width: 1440, height: 900, alt: 'Página pública de seguimiento de una reparación con el estado actual y el progreso del trabajo' },
  trackingMobile: { src: trackingMobile, width: 430, height: 900, alt: 'Página de seguimiento de una reparación vista desde el celular' },
  cashDesktop: { src: cashDesktop, width: 1440, height: 900, alt: 'Caja General con ingresos, egresos, balance y movimientos identificados por origen' },
  warrantiesDesktop: { src: warrantiesDesktop, width: 1440, height: 900, alt: 'Panel de garantías con las vigencias y los reclamos' },
  posDesktop: { src: posDesktop, width: 1440, height: 900, alt: 'Punto de venta de TecnoDesk con productos, stock, precio y carrito de venta' },
  equipmentSalesDesktop: { src: equipmentSalesDesktop, width: 1440, height: 900, alt: 'Compra y reventa de equipos con estados, precio de compra, gastos, precio de venta y ganancia' },
  teamDesktop: { src: teamDesktop, width: 1440, height: 900, alt: 'Listado del equipo con el rol y los módulos que puede usar cada técnico' },
} as const

export type ProductShot = (typeof productShots)[keyof typeof productShots]

/**
 * Marco de navegador alrededor de una captura real. La imagen nunca se estira ni
 * se recompone: se recorta con `object-fit: cover` sólo si hace falta, y siempre
 * dentro de su propia caja para no generar scroll horizontal en la página.
 */
export function ProductScreenshot({ shot, priority = false, className = '', width, height, cover = false }: {
  shot: ProductShot
  priority?: boolean
  className?: string
  width?: number
  height?: number
  cover?: boolean
}) {
  return <figure className={`product-shot ${cover ? 'is-cover' : ''} ${className}`}>
    <div className="product-shot__chrome" aria-hidden="true">
      <span className="product-shot__dots"><i/><i/><i/></span>
      <span className="product-shot__bar">tecnodesk.app</span>
    </div>
    <div className="product-shot__viewport">
      <img
        src={shot.src}
        alt={shot.alt}
        width={width ?? shot.width}
        height={height ?? shot.height}
        loading={priority ? 'eager' : 'lazy'}
        decoding={priority ? 'sync' : 'async'}
        fetchPriority={priority ? 'high' : 'auto'}
      />
    </div>
  </figure>
}
