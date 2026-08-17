import { BuildRounded, DevicesRounded, HistoryRounded, LinkRounded, PaymentsRounded, SpaceDashboardRounded } from '@mui/icons-material'

export const features = [
  { icon: BuildRounded, title: 'Reparaciones organizadas', text: 'Registrá cada equipo, la falla informada, el diagnóstico, el presupuesto y el estado actual.' },
  { icon: DevicesRounded, title: 'Clientes y reparaciones', text: 'Consultá los datos y el historial completo de reparaciones de cada cliente.' },
  { icon: HistoryRounded, title: 'Estados e historial', text: 'Guardá cada cambio desde que recibís el equipo hasta que lo entregás.' },
  { icon: PaymentsRounded, title: 'Presupuestos y pagos', text: 'Registrá el valor, señas, pagos realizados y saldo pendiente.' },
  { icon: LinkRounded, title: 'Seguimiento mediante enlace', text: 'Compartí un enlace para que el cliente consulte cómo avanza su reparación.' },
  { icon: SpaceDashboardRounded, title: 'Panel del negocio', text: 'Visualizá reparaciones activas, equipos en revisión, listos e ingresos recientes.' },
]
export const workflow = [
  ['01','Registrás el equipo','Cargás al cliente, su celular, la falla y el estado de ingreso.'],
  ['02','Revisás y presupuestás','Agregás el diagnóstico, el trabajo a realizar y el precio.'],
  ['03','Iniciás la reparación','Cuando el cliente acepta, cambiás el estado y generás el seguimiento.'],
  ['04','Actualizás y entregás','El cliente ve el progreso hasta que el equipo está listo para retirar.'],
]
export const faqs = [
  ['¿Necesito tener un local?','No. TecnoDesk también está pensado para técnicos que trabajan desde su casa o de manera independiente.'],
  ['¿El cliente necesita crear una cuenta?','No. Recibe un enlace y consulta el seguimiento sin iniciar sesión.'],
  ['¿Puedo usarlo desde mi celular?','Sí. La interfaz está diseñada para funcionar correctamente desde dispositivos móviles.'],
  ['¿Puedo registrar pagos parciales?','Sí. Podés registrar señas, distintos pagos y consultar el saldo pendiente.'],
  ['¿El cliente puede ver mis costos internos?','No. El seguimiento público solamente muestra la información habilitada para el cliente.'],
  ['¿Puedo desactivar un enlace?','Sí. El técnico puede desactivar o regenerar el enlace de seguimiento.'],
]
