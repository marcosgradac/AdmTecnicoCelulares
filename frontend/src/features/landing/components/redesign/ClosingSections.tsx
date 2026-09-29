import { Link } from 'react-router-dom'
import { Box } from '@mui/material'
import { ProductScreenshot, productShots } from './ProductScreenshot'

/** Bloque compacto de 2 columnas: historial de clientes y equipo. */
export function CustomerTeamShowcase() {
  const cards = [
    { title: 'Todo el historial de cada cliente', text: 'Reparaciones, pagos y dispositivos relacionados en un solo lugar.', shot: productShots.clientDetailDesktop },
    { title: 'Trabajá con tu equipo', text: 'Creá técnicos y controlá qué módulos puede utilizar cada uno.', shot: productShots.teamDesktop },
  ]
  return <section id="clientes-equipo" className="duo-section" aria-label="Clientes y equipo">
    <div className="landing-container">
      <div className="duo-grid">
        {cards.map(card => <article key={card.title} className="duo-card" data-reveal>
          <div className="duo-card__visual"><ProductScreenshot shot={card.shot} /></div>
          <div className="duo-card__copy"><h3>{card.title}</h3><p>{card.text}</p></div>
        </article>)}
      </div>
    </div>
  </section>
}

function PhoneShot({ shot, offset = false }: { shot: { src: string; alt: string; width: number; height: number }; offset?: boolean }) {
  return <figure className={`mobile-shot ${offset ? 'is-offset' : ''}`}>
    <span className="mobile-shot__notch" aria-hidden="true" />
    <Box component="img" src={shot.src} alt={shot.alt} width={shot.width} height={shot.height} loading="lazy" decoding="async" />
  </figure>
}

/** Sección responsive: capturas reales de mobile dentro de marcos CSS. */
export function MobileShowcase() {
  return <section className="mobile-section" aria-labelledby="movil-title">
    <div className="landing-container mobile-section__grid" data-reveal>
      <div className="mobile-section__copy">
        <span className="showcase__eyebrow">Desde el celular</span>
        <h2 id="movil-title">TecnoDesk también funciona <em>desde tu celular</em></h2>
        <p>El panel y el seguimiento del cliente están pensados para funcionar también desde el teléfono.</p>
      </div>
      <div className="mobile-section__phones">
        <PhoneShot shot={productShots.dashboardMobile} />
        <PhoneShot shot={productShots.trackingMobile} offset />
      </div>
    </div>
  </section>
}

/** Cierre con degradado suave azul/violeta. */
export function FinalCta() {
  return <section className="final-cta" aria-labelledby="cta-title">
    <div className="landing-container">
      <div className="final-cta__inner" data-reveal>
        <div className="final-cta__copy">
          <h2 id="cta-title" className="final-cta__title">Empezá a ordenar tu servicio técnico hoy</h2>
          <p className="final-cta__text">Probá TecnoDesk completo durante 30 días y conocé todas sus funciones.</p>
        </div>
        <div className="final-cta__action">
          <Link className="final-cta__button" to="/register">Empezar gratis</Link>
          <ul className="final-cta__points"><li>30 días gratis</li><li>Sin tarjeta</li><li>Acceso completo durante la prueba</li></ul>
        </div>
      </div>
    </div>
  </section>
}
