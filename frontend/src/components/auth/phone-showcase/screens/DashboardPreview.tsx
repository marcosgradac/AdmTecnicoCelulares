import { dashboardRepairs } from '../phoneShowcase.data'

export function DashboardPreview() {
  return <div className="showcase-screen">
    <header><span>Buen día, Marcos</span><b>Panel general</b></header>
    <div className="showcase-metrics">
      <span><small>Activas</small><b>12</b></span><span><small>Listas</small><b>4</b></span><span><small>Ingresos</small><b>$485k</b></span>
    </div>
    <button type="button" tabIndex={-1}>＋ Nueva reparación</button>
    <label>Reparaciones recientes</label>
    <div className="showcase-list">{dashboardRepairs.map(item => <div key={item.number}><i>{item.number}</i><span><b>{item.device}</b><small>{item.state}</small></span></div>)}</div>
  </div>
}
