const repairs = [
  ['#1048', 'Juan Pérez', 'iPhone 13', 'En reparación'],
  ['#1047', 'Lucía Gómez', 'Samsung A54', 'En revisión'],
  ['#1046', 'Martín Díaz', 'Moto G84', 'Listo'],
]

export function ResponsiveDevicesMockup() {
  return (
    <div className="responsive-device-stage" data-reveal aria-label="TecnoDesk en computadora, tablet y celular">
      <div className="responsive-laptop">
        <div className="responsive-laptop__camera" />
        <div className="responsive-laptop__screen">
          <aside><b>TD</b><i /><i /><i /><i /></aside>
          <main>
            <header><span><small>RESUMEN DEL TALLER</small><strong>Tu actividad de hoy</strong></span><em>22 AGO</em></header>
            <div className="responsive-dashboard-stats">
              <article><i /><span><b>12</b><small>Reparaciones activas</small></span></article>
              <article><i /><span><b>3</b><small>Listas para retirar</small></span></article>
              <article><i /><span><b>4</b><small>En revisión</small></span></article>
            </div>
            <div className="responsive-dashboard-list">
              <strong>Actividad reciente</strong>
              {repairs.slice(0, 2).map(([id, client, device, status]) => (
                <article key={id}><span><b>{device}</b><small>{client}</small></span><em>{status}</em></article>
              ))}
            </div>
          </main>
        </div>
        <div className="responsive-laptop__hinge" />
        <div className="responsive-laptop__base"><i /></div>
      </div>

      <div className="responsive-tablet">
        <div className="responsive-tablet__camera" />
        <div className="responsive-tablet__screen">
          <header><span><small>REPARACIONES</small><strong>Todos los trabajos</strong></span><b>+</b></header>
          <div className="responsive-tablet__filter">Buscar cliente o equipo</div>
          <div className="responsive-tablet__rows">
            {repairs.map(([id, client, device, status]) => (
              <article key={id}><b>{id}</b><span><strong>{client}</strong><small>{device}</small></span><em className={`responsive-status responsive-status--${status.replace(' ', '-').toLowerCase()}`}>{status}</em></article>
            ))}
          </div>
        </div>
      </div>

      <div className="responsive-phone">
        <div className="responsive-phone__island" />
        <div className="responsive-phone__screen">
          <header><small>TU REPARACIÓN</small><strong>iPhone 13</strong><span>Reparación #1048</span></header>
          <div className="responsive-phone__status"><small>ESTADO ACTUAL</small><strong>EN REPARACIÓN</strong><p>Estamos trabajando en tu equipo.</p></div>
          <div className="responsive-phone__steps">
            <span className="done"><i>✓</i><small>Recibido</small></span>
            <span className="done"><i>✓</i><small>Revisado</small></span>
            <span className="current"><i>3</i><small>En reparación</small></span>
          </div>
          <footer><small>Última actualización</small><b>Hoy 18:32</b></footer>
        </div>
      </div>
    </div>
  )
}
