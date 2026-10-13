import { useTheme } from '@mui/material'
import darkLogo from '../../assets/brand/tecnodesk-logo-dark.svg'
import logo from '../../assets/brand/tecnodesk-logo.png'
import mark from '../../assets/brand/tecnodesk-mark.png'

export function BrandLogo({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  const theme = useTheme()
  return <img className={className} src={compact ? mark : theme.palette.mode === 'dark' ? darkLogo : logo} alt={compact ? 'TD' : 'TecnoDesk'} />
}
