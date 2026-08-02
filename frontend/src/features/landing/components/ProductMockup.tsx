import { CheckCircleRounded, PaymentsRounded } from '@mui/icons-material'
export function ProductMockup({compact=false}:{compact?:boolean}) {
 return <div className={`product-mockup ${compact?'is-compact':''}`} role="img" aria-label="Vista demostrativa de una reparación en CelluFix">
  <div className="mock-window"><div className="mock-sidebar"><b>CF</b><i/><i/><i/><i/></div><div className="mock-content"><small>REPARACIÓN #1048</small><h3>iPhone 13</h3><p>Juan Pérez · Cambio de módulo</p><span className="mock-status">● En reparación</span><div className="mock-money"><span><small>Total</small><b>$180.000</b></span><span><small>Saldo</small><b>$100.000</b></span></div><label>Progreso del trabajo <b>68%</b></label><div className="mock-progress"><i/></div><div className="mock-repairs"><span><b>12</b><small>Activas</small></span><span><b>3</b><small>Listas</small></span></div></div></div>
  {!compact&&<><div className="mock-float one"><CheckCircleRounded/><span><small>Presupuesto</small><b>Aceptado</b></span></div><div className="mock-float two"><PaymentsRounded/><span><small>Pago</small><b>Registrado</b></span></div></>}
 </div>
}
