export function RepairPreview() {
  return <div className="showcase-screen">
    <header><span>Reparación #1048</span><b>Galaxy A54</b><small>Juan Pérez · Pantalla rota</small></header>
    <div className="showcase-status"><i>✓</i><span><small>Estado actual</small><b>En reparación</b></span></div>
    <div className="showcase-money"><span><small>Presupuesto</small><b>$180.000</b></span><span><small>Pagado</small><b>$80.000</b></span><span><small>Saldo</small><b>$100.000</b></span></div>
    <label>Progreso del trabajo</label><div className="showcase-progress"><i /></div>
    <div className="showcase-timeline">{['Recibido', 'Revisión', 'Aceptado', 'Reparación', 'Calidad', 'Listo'].map((state, index) => <span className={index < 4 ? 'done' : ''} key={state}><i />{state}</span>)}</div>
  </div>
}
