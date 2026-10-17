import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { metadataForPath, publicOutput, withMetadata, pageFile } from './seo-policy.mjs'

export function seoPlugin() {
  let root, outDir
  return {
    name: 'tecnodesk:seo', enforce: 'post',
    configResolved(config) { root = config.root; outDir = resolve(root, config.build.outDir) },
    transformIndexHtml: { order: 'post', handler(html, context) {
      return withMetadata(html, metadataForPath(context.originalUrl || context.path || '/'))
    } },
    generateBundle: { order: 'post', handler(_options, bundle) {
      const html = bundle['index.html']?.source
      if (typeof html !== 'string') throw new Error('SEO requires the built index.html')
      for (const [path, fileName] of Object.entries(publicOutput)) {
        const source = withMetadata(html, metadataForPath(path))
        if (fileName === 'index.html') bundle[fileName].source = source
        else this.emitFile({ type: 'asset', fileName, source })
      }
      for (const fileName of ['app.html', '404.html']) this.emitFile({ type: 'asset', fileName, source: withMetadata(html, metadataForPath('/not-public')) })
    } },
    // Local preview mirrors static SPA routing, never proxies the production API.
    // The deployed host's routing must still be checked after an authorized release.
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!['GET', 'HEAD'].includes(request.method)) return next()
        const path = new URL(request.url || '/', 'http://localhost').pathname
        if (/\.[a-z0-9]+$/i.test(path) && existsSync(resolve(outDir, '.' + path))) return next()
        const file = pageFile(path)
        response.statusCode = file === '404.html' ? 404 : 200
        response.setHeader('Content-Type', 'text/html; charset=utf-8')
        if (file === 'app.html' || file === '404.html') response.setHeader('X-Robots-Tag', 'noindex, nofollow')
        const config = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8'))
        for (const rule of config.headers.filter(rule => rule.source === '/(.*)')) for (const header of rule.headers) response.setHeader(header.key, header.value)
        response.end(request.method === 'HEAD' ? undefined : readFileSync(resolve(outDir, file)))
      })
    },
  }
}
