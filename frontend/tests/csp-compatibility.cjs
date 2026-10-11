const assert = require('node:assert/strict')
const { readFileSync, mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve, dirname } = require('node:path')
const { chromium } = require('playwright')

async function main() {
  process.env.VITE_API_URL = 'https://api.tecnodeskpro.com'
  process.env.VITE_TURNSTILE_SITE_KEY = '1x00000000000000000000AA' // Public test key only.
  const directory = mkdtempSync(join(tmpdir(), 'tecnodesk-csp-'))
  const config = JSON.parse(readFileSync('vercel.json', 'utf8'))
  const headers = Object.fromEntries(config.headers[0].headers.map(h => [h.key, h.value]))
  // Enforce the proposed policy only in this disposable local server.
  headers['Content-Security-Policy'] = headers['Content-Security-Policy-Report-Only']
  const { build, preview } = await import('vite')
  let server, browser
  try {
    await build({ build: { outDir: directory, emptyOutDir: true, rollupOptions: { input: { app: resolve('index.html'), harness: resolve('tests/browser-hardening.html') } } } })
    server = await preview({ build: { outDir: directory }, preview: { host: '127.0.0.1', port: 5189, strictPort: true, headers } })
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_BROWSER_CHANNEL ? { channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL } : {}) })
    const context = await browser.newContext()
    const requests = []
    await context.route('**/*', async route => {
      const url = new URL(route.request().url()); requests.push(url.href)
      if (url.hostname === '127.0.0.1') return route.continue()
      if (url.hostname === 'api.tecnodeskpro.com') return route.fulfill({ contentType: 'application/json', body: '{"message":"Synthetic success"}' })
      if (url.hostname === 'challenges.cloudflare.com' && url.pathname.endsWith('api.js')) return route.fulfill({ contentType: 'application/javascript', body: `window.turnstile={render:function(element,options){const iframe=document.createElement('iframe');iframe.src='https://challenges.cloudflare.com/synthetic-frame';element.appendChild(iframe);options.callback('synthetic-captcha');return 'fixture'},remove:function(){}}` })
      if (url.hostname === 'challenges.cloudflare.com') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Synthetic CAPTCHA boundary</title>' })
      return route.abort() // Never make real CAPTCHA/API/font requests.
    })
    const page = await context.newPage()
    await page.goto('http://127.0.0.1:5189/')
    await page.getByRole('link', { name: 'Iniciar sesión', exact: true }).first().waitFor()
    await page.goto('http://127.0.0.1:5189/index.html')
    await page.evaluate(() => { history.replaceState(null, '', '/login'); location.reload() })
    await page.getByLabel(/Contraseña/).first().waitFor()
    assert.ok(await page.locator('style[data-emotion]').count() > 0)
    const manifest = await context.request.get('http://127.0.0.1:5189/site.webmanifest')
    assert.equal(manifest.status(), 200)
    await page.goto('http://127.0.0.1:5189/tests/browser-hardening.html?view=captcha')
    await page.getByTestId('captcha-token').getByText('accepted').waitFor()
    assert.ok(requests.some(url => url.includes('challenges.cloudflare.com/turnstile/v0/api.js')))
    assert.equal(await page.locator('iframe').count(), 1)
    assert.notEqual(await page.locator('body').evaluate(element => getComputedStyle(element).fontFamily), '')
    const result = await page.evaluate(async () => {
      const health = await fetch('https://api.tecnodeskpro.com/api/health').then(r => r.status)
      let evalBlocked = false, externalBlocked = false
      try { window.eval('window.__cspEvalExecuted=true') } catch { evalBlocked = true }
      try { await fetch('https://unauthorized.example.test/api') } catch { externalBlocked = true }
      const script = document.createElement('script'); script.textContent = 'window.__cspInlineExecuted=true'; document.head.appendChild(script)
      const registration = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      await registration.unregister()
      return { health, evalBlocked, externalBlocked, inlineExecuted: Boolean(window.__cspInlineExecuted), evalExecuted: Boolean(window.__cspEvalExecuted), worker: Boolean(registration.active) }
    })
    assert.deepEqual(result, { health: 200, evalBlocked: true, externalBlocked: true, inlineExecuted: false, evalExecuted: false, worker: true })
    await context.close()
    console.log('CSP compatibility passed: production bundle, MUI/Emotion, Turnstile script/frame fixture, API, service worker; inline scripts/eval/off-origin connections blocked')
  } finally {
    if (browser) await browser.close()
    if (server) await new Promise(resolve => server.httpServer.close(resolve))
    assert.equal(dirname(directory), tmpdir())
    assert.ok(directory.startsWith(join(tmpdir(), 'tecnodesk-csp-')))
    rmSync(directory, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
