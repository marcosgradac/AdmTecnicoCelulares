export const formatARS = (value: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value)
export const formatDate = (value?: string | null) => value ? new Intl.DateTimeFormat('es-AR').format(new Date(value)) : '—'
