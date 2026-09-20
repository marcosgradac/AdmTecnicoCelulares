import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { createTheme, ThemeProvider, useTheme, type Theme } from '@mui/material/styles'

const VisualContext = createContext<Theme | null>(null)
export const useAdminVisual = () => Boolean(useContext(VisualContext))

/** Keep excluded screens and category editors on the original theme. */
export function PreserveAdminVisual({ children }: { children: ReactNode }) {
  const original = useContext(VisualContext)
  const current = useTheme()
  return <VisualContext.Provider value={null}><ThemeProvider theme={original ?? current}>{children}</ThemeProvider></VisualContext.Provider>
}

export function AdminVisualScope({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const original = useTheme()
  const theme = useMemo(() => createTheme(original, {
    components: {
      MuiCard: { styleOverrides: { root: { borderRadius: 18, borderColor: '#E8EAF3', boxShadow: '0 3px 16px rgba(32,25,74,.035)', minWidth: 0 } } },
      MuiCardContent: { styleOverrides: { root: { padding: 24, '&:last-child': { paddingBottom: 24 }, [original.breakpoints.down('sm')]: { padding: 16, '&:last-child': { paddingBottom: 16 } } } } },
      MuiTableCell: { styleOverrides: { root: { padding: '16px 12px', borderColor: '#EEF0F6', fontSize: '.875rem' }, head: { background: '#F7F8FC', color: '#6C7287', fontSize: '.75rem', fontWeight: 700, whiteSpace: 'nowrap' } } },
      MuiTableRow: { styleOverrides: { root: { '&.MuiTableRow-hover:hover': { background: '#FAF9FF' }, '&:last-child td': { borderBottom: 0 } } } },
      MuiTablePagination: { defaultProps: { labelDisplayedRows: ({ from, to, count }: { from: number; to: number; count: number }) => `${from}–${to} de ${count}`, getItemAriaLabel: (type: string) => ({ first: 'Primera página', last: 'Última página', next: 'Página siguiente', previous: 'Página anterior' }[type] ?? type) }, styleOverrides: { root: { borderTop: '1px solid #EEF0F6', marginTop: 16, overflow: 'visible' }, toolbar: { paddingLeft: 0, flexWrap: 'wrap', gap: 4 }, spacer: { flex: '1 1 auto' }, actions: { marginLeft: 8 }, displayedRows: { fontSize: '.8rem' } } },
      MuiChip: { styleOverrides: { root: { fontWeight: 650, borderRadius: 8, maxWidth: '100%' }, label: { paddingLeft: 10, paddingRight: 10 } } },
      MuiIconButton: { styleOverrides: { root: { minWidth: 44, minHeight: 44 } } },
      MuiButton: { styleOverrides: { root: { boxShadow: 'none', minHeight: 44 }, contained: { '&:hover': { boxShadow: '0 4px 12px rgba(91,63,214,.18)' } } } },
      MuiOutlinedInput: { styleOverrides: { root: { background: '#FFFFFF', fontSize: '.9rem' }, notchedOutline: { borderColor: '#E0E3EF' } } },
      MuiDialog: { styleOverrides: { paper: { borderRadius: 20 } } },
      MuiDialogTitle: { styleOverrides: { root: { padding: '24px 24px 16px', fontWeight: 750 } } },
      MuiDialogActions: { styleOverrides: { root: { padding: '16px 24px', borderTop: '1px solid #EEF0F6', gap: 8 } } },
      MuiToggleButtonGroup: { styleOverrides: { root: { padding: 4, gap: 4, background: '#EEEFF7', borderRadius: 12 }, grouped: { border: 0, borderRadius: '8px !important', margin: '0 !important', minHeight: 44, '&.Mui-selected': { background: 'white', color: '#5B3FD6', boxShadow: '0 2px 6px rgba(32,25,74,.08)' } } } },
      MuiAlert: { styleOverrides: { root: { borderRadius: 12, alignItems: 'center', flexWrap: 'wrap' }, message: { minWidth: 0, overflowWrap: 'anywhere' } } },
    },
  }), [original])
  if (!enabled) return <>{children}</>
  return <VisualContext.Provider value={original}><ThemeProvider theme={theme}>{children}</ThemeProvider></VisualContext.Provider>
}
