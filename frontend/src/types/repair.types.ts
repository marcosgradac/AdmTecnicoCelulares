export type WorkflowRepairStatus =
  | 'recibido'
  | 'en_revision'
  | 'presupuesto_informado'
  | 'presupuesto_aceptado'
  | 'esperando_repuesto'
  | 'en_reparacion'
  | 'control_calidad'
  | 'listo_retirar'
  | 'entregado'
  | 'cancelado'
  | 'garantia'

export interface NewRepairDraft {
  client: { fullName: string; phone: string; whatsapp: string }
  device: { brand: string; model: string; imei?: string; color: string; protectedAccessCode?: string }
  intake: { issue: string; physicalCondition: string; accessories: string; observations: string; photos: File[] }
  budget: { service: string; part: string; cost: number; finalPrice: number; estimatedTime: string }
  trackingToken?: string
}
