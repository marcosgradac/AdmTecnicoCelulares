import type { TutorialStep } from '../types/tutorial.types'

export const tutorialSteps: TutorialStep[] = [
  { id: 'welcome', title: 'Bienvenido a TecnoDesk', description: 'En menos de dos minutos te mostramos cómo administrar tus reparaciones, clientes y dinero.', type: 'fullscreen' },
  { id: 'dashboard', route: '/admin', target: '[data-tutorial="dashboard-summary"]', title: 'Tu negocio de un vistazo', description: 'Reparaciones activas, equipos listos, ingresos y datos importantes del día aparecen juntos acá.', type: 'demo', demo: 'dashboard' },
  { id: 'repairs', route: '/admin/reparaciones', target: '[data-tutorial="repairs-list"]', title: 'Acá vive el corazón de TecnoDesk', description: 'Consultá cliente, equipo, falla, estado, importe y fechas de cada ingreso.', type: 'demo', demo: 'repair', permission: 'repairs.view' },
  { id: 'new-repair', route: '/admin/reparaciones', target: '[data-tutorial="new-repair"], [data-tutorial="repairs"]', title: 'Creá una nueva reparación', description: 'En mobile usá el botón flotante; en desktop, la acción Nueva reparación.', type: 'spotlight', permission: 'repairs.create' },
  { id: 'repair-form', route: '/admin/reparaciones?new=1', target: '[data-tutorial="repair-form"]', title: 'Cargá lo esencial, por bloques', description: 'Elegí o creá el cliente, completá el equipo y luego agregá falla, observaciones y presupuesto.', type: 'demo', demo: 'form', permission: 'repairs.create' },
  { id: 'status', route: '/admin/reparaciones', target: '[data-tutorial="repairs-list"]', title: 'Cada etapa queda clara', description: 'Cuando actualizás el estado, TecnoDesk sabe exactamente en qué etapa está el equipo.', type: 'demo', demo: 'status', permission: 'repairs.changeStatus' },
  { id: 'tracking', route: '/admin/reparaciones', target: '[data-tutorial="repairs-list"]', title: 'Tu cliente sigue la reparación en tiempo real', description: 'Compartís un único enlace por WhatsApp y cada cambio que hagas se actualiza automáticamente.', type: 'demo', demo: 'tracking', permission: 'repairs.shareTracking' },
  { id: 'cash', route: '/admin/caja', target: '[data-tutorial="cash-overview"]', title: 'Entendé qué entra y qué sale', description: 'Caja te permite registrar y consultar los movimientos del negocio.', type: 'demo', demo: 'cash', permission: 'cash.view' },
  { id: 'finish', title: 'Ya estás listo', description: 'Ahora ya conocés lo esencial para empezar a trabajar con TecnoDesk.', type: 'fullscreen', demo: 'finish' },
]
