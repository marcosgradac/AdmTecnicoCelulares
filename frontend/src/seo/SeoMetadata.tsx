import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'
import pages from './pages.json'

const origin = 'https://www.tecnodeskpro.com'
const aliases: Record<string, string> = { '/terminos': '/terminos-y-condiciones', '/privacidad': '/politica-de-privacidad' }
export function SeoMetadata() {
  const { pathname } = useLocation()
  useLayoutEffect(() => {
    const path = pathname.replace(/\/$/, '') || '/'
    const canonicalPath = aliases[path] || path
    const page = (pages as Record<string, { title: string; description: string }>)[canonicalPath]
    document.head.querySelectorAll('[data-tecnodesk-seo], meta[name="description"], meta[name="robots"], meta[property^="og:"], meta[name^="twitter:"], link[rel="canonical"]').forEach(node => node.remove())
    document.title = page?.title || 'TecnoDesk | Gestión técnica'
    const meta = (key: string, content: string, property = false) => {
      const element = document.createElement('meta'); element.setAttribute(property ? 'property' : 'name', key)
      element.content = content; element.dataset.tecnodeskSeo = ''; document.head.append(element)
    }
    meta('robots', page ? 'index, follow' : 'noindex, nofollow')
    meta('description', page?.description || 'Accedé a TecnoDesk.')
    if (page) {
      const canonical = document.createElement('link'); canonical.rel = 'canonical'; canonical.href = origin + canonicalPath
      canonical.dataset.tecnodeskSeo = ''; document.head.append(canonical)
      for (const [key, content] of Object.entries({ title: page.title, description: page.description, type: 'website', url: origin + canonicalPath, site_name: 'TecnoDesk', locale: 'es_AR', image: origin + '/tecnodesk-512.png', 'image:type': 'image/png', 'image:width': '512', 'image:height': '512', 'image:alt': 'TecnoDesk' })) meta('og:' + key, content, true)
      for (const [key, content] of Object.entries({ card: 'summary', title: page.title, description: page.description, image: origin + '/tecnodesk-512.png' })) meta('twitter:' + key, content)
    }
  }, [pathname])
  return null
}
