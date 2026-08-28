const ARGENTINA_TIME_ZONE = 'America/Argentina/Buenos_Aires'

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
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

const partsFor = (date: Date): ZonedParts => {
  const values = Object.fromEntries(formatter.formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]))
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  }
}

const offsetAt = (date: Date) => {
  const parts = partsFor(date)
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - date.getTime()
}

const utcForMidnight = (year: number, month: number, day: number) => {
  let guess = Date.UTC(year, month - 1, day)
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const corrected = Date.UTC(year, month - 1, day) - offsetAt(new Date(guess))
    if (corrected === guess) break
    guess = corrected
  }
  return new Date(guess)
}

export const getArgentinaDayBounds = (now: Date) => {
  if (Number.isNaN(now.getTime())) throw new RangeError('Invalid date')
  const { year, month, day } = partsFor(now)
  return {
    start: utcForMidnight(year, month, day),
    end: utcForMidnight(year, month, day + 1),
  }
}
