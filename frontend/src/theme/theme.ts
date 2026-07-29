import { alpha, createTheme } from '@mui/material/styles'

const colors = {
  primary: '#5B3FD6',
  primaryDark: '#4327B7',
  primaryLight: '#EEE9FF',
  accent: '#2F9BFF',
  background: '#F8F9FC',
  text: '#171A23',
  muted: '#687083',
  border: '#E8EAF0',
}

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: colors.primary, dark: colors.primaryDark, light: colors.primaryLight, contrastText: '#fff' },
    secondary: { main: colors.accent, light: '#EAF5FF' },
    background: { default: colors.background, paper: '#FFFFFF' },
    text: { primary: colors.text, secondary: colors.muted },
    divider: colors.border,
    success: { main: '#28B76B' },
    warning: { main: '#F5A623' },
    error: { main: '#E55353' },
    info: { main: colors.accent },
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: '"Inter", "Manrope", "Segoe UI", sans-serif',
    h1: { fontSize: 'clamp(1.5rem, 2.5vw, 2rem)', lineHeight: 1.2, fontWeight: 750, letterSpacing: '-0.035em' },
    h2: { fontSize: '1.25rem', fontWeight: 750, letterSpacing: '-0.02em' },
    h3: { fontSize: '1.05rem', fontWeight: 700 },
    h4: { fontSize: '1.5rem', fontWeight: 750 },
    h5: { fontSize: '1.25rem', fontWeight: 750 },
    h6: { fontSize: '1rem', fontWeight: 700 },
    body1: { fontSize: '0.94rem' },
    body2: { fontSize: '0.84rem' },
    button: { textTransform: 'none', fontWeight: 700 },
    overline: { fontSize: '0.72rem', letterSpacing: '0.08em', fontWeight: 750 },
  },
  components: {
    MuiCssBaseline: { styleOverrides: { body: { backgroundColor: colors.background } } },
    MuiCard: {
      styleOverrides: {
        root: {
          border: `1px solid ${colors.border}`,
          boxShadow: '0 6px 24px rgba(23,26,35,0.045)',
          backgroundImage: 'none',
          borderRadius: 16,
        },
      },
    },
    MuiCardContent: { styleOverrides: { root: { padding: 20, '&:last-child': { paddingBottom: 20 } } } },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { minHeight: 44, borderRadius: 11, paddingInline: 18 },
        containedPrimary: { '&:hover': { backgroundColor: colors.primaryDark } },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          minHeight: 46,
          borderRadius: 11,
          backgroundColor: '#fff',
          '& .MuiOutlinedInput-notchedOutline': { borderColor: colors.border },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: alpha(colors.primary, 0.5) },
          '&.Mui-focused': { boxShadow: `0 0 0 3px ${alpha(colors.primary, 0.12)}` },
        },
      },
    },
    MuiChip: { styleOverrides: { root: { borderRadius: 9, fontWeight: 700 }, icon: { fontSize: '17px' } } },
    MuiTableCell: { styleOverrides: { root: { borderColor: colors.border }, head: { color: colors.muted, fontSize: '0.73rem', fontWeight: 750 } } },
    MuiTooltip: { styleOverrides: { tooltip: { backgroundColor: colors.text, borderRadius: 8, fontSize: '0.75rem' } } },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 11,
          '&.Mui-selected': { color: colors.primary, backgroundColor: colors.primaryLight, '& .MuiListItemIcon-root': { color: colors.primary } },
          '&.Mui-selected:hover': { backgroundColor: '#E7E0FF' },
        },
      },
    },
  },
})

