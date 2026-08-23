import { Facebook, Instagram, WhatsApp } from '@mui/icons-material'
import { SOCIAL_LINKS } from '../../../config/socialLinks'

const items = [
  { ...SOCIAL_LINKS.instagram, icon: <Instagram/>, aria: 'Instagram de TecnoDesk' },
  { ...SOCIAL_LINKS.facebook, icon: <Facebook/>, aria: 'Facebook de TecnoDesk' },
  { label: SOCIAL_LINKS.whatsapp.label, url: SOCIAL_LINKS.whatsapp.salesUrl, icon: <WhatsApp/>, aria: 'Contactar TecnoDesk por WhatsApp' },
]

export function SocialLinks() { return <div className="social-links" aria-label="Redes y contacto de TecnoDesk">{items.map(item => <a key={item.label} href={item.url} target="_blank" rel="noopener noreferrer" aria-label={item.aria}>{item.icon}<span>{item.label}</span></a>)}</div> }
