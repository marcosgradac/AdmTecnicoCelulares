import { getArgentinaDayBounds, getArgentinaDayRangeBack, getArgentinaMonthBounds } from '../../lib/argentina-day'

/**
 * Períodos disponibles en todas las cajas.
 *
 * El frontend elige uno de estos valores y el backend calcula los límites: nunca se acepta
 * un rango arbitrario enviado por el navegador, así todas las cajas comparten exactamente el
 * mismo criterio temporal.
 */
export const CASH_PERIODS = ['TODAY', '7D', '15D', '30D', 'MONTH'] as const
export type CashPeriod = (typeof CASH_PERIODS)[number]
export const DEFAULT_CASH_PERIOD: CashPeriod = 'TODAY'

export const isCashPeriod = (value: unknown): value is CashPeriod =>
  typeof value === 'string' && (CASH_PERIODS as readonly string[]).includes(value)

/** Días calendario hacia atrás que abarca cada período, inclusivo de hoy. */
const daysBack: Record<CashPeriod, number> = { TODAY: 0, '7D': 6, '15D': 14, '30D': 29, MONTH: 0 }

export const cashPeriodRange = (period: CashPeriod, now = new Date()) =>
  period === 'MONTH' ? getArgentinaMonthBounds(now) : getArgentinaDayRangeBack(now, daysBack[period])

/** Etiquetas cortas del selector. */
export const cashPeriodLabels: Record<CashPeriod, string> = {
  TODAY: 'Hoy', '7D': '7 días', '15D': '15 días', '30D': '30 días', MONTH: 'Mes actual',
}

/**
 * Sufijo para los títulos de las tarjetas: "Ingresos de hoy" con el período Hoy y
 * "Ingresos · 7 días" con los demás, sin textos largos.
 */
export const cashPeriodCardSuffix = (period: CashPeriod) =>
  period === 'TODAY' ? 'de hoy' : `· ${cashPeriodLabels[period]}`

/** Rango en formato Prisma para filtrar `createdAt`. */
export const cashPeriodWhere = (period: CashPeriod, now = new Date()) => {
  const { start, end } = cashPeriodRange(period, now)
  return { gte: start, lt: end }
}
