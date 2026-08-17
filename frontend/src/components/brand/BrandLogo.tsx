import logo from '../../assets/brand/tecnodesk-logo.png'
import mark from '../../assets/brand/tecnodesk-mark.png'

export function BrandLogo({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  return <img className={className} src={compact ? mark : logo} alt={compact ? 'TD' : 'TecnoDesk'} />
}
