import { DevicesRounded, SecurityRounded, SyncRounded } from '@mui/icons-material'

const highlights = [
  { icon: SecurityRounded, label: 'Tus datos están protegidos' },
  { icon: DevicesRounded, label: 'Acceso desde cualquier dispositivo' },
  { icon: SyncRounded, label: 'Sincronización en tiempo real' },
]

export function SecurityHighlights() {
  return <div className="login-highlights" aria-label="Ventajas de TecnoDesk">
    {highlights.map(({ icon: Icon, label }) => <span key={label}><Icon /><small>{label}</small></span>)}
  </div>
}
