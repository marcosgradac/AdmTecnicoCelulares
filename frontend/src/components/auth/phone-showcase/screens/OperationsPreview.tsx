import type { PhoneScreenKind } from '../phoneShowcase.types'

const content = {
  ready: { eyebrow: 'Control de calidad', title: 'Equipo listo', description: 'Galaxy A54 · Juan Pérez', status: 'Listo para retirar', rows: [['Diagnóstico', 'Completado'], ['Reparación', 'Completada'], ['Cliente', 'Notificado']] },
  clients: { eyebrow: 'Clientes', title: 'Agenda del taller', description: 'Información siempre organizada', status: '248 clientes', rows: [['Juan Pérez', 'Galaxy A54'], ['María Gómez', 'iPhone 13'], ['Lucas Costa', 'Moto G84']] },
  payments: { eyebrow: 'Caja y pagos', title: 'Resumen de hoy', description: 'Movimientos actualizados', status: '$ 285.400', rows: [['Pago recibido', '+ $80.000'], ['Seña registrada', '+ $30.000'], ['Saldo pendiente', '$100.000']] },
  budget: { eyebrow: 'Presupuesto #1048', title: 'Aprobado', description: 'El cliente confirmó el trabajo', status: '$ 180.000', rows: [['Repuesto', '$120.000'], ['Mano de obra', '$60.000'], ['Estado', 'Listo para iniciar']] },
} satisfies Record<Extract<PhoneScreenKind, 'ready' | 'clients' | 'payments' | 'budget'>, unknown>

export function OperationsPreview({ kind }: { kind: Extract<PhoneScreenKind, 'ready' | 'clients' | 'payments' | 'budget'> }) {
  const view = content[kind] as { eyebrow: string; title: string; description: string; status: string; rows: string[][] }
  return <div className="showcase-screen"><header><span>{view.eyebrow}</span><b>{view.title}</b><small>{view.description}</small></header>
    <div className="showcase-status"><i>✓</i><span><small>Actualizado ahora</small><b>{view.status}</b></span></div>
    <label>Actividad reciente</label><div className="showcase-list">{view.rows.map(([label, value]) => <div key={label}><i>•</i><span><b>{label}</b><small>{value}</small></span></div>)}</div>
  </div>
}
