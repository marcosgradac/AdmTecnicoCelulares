import { WhatsApp } from '@mui/icons-material'
import { SOCIAL_LINKS } from '../../../config/socialLinks'

export function FloatingWhatsApp() { return <a className="floating-whatsapp" href={SOCIAL_LINKS.whatsapp.salesUrl} target="_blank" rel="noopener noreferrer" aria-label="Contactar TecnoDesk por WhatsApp"><WhatsApp/><span>¿Necesitás ayuda?</span></a> }
