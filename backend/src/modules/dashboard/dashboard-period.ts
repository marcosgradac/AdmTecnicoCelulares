import { ARGENTINA_TIME_ZONE, getArgentinaCalendarDate, getArgentinaCalendarDayBounds, getArgentinaDayBounds, getArgentinaDayRangeBack, getArgentinaMonthBounds } from '../../lib/argentina-day'

export type DashboardPeriod = 'today' | '7d' | '30d' | 'month'

export function dashboardPeriod(period: DashboardPeriod, now = new Date()) {
  const today = getArgentinaDayBounds(now).start
  const argentinaDay = getArgentinaCalendarDate(now).day
  const days = period === '7d' ? 7 : period === '30d' ? 30 : period === 'month' ? argentinaDay : 1
  const start = period === 'month' ? getArgentinaMonthBounds(now).start : period === 'today' ? today : getArgentinaDayRangeBack(now, days - 1).start
  const end = new Date(now.getTime() + 1)
  const civilStart = getArgentinaCalendarDate(start)
  const buckets = Array.from({ length: period === 'today' ? Math.ceil((end.getTime() - start.getTime()) / 3600000) : days }, (_, index) => {
    const bounds = period === 'today'
      ? { start: new Date(start.getTime() + index * 3600000), end: new Date(start.getTime() + (index + 1) * 3600000) }
      : getArgentinaCalendarDayBounds(civilStart.year, civilStart.month, civilStart.day + index)
    const date = getArgentinaCalendarDate(bounds.start)
    const label = period === 'today' ? `${String(index).padStart(2, '0')}:00` : `${String(date.day).padStart(2, '0')}/${String(date.month).padStart(2, '0')}`
    return { start: bounds.start, end: new Date(Math.min(bounds.end.getTime(), end.getTime())), label }
  })
  return { key: period, start, end, timeZone: ARGENTINA_TIME_ZONE, buckets }
}
