export const ARGENTINA_TIME_ZONE = 'America/Argentina/Buenos_Aires'

type ZonedParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: ARGENTINA_TIME_ZONE,
  calendar: 'gregory',
  numberingSystem: 'latn',
  year: 'numeric',
  era: 'short',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

const partsFor = (date: Date): ZonedParts => {
  const formatted = formatter.formatToParts(date)
  const values = Object.fromEntries(formatted.filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]))
  return {
    year: formatted.some(part => part.type === 'era' && part.value === 'BC') ? 1 - values.year : values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  }
}

/** Fecha civil vista en Argentina, independiente de la zona horaria del servidor. */
export const getArgentinaCalendarDate = (date: Date) => {
  if (Number.isNaN(date.getTime())) throw new RangeError('Invalid date')
  const { year, month, day } = partsFor(date)
  return { year, month, day }
}

// UTC se usa aquí sólo como representación aritmética del calendario gregoriano.
// setUTCFullYear evita que Date.UTC interprete los años 0..99 como 1900..1999.
const civilTimestamp = (year: number, month: number, day: number) => {
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  return date.getTime()
}

/** Ordinal de la fecha civil: permite contar días sin depender de su duración UTC. */
export const getArgentinaCalendarDayNumber = (date: Date) => {
  const { year, month, day } = getArgentinaCalendarDate(date)
  return civilTimestamp(year, month, day) / 86_400_000
}

const offsetAt = (date: Date) => {
  const parts = partsFor(date)
  return civilTimestamp(parts.year, parts.month, parts.day)
    + (parts.hour * 3600 + parts.minute * 60 + parts.second) * 1000 - date.getTime()
}

const utcForMidnight = (year: number, month: number, day: number) => {
  const civil = civilTimestamp(year, month, day)
  let guess = civil
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const corrected = civil - offsetAt(new Date(guess))
    if (corrected === guess) break
    guess = corrected
  }
  return new Date(guess)
}

/** Medianoches UTC de un día civil argentino; acepta desplazamientos de mes/día. */
export const getArgentinaCalendarDayBounds = (year: number, month: number, day: number) => ({
  start: utcForMidnight(year, month, day),
  end: utcForMidnight(year, month, day + 1),
})

export const getArgentinaDayBounds = (now: Date) => {
  if (Number.isNaN(now.getTime())) throw new RangeError('Invalid date')
  const { year, month, day } = partsFor(now)
  return {
    start: utcForMidnight(year, month, day),
    end: utcForMidnight(year, month, day + 1),
  }
}

/**
 * Límites de un rango de días calendario hacia atrás: desde la medianoche de hace
 * `daysBack` días hasta el cierre lógico del día de hoy.
 *
 * Se calcula sobre la fecha civil argentina y no restando horas, para que un rango de
 * "7 días" siempre sea 7 amaneceres completos aunque cambie el horario de verano.
 */
export const getArgentinaDayRangeBack = (now: Date, daysBack: number) => {
  if (Number.isNaN(now.getTime())) throw new RangeError('Invalid date')
  const { year, month, day } = partsFor(now)
  const shifted = new Date(civilTimestamp(year, month, day - daysBack))
  return {
    start: utcForMidnight(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate()),
    end: utcForMidnight(year, month, day + 1),
  }
}

/** Desde la medianoche del día 1 del mes en curso hasta el cierre lógico del día de hoy. */
export const getArgentinaMonthBounds = (now: Date) => {
  if (Number.isNaN(now.getTime())) throw new RangeError('Invalid date')
  const { year, month } = partsFor(now)
  return { start: utcForMidnight(year, month, 1), end: getArgentinaDayBounds(now).end }
}
