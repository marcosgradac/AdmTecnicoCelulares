import { getArgentinaDayBounds } from '../../lib/argentina-day'

export type DashboardPeriod = 'today' | '7d' | '30d' | 'month'
const DAY = 86400000
const dateLabel = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit' })

export function dashboardPeriod(period: DashboardPeriod, now = new Date()) {
  const today = getArgentinaDayBounds(now).start
  const argentinaDay = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Argentina/Buenos_Aires', day: 'numeric' }).format(now))
  const days = period === '7d' ? 7 : period === '30d' ? 30 : period === 'month' ? argentinaDay : 1
  const start = new Date(today.getTime() - (days - 1) * DAY)
  const end = new Date(now.getTime() + 1)
  const step = period === 'today' ? 3600000 : DAY
  const buckets = Array.from({ length: Math.ceil((end.getTime() - start.getTime()) / step) }, (_, index) => {
    const from = new Date(start.getTime() + index * step)
    return { start: from, end: new Date(Math.min(from.getTime() + step, end.getTime())), label: period === 'today' ? `${String(index).padStart(2, '0')}:00` : dateLabel.format(from) }
  })
  return { key: period, start, end, timeZone: 'America/Argentina/Buenos_Aires', buckets }
}
