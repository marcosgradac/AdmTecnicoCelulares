import { SectionCopy } from './SectionCopy'
import { PaymentsMockup } from './mockups/PaymentsMockup'
export function PaymentsSection(){return <section className="story-section payments-story"><div className="landing-container story-grid"><SectionCopy eyebrow="PAGOS" title="Sabé cuánto cobraste y cuánto queda pendiente" description="Registrá los pagos de cada reparación y consultá rápidamente el total, lo abonado y el saldo que todavía falta cobrar."/><PaymentsMockup/></div></section>}
