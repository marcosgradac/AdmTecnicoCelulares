import { LockRounded, VerifiedUserRounded } from '@mui/icons-material'

export function SecurityPreview({ title, description }: { title: string; description: string }) {
  return <div className="showcase-screen showcase-security">
    <div className="showcase-security-icon"><LockRounded /></div>
    <span>Seguridad TecnoDesk</span><b>{title}</b><p>{description}</p>
    <div className="showcase-status"><i><VerifiedUserRounded /></i><span><small>Estado de la cuenta</small><b>Protegida</b></span></div>
  </div>
}
