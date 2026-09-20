import { isAxiosError } from 'axios'
import type { ChipProps } from '@mui/material'
import type { EquipmentPaymentMethod, EquipmentStatus } from '../../services/equipmentSales'

export const statusLabels: Record<EquipmentStatus, string> = {
  PURCHASED: 'Comprado', REPAIRING: 'En reparación', READY_FOR_SALE: 'Listo para vender', SOLD: 'Vendido',
}
export const statusColors: Record<EquipmentStatus, ChipProps['color']> = {
  PURCHASED: 'default', REPAIRING: 'warning', READY_FOR_SALE: 'info', SOLD: 'success',
}
export const paymentLabels: Record<EquipmentPaymentMethod, string> = { CASH: 'Efectivo', TRANSFER: 'Transferencia', CARD: 'Tarjeta', OTHER: 'Otro' }
export const equipmentError = (error: unknown, fallback: string) => isAxiosError<{ message?: string }>(error) ? error.response?.data?.message ?? fallback : fallback
export const isEquipmentConflict = (error: unknown) => isAxiosError(error) && error.response?.status === 409
export const validAmount = (value: string, min = 0) => value.trim() !== '' && Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= 2147483647
export const localDateTime = (date = new Date()) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 23)
}
