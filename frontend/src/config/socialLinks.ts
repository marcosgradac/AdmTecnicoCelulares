export const SOCIAL_LINKS = {
  instagram: { label: 'Instagram', username: '@tecnodeskadm', url: 'https://www.instagram.com/tecnodeskadm/' },
  facebook: { label: 'Facebook', url: 'https://www.facebook.com/profile.php?id=61593901343867' },
  whatsapp: { label: 'WhatsApp', phone: '5493571351843', url: 'https://wa.me/5493571351843', salesUrl: 'https://wa.me/5493571351843?text=Hola%2C%20vi%20TecnoDesk%20y%20quiero%20m%C3%A1s%20informaci%C3%B3n.' },
} as const

export const WHATSAPP_SUPPORT_URL = SOCIAL_LINKS.whatsapp.url
export const INSTAGRAM_SUPPORT_URL = SOCIAL_LINKS.instagram.url
export const FACEBOOK_SUPPORT_URL = SOCIAL_LINKS.facebook.url

export const SUPPORT_LINKS = {
  whatsapp: WHATSAPP_SUPPORT_URL,
  instagram: INSTAGRAM_SUPPORT_URL,
  facebook: FACEBOOK_SUPPORT_URL,
} as const
