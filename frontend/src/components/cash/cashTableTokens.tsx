import type { ReactNode } from 'react'
import { Box, Table, TableCell, TableContainer, TableRow, Typography, useMediaQuery, useTheme } from '@mui/material'
import { TABLE_BORDER } from '../../theme/tokens'

/**
 * Tokens visuales compartidos por las dos tablas de cada Caja: la principal ("Últimos
 * movimientos") y la secundaria ("Otros movimientos").
 *
 * Ambas se arman con THESE mismos valores —encabezado, bordes, alto de fila y ancho mínimo—, así
 * que las cuatro cajas muestran siempre dos tablas hermanas en lugar de dos diseños parecidos.
 * Si cambia un detalle visual, cambia en las dos a la vez.
 */
export const CASH_HEAD_CELL_SX = {
  fontSize: 10.5, fontWeight: 800, letterSpacing: '.07em',
  textTransform: 'uppercase' as const, color: 'text.secondary',
  lineHeight: 1.4, py: 1, background: 'transparent', whiteSpace: 'nowrap' as const,
}

/** Bordes, encabezado y alto de fila comunes a las dos tablas. */
export const cashTableSx = (minWidth: number) => ({
  minWidth,
  '& .MuiTableCell-root': { borderBottom: `1px solid ${TABLE_BORDER}` },
  '& .MuiTableCell-head': CASH_HEAD_CELL_SX,
  // Mismo alto de fila en las dos tablas: sin esto las columnas quedan desalineadas.
  '& .MuiTableBodyCell-root': { py: 1.25 },
  '& .MuiTableBodyRow-root:last-of-type .MuiTableBodyCell-root': { borderBottom: 0 },
})

/** Marco de tabla: mismo contenedor y mismo desplazamiento horizontal en las dos. */
export const CashTableFrame = ({ children, minWidth, label }: { children: ReactNode; minWidth: number; label: string }) =>
  <TableContainer>
    <Table aria-label={label} sx={cashTableSx(minWidth)}>{children}</Table>
  </TableContainer>

/** Anchos de columna de la tabla por movimiento. Los comparten ambas tablas. */
export const MOVEMENT_COLUMN_WIDTHS = {
  origin: 170, method: 165, date: 120, time: 78, kind: 120, amount: 150,
} as const

/** Estado vacío de "Otros movimientos". Idéntico en las cuatro cajas. */
export const CASH_LOOSE_EMPTY_TITLE = 'No hay movimientos manuales para mostrar.'
export const CASH_LOOSE_EMPTY_HINT = 'Los ingresos y egresos cargados manualmente aparecerán acá.'

/** Columnas de la tabla secundaria; el empty state ocupa exactamente ese ancho. */
export const LOOSE_COLUMN_COUNT = 6
/** Columnas de la tabla principal de movimientos, sin la columna de origen. */
export const MOVEMENT_COLUMN_COUNT = 6

/**
 * Etiquetas humanas de los orígenes de Caja.
 *
 * Es el único lugar donde se traduce el enum a texto: las tablas de las cuatro cajas muestran
 * "Reparaciones" o "Reventa de equipos", nunca `REPAIR` ni `EQUIPMENT`. Los valores internos que
 * viajan por la API no cambian; esto es sólo cómo se leen en pantalla.
 */
export const CASH_ORIGIN_LABELS: Record<string, string> = {
  GENERAL: 'General', REPAIR: 'Reparaciones', EQUIPMENT: 'Reventa de equipos', COMMERCE: 'Comercio',
}

/** Nombre de la caja para un origen, o "Caja General" cuando no hay origen definido. */
export const cashOriginName = (origin?: string) => origin ? CASH_ORIGIN_LABELS[origin] ?? origin : 'Caja General'

/**
 * Panel de una tabla de Caja: el bloque visualmente independiente que envuelve título y tabla.
 *
 * Cada tabla de cada caja es un panel propio —con su borde, su radio y su superficie— para que
 * "Últimos movimientos" y "Otros movimientos" se lean como dos tablas hermanas y no como dos
 * morceaux de una sola. No es una Card: es una superficie plana, sin sombra ni padding propio.
 *
 * `hint` es una línea auxiliar discreta bajo el subtítulo. Sólo la usan las cajas que necesitan
 * explicar cómo está organizada su tabla —hoy, Reparaciones—, nunca las otras tres.
 */
export const CashTablePanel = ({ title, description, hint, children, footer }: { title: string; description?: string; hint?: string; children: ReactNode; footer?: ReactNode }) =>
  <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, bgcolor: 'background.paper', overflow: 'hidden' }}>
    <Box sx={{ px: 2.5, pt: 2, pb: description || hint ? 1 : 1.5 }}>
      <Typography variant="h2" color="primary.main">{title}</Typography>
      {description && <Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{description}</Typography>}
      {hint && <Typography variant="caption" color="text.secondary" sx={{ mt: .25, display: 'block' }}>{hint}</Typography>}
    </Box>
    {children}
    {footer && <Box sx={{ px: 2.5, py: 1.5 }}>{footer}</Box>}
  </Box>

/**
 * Fila de estado vacío DENTRO de la tabla.
 *
 * Ocupa el ancho completo con `colSpan`, así la tabla conserva encabezado, bordes y ancho de
 * columnas aunque no tenga datos. Nunca se reemplaza la tabla por un bloque suelto: el usuario
 * siempre ve la misma estructura y sólo cambia el contenido del cuerpo.
 */
export const CashEmptyRow = ({ colSpan, title, description }: { colSpan: number; title: string; description?: string }) =>
  <TableRow>
    <TableCell colSpan={colSpan} sx={{ borderBottom: 'none', py: 4, px: 2, textAlign: 'center' }}>
      <Typography variant="subtitle2" fontWeight={750}>{title}</Typography>
      {description && <Typography variant="body2" color="text.secondary" sx={{ mt: .5, maxWidth: 480, mx: 'auto' }}>{description}</Typography>}
    </TableCell>
  </TableRow>

/** Título de sección dentro de una caja: mismo color y jerarquía en las cuatro. */
export const CashSectionTitle = ({ children }: { children: ReactNode }) =>
  <Typography variant="h2" color="primary.main">{children}</Typography>

/** ¿Estamos en mobile? Lo comparten las dos tablas para caer en tarjetas a la vez. */
export const useCashMobile = () => useMediaQuery(useTheme().breakpoints.down('md'))
