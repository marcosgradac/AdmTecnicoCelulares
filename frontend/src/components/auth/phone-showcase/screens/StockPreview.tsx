import { stockItems } from '../phoneShowcase.data'

export function StockPreview() {
  return <div className="showcase-screen">
    <header><span>Inventario</span><b>Stock del taller</b><small>Actualizado hace un momento</small></header>
    <div className="showcase-stock">{stockItems.map(item => <div key={item.name}><span><i className={item.low ? 'low' : ''} /><b>{item.name}</b></span><strong>{item.quantity}</strong>{item.low && <small>Stock bajo</small>}</div>)}</div>
    <div className="showcase-message">Último movimiento: conector USB-C descontado en reparación #1048.</div>
  </div>
}
