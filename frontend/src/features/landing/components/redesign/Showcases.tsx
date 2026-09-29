import type { ReactNode } from 'react'
import { ProductScreenshot, productShots } from './ProductScreenshot'

function Check() {
  return <svg className="showcase__check" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
    <path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}

/**
 * Bloque de sección alternada: captura real a un lado, texto al otro.
 * `reverse` invierte el orden para que la página no repita siempre la misma
 * composición al bajar.
 */
export function ShowcaseSection({ id, eyebrow, title, description, points, reverse = false, tone = 'plain', children }: {
  id: string
  eyebrow: string
  title: ReactNode
  description: string
  points: string[]
  reverse?: boolean
  tone?: 'plain' | 'tinted'
  children: ReactNode
}) {
  return <section id={id} className={`showcase showcase--${tone} ${reverse ? 'is-reversed' : ''}`} aria-labelledby={`${id}-title`}>
    <div className="landing-container showcase__grid" data-reveal>
      <div className="showcase__copy">
        <span className="showcase__eyebrow">{eyebrow}</span>
        <h2 id={`${id}-title`} className="showcase__title">{title}</h2>
        <p className="showcase__description">{description}</p>
        <ul className="showcase__points">{points.map(point => <li key={point}><Check />{point}</li>)}</ul>
      </div>
      <div className="showcase__visual">{children}</div>
    </div>
  </section>
}

export function RepairsShowcase() {
  return <ShowcaseSection
    id="reparaciones"
    eyebrow="Reparaciones"
    title={<>Controlá <em>cada reparación</em></>}
    description="Seguí cada ingreso desde que recibís el equipo hasta la entrega, con estados claros, presupuesto, pagos e historial."
    points={['Estados de reparación', 'Presupuestos y pagos', 'Historial del equipo', 'Fechas estimadas', 'Datos del cliente y dispositivo']}
  >
    <div className="showcase__stack">
      <ProductScreenshot shot={productShots.repairsDesktop} />
      <ProductScreenshot shot={productShots.repairDetailDesktop} className="showcase__float-card" />
    </div>
  </ShowcaseSection>
}

export function WarrantiesShowcase() {
  return <ShowcaseSection
    id="garantias"
    eyebrow="Garantías"
    tone="tinted"
    reverse
    title={<>La reparación no termina <em>cuando la entregás</em></>}
    description="Gestioná garantías, vencimientos y reclamos manteniendo todo relacionado con la reparación original."
    points={['Garantías activas', 'Próximas a vencer', 'Reclamos', 'Gastos de garantía', 'Historial vinculado a la reparación']}
  >
    <ProductScreenshot shot={productShots.warrantiesDesktop} />
  </ShowcaseSection>
}

export function PosShowcase() {
  return <ShowcaseSection
    id="punto-de-venta"
    eyebrow="Punto de venta"
    title={<>Vendé accesorios <em>desde el mismo sistema</em></>}
    description="Usá el punto de venta para registrar productos y ventas sin salir de TecnoDesk."
    points={['Productos', 'Categorías', 'Stock', 'Precio de compra y venta', 'Múltiples medios de pago', 'Movimiento registrado en Caja']}
  >
    <ProductScreenshot shot={productShots.posDesktop} />
  </ShowcaseSection>
}

export function EquipmentSalesShowcase() {
  return <ShowcaseSection
    id="reventa"
    eyebrow="Reventa de equipos"
    tone="tinted"
    title={<>Comprá, repará y revendé <em>equipos con control total</em></>}
    description="Registrá los equipos que comprás para reventa, sus gastos y el resultado cuando finalmente los vendés."
    points={['Comprado', 'En reparación', 'Listo para vender', 'Vendido', 'Precio de compra', 'Gastos de reparación', 'Precio de venta', 'Ganancia']}
  >
    <ProductScreenshot shot={productShots.equipmentSalesDesktop} className="showcase__wide" />
  </ShowcaseSection>
}

export function TrackingShowcase() {
  return <ShowcaseSection
    id="seguimiento"
    eyebrow="Seguimiento"
    tone="tinted"
    reverse
    title={<>Tu cliente puede seguir <em>el estado online</em></>}
    description="Cada reparación puede tener un enlace de seguimiento para que el cliente consulte su estado sin entrar al panel administrativo."
    points={['Página pública de seguimiento', 'Estado actual de la reparación', 'Progreso del trabajo', 'Acceso desde celular', 'Menos consultas repetitivas']}
  >
    <ProductScreenshot shot={productShots.trackingDesktop} className="showcase__phone-frame" />
  </ShowcaseSection>
}

export function CashShowcase() {
  return <ShowcaseSection
    id="caja"
    eyebrow="Caja"
    title={<>Sabé cuánto entra, cuánto sale <em>y de dónde viene</em></>}
    description="Controlá ingresos, egresos, balance y movimientos del taller desde un mismo lugar."
    points={['Ingresos y egresos', 'Balance', 'Movimientos por origen', 'Reparaciones', 'Comercio', 'Compra y reventa de equipos']}
  >
    <ProductScreenshot shot={productShots.cashDesktop} />
  </ShowcaseSection>
}
