import { api } from './api'
import type { Repair } from '../types'
import type { EquipmentSummary } from './equipmentSales'

export interface ClientOption {
  id: string
  name: string
  phone: string | null
}

export interface ClientListRecord extends ClientOption {
  createdAt: string
  repairCount: number
  lastRepair: { deviceBrand: string; deviceModel: string } | null
}

export interface ClientRecord extends ClientOption {
  createdAt: string
  deletedAt: string | null
  repairs: Array<{ id: string; number: number; total: number; paid: number; createdAt: string; updatedAt: string; deviceBrand: string; deviceModel: string; issue: string; status: string }>
}

export interface CashMovement {
  id: string
  type: 'INCOME' | 'EXPENSE'
  description: string
  amount: number
  method: 'CASH' | 'TRANSFER' | 'CARD' | 'OTHER' | null
  repairId: string | null
  clientName: string | null
  origin: 'GENERAL' | 'REPAIR' | 'EQUIPMENT' | 'COMMERCE'
  resaleDeviceId: string | null
  resaleKind: 'PURCHASE' | 'REPAIR' | 'PURCHASE_ADJUSTMENT' | 'REPAIR_ADJUSTMENT' | 'SALE' | null
  resaleVersion: number | null
  createdAt: string
}

export interface CashMovementsSummary {
  income: number
  expense: number
  /** Ingresos - egresos del período seleccionado. */
  balance: number
  totalMovements: number
}

/** Períodos disponibles en las cajas. El backend calcula los límites a partir del valor. */
export type CashPeriod = 'TODAY' | '7D' | '15D' | '30D' | 'MONTH'
export const CASH_PERIODS: CashPeriod[] = ['TODAY', '7D', '15D', '30D', 'MONTH']
export const cashPeriodLabels: Record<CashPeriod, string> = { TODAY: 'Hoy', '7D': '7 días', '15D': '15 días', '30D': '30 días', MONTH: 'Mes actual' }
/** Sufijo corto para los títulos de las tarjetas: "de hoy" u "· 7 días". */
export const cashPeriodSuffix = (period: CashPeriod) => period === 'TODAY' ? 'de hoy' : `· ${cashPeriodLabels[period]}`

export interface CashMovementsPage {
  items: CashMovement[]
  total: number
  page: number
  pageSize: number
  pages: number
  /** Período con el que se calculó la respuesta. */
  period: CashPeriod
  summary: CashMovementsSummary
  equipmentSummary?: EquipmentSummary
  /** Presente sólo en la vista agrupada: movimientos de reparación sin reparación asociada. */
  loose?: LooseRepairMovements
}

/** Movimiento dentro de un grupo de reparación. */
export interface GroupedCashMovement {
  id: string
  type: 'INCOME' | 'EXPENSE'
  description: string
  amount: number
  method: 'CASH' | 'TRANSFER' | 'CARD' | 'OTHER' | null
  createdAt: string
  repairId: string | null
  clientName: string | null
  origin: 'GENERAL' | 'REPAIR' | 'EQUIPMENT' | 'COMMERCE'
}

/** Una reparación con todos sus movimientos de Caja, listo para mostrarse como una fila. */
export interface RepairCashGroup {
  repairId: string
  repairNumber: number
  clientName: string
  deviceBrand: string
  deviceModel: string
  income: number
  expense: number
  net: number
  movementCount: number
  lastMovementAt: string
  movements: GroupedCashMovement[]
}

export interface LooseRepairMovements {
  income: number
  expense: number
  net: number
  movementCount: number
  lastMovementAt: string
  movements: GroupedCashMovement[]
}

export interface DashboardSummary {
  activeRepairs: number
  repairsToday: number
  monthlyIncome: number
  monthlyExpenses: number
  pending: number
  readyRepairs: number
  activeWarranties: number
  clients: number
  byStatus: Array<{ status: string; value: number }>
  recentRepairs: Array<{ id:string; number:number; deviceBrand:string; deviceModel:string; issue:string; status:string; total:number; createdAt:string; client:{name:string} }>
  cashFlow: Array<{ label: string; income: number; expense: number }>
}

export const getClientsPage = async (params:{page:number;pageSize?:number;search?:string}) => (await api.get<{items:ClientListRecord[];total:number;page:number;pageSize:number;totalPages:number}>('/clients',{params:{...params,paginated:true}})).data
export const getClientOptions = async () => (await api.get<ClientOption[]>('/clients/options')).data
export const getClient = async (id: string) => (await api.get<ClientRecord>(`/clients/${id}`)).data
export const createClient = async (input: { name: string; phone?: string }) => (await api.post<ClientRecord>('/clients', input)).data
export const updateClient = async (id: string, input: { name: string; phone?: string | null }) => (await api.patch<ClientRecord>(`/clients/${id}`, input)).data
export const deleteClient = async (id: string) => { await api.delete(`/clients/${id}`) }
export const getCashMovements = async (params: { page: number; pageSize: number; origin?: CashMovement['origin']; period: CashPeriod }): Promise<CashMovementsPage> => (await api.get<CashMovementsPage>('/cash/movements', { params })).data
/**
 * Caja de reparaciones agrupada por reparación. La paginación es por grupos, no por
 * movimientos: cada reparación llega completa, con sus totales y todos sus movimientos
 * del período seleccionado.
 */
export const getRepairCashGroups = async (params: { page: number; pageSize: number; period: CashPeriod }): Promise<CashMovementsPage> =>
  (await api.get<CashMovementsPage>('/cash/movements', { params: { ...params, origin: 'REPAIR', groupByRepair: true } })).data
export const createCashMovement = async (input: { origin?: CashMovement['origin']; type: 'INCOME' | 'EXPENSE'; description: string; amount: number; method?: CashMovement['method'] }) => (await api.post<CashMovement>('/cash/movements', input)).data
export const registerPayment = async (repairId: string, input: { amount: number; method: 'CASH' | 'TRANSFER' | 'CARD' | 'OTHER'; note?: string }) => { await api.post(`/repairs/${repairId}/payments`, input) }

export type { Repair }
