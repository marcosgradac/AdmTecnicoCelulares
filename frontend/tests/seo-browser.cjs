const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path')
const { chromium } = require('playwright')
const { createFixtureState, installMockApi } = require('./premium-theme-fixtures.cjs')

async function main() {
  const { preview } = await import('vite')
  const { publicPages, privateRoutes, publicOutput, aliases, matchRoute } = await import('../scripts/seo-policy.mjs')
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../vercel.json'), 'utf8'))
  const expectedPreviews = [
    { source: '/s/:clientSlug/:token', has: [{ type: 'header', key: 'user-agent', value: '.*([Ff]acebookexternalhit|[Ff]acebot|[Ww]hats[Aa]pp).*' }], destination: 'https://api.tecnodeskpro.com/api/tracking-preview/:token?clientSlug=:clientSlug' },
    { source: '/seguimiento/:token', has: [{ type: 'header', key: 'user-agent', value: '.*([Ff]acebookexternalhit|[Ff]acebot|[Ww]hats[Aa]pp).*' }], destination: 'https://api.tecnodeskpro.com/api/tracking-preview/:token' },
  ]
  assert.deepEqual(config.rewrites.slice(0, 2), expectedPreviews, 'Keep WhatsApp/Facebook preview proxy rules first and unchanged')
  assert(!config.rewrites.some(rule => rule.source === '/(.*)'), 'No universal SPA rewrite')
  const expectedRules = [
    ...Object.entries(publicOutput).filter(([p]) => p !== '/').map(([source, file]) => ({ source, destination: '/' + file })),
    ...Object.entries(aliases).map(([source, p]) => ({ source, destination: '/' + publicOutput[p] })),
    ...privateRoutes.map(source => ({ source, destination: '/app.html' })),
  ]
  assert.deepEqual(config.rewrites.slice(2), expectedRules)
  // Fail when React Router gains an entry point without a matching static-host rule.
  const app = fs.readFileSync(path.join(__dirname, '../src/App.tsx'), 'utf8')
  const routes = [...app.matchAll(/path="([^"]+)"/g)].map(([, p]) => p.startsWith('/') || p === '*' ? p : '/admin/' + p)
  for (const route of routes.filter(route => route !== '*')) {
    assert(Object.hasOwn(publicPages, route) || Object.hasOwn(aliases, route) || privateRoutes.includes(route.replace('/*', '/:path*')), 'Missing host route: ' + route)
  }
  for (const route of privateRoutes) {
    assert(routes.includes(route.replace('/:path*', '/*')), 'Stale host route: ' + route)
    assert(config.headers.some(rule => rule.source === route && rule.headers.some(h => h.key === 'X-Robots-Tag' && h.value.includes('noindex'))))
  }
  const security = config.headers.find(rule => rule.source === '/(.*)').headers
  for (const key of ['Content-Security-Policy-Report-Only', 'X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy', 'X-Frame-Options']) assert(security.some(h => h.key === key))
  for (const bot of ['WhatsApp/2.24', 'facebookexternalhit/1.1', 'Facebot']) {
    for (const rule of expectedPreviews) {
      assert(new RegExp(rule.has[0].value).test(bot))
      const input = rule.source.replace(':clientSlug', 'synthetic-client').replace(':token', 'synthetic-token')
      assert(matchRoute(rule.source, input))
    }
  }
  const server = await preview({ root: path.resolve(__dirname, '..'), preview: { host: '127.0.0.1', port: 5357, strictPort: true } })
  const base = 'http://127.0.0.1:5357'
  let browser
  try {
    // Raw HTTP checks: no JS, authentication, credentials or external API calls.
    const report = []
    for (const route of [...Object.keys(publicPages), ...privateRoutes.map(p => p.replace(/:path\*/g, 'legacy/path').replace(/:[^/]+/g, 'synthetic-token')), '/missing', '/admin/missing', '/missing.txt', '/s/malformed']) {
      for (const method of ['GET', 'HEAD']) {
        const r = await fetch(base + route, { method, headers: { 'User-Agent': 'Googlebot/2.1' } })
        const unknown = ['/missing', '/admin/missing', '/missing.txt', '/s/malformed'].includes(route)
        assert.equal(r.status, unknown ? 404 : 200, route + ' HTTP status')
        assert(r.headers.get('content-type').includes('text/html'))
        assert.equal(r.headers.get('x-robots-tag'), Object.hasOwn(publicPages, route) ? null : 'noindex, nofollow')
        const html = await r.text()
        if (method === 'GET') {
          assert(html.includes('noindex') === !Object.hasOwn(publicPages, route), route + ' initial robots')
          if (Object.hasOwn(publicPages, route)) {
            assert(html.includes(`href="https://www.tecnodeskpro.com${route}"`))
            assert(html.includes(`property="og:url" content="https://www.tecnodeskpro.com${route}"`))
            assert.equal((html.match(/rel="canonical"/g) || []).length, 1)
            assert(html.includes(publicPages[route].title))
          }
          else { assert(!html.includes('rel="canonical"')); assert(!html.includes('synthetic-token')) }
        } else assert.equal(html, '')
        report.push({ route, method, status: r.status, contentType: r.headers.get('content-type'), robots: r.headers.get('x-robots-tag') })
      }
    }
    for (const [route, type] of [['/robots.txt', 'text/plain'], ['/sitemap.xml', 'xml']]) {
      const r = await fetch(base + route); assert.equal(r.status, 200); assert(r.headers.get('content-type').includes(type))
      const text = await r.text(); assert(!text.includes('<html')); assert(!text.includes('Disallow:'))
      if (route.endsWith('xml')) assert.deepEqual([...text.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]), Object.keys(publicPages).map(p => 'https://www.tecnodeskpro.com' + p))
      else assert(text.includes('Sitemap: https://www.tecnodeskpro.com/sitemap.xml'))
      const head = await fetch(base + route, { method: 'HEAD' })
      assert.equal(head.status, 200); assert(head.headers.get('content-type').includes(type)); assert.equal(await head.text(), '')
    }
    const entryHtml = await (await fetch(base + '/')).text()
    const assetPaths = [...entryHtml.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(m => m[1])
    assert(assetPaths.some(p => p.endsWith('.js')) && assetPaths.some(p => p.endsWith('.css')))
    for (const route of [...assetPaths, '/tecnodesk-512.png']) {
      const response = await fetch(base + route, { method: 'HEAD' }); assert.equal(response.status, 200)
      assert(response.headers.get('content-type').includes(route.endsWith('.js') ? 'javascript' : route.endsWith('.css') ? 'text/css' : 'image/png'))
    }
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_BROWSER_CHANNEL ? { channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL } : {}) })
    let contexts = 0
    for (const mode of ['light', 'dark']) for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block', colorScheme: mode })
      const state = createFixtureState({ themePreference: mode.toUpperCase() })
      await installMockApi(context, state)
      const page = await context.newPage(), errors = []
      page.on('pageerror', error => errors.push(error.message))
      async function check(route, isPublic) {
        const response = await page.goto(base + route); assert(response.status() < 400 || route === '/missing')
        await page.waitForFunction(() => document.head.querySelectorAll('meta[name="robots"]').length === 1)
        const robots = page.locator('meta[name="robots"]')
        if (isPublic) {
          await page.waitForFunction(() => document.querySelector('link[rel="canonical"]'))
          assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), 'https://www.tecnodeskpro.com' + route)
          assert.equal(await robots.getAttribute('content'), 'index, follow')
          assert.equal(await page.title(), publicPages[route].title)
          assert.equal(await page.locator('meta[property="og:url"]').getAttribute('content'), 'https://www.tecnodeskpro.com' + route)
          assert.equal(await page.locator('meta[name="description"]').count(), 1)
        }
        else { assert((await robots.getAttribute('content')).includes('noindex')); assert.equal(await page.locator('link[rel="canonical"]').count(), 0) }
        assert.equal(await page.locator('title').count(), 1)
      }
      await check('/', true)
      await page.getByRole('heading', { level: 1 }).waitFor()
      // Native React Router navigation: head must update without a document request.
      const legal = page.locator('a[href="/politica-de-privacidad"]').first()
      await legal.click(); await page.waitForURL('**/politica-de-privacidad')
      await page.waitForFunction(() => document.title === 'Política de privacidad | TecnoDesk')
      assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), 'https://www.tecnodeskpro.com/politica-de-privacidad')
      await page.goBack(); await page.waitForURL(base + '/')
      await page.waitForFunction(() => document.title.includes('Software de gestión'))
      for (const route of Object.keys(publicPages).slice(1)) await check(route, true)
      for (const route of ['/login', '/register', '/olvide-mi-contrasena', '/restablecer-contrasena?token=synthetic-token', '/admin', '/s/synthetic-client/synthetic-token', '/seguimiento/synthetic-token', '/missing']) await check(route, false)
      await page.getByRole('heading', { name: 'Página no encontrada' }).waitFor()
      await page.getByRole('link', { name: 'Volver a TecnoDesk' }).click()
      await page.waitForFunction(() => document.title.includes('Software de gestión'))
      // Authorized modules still load with synthetic API and existing access control.
      await page.evaluate(() => localStorage.setItem('cellufix_access_token', 'synthetic-owner'))
      for (const [route, heading] of [['/admin', 'Inicio ·'], ['/admin/caja', 'Caja'], ['/admin/venta-equipos', 'Compra y reventa']]) {
        await check(route, false); await page.locator('main').getByText(heading, { exact: false }).first().waitFor()
      }
      assert.deepEqual(errors, []); assert.deepEqual(state.unhandled, []); assert.deepEqual(state.mutations, [])
      await context.close(); contexts++
      console.log('PASS SEO navigation', width, mode)
    }
    const directory = path.resolve(__dirname, '../../artifacts/seo'); fs.mkdirSync(directory, { recursive: true })
    fs.writeFileSync(path.join(directory, 'local-http.json'), JSON.stringify({ host: 'Vite preview with SEO routing; NOT a deployed Vercel verification', report, contexts, browser: browser.version() }, null, 2))
    console.log('PASS SEO:', report.length, 'raw HTTP checks; static sitemap/robots MIME; initial HTML; four browser contexts; unchanged preview contracts')
  } finally { await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve)) }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
