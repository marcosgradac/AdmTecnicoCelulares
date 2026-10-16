const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path')
const { chromium } = require('playwright')
const { createMobileServer } = require('./mobile-ux-server.cjs')
const { openScreen } = require('./premium-theme-browser.cjs')
const { screens, interactions } = require('./mobile-ux-browser.cjs')

async function main() {
  process.env.MOBILE_UX_REUSE_BUILD = 'true'
  process.env.MOBILE_UX_DIAGNOSTICS = 'true'
  const server = await createMobileServer({ port: 5330 })
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_BROWSER_CHANNEL ? { channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL } : {}) })
  const results = []
  try {
    for (let repetition = 1; repetition <= 3; repetition++) {
      for (const mode of ['light', 'dark']) {
        for (const screen of screens.filter(screen => ['dashboard', 'dashboard-limited', 'cash', 'cash-equipment'].includes(screen.name))) {
          const { page, context, state, errors } = await openScreen(browser, 'http://127.0.0.1:5330', screen, mode, { width: 768, height: 1024 })
          try {
            const checked = await interactions(page, state, screen, 768)
            const native = checked.find(result => result.kind === 'native-touch-swipe')
            assert(native, 'Every affected tablet route must perform a native horizontal gesture')
            assert(native.horizontal.after > native.horizontal.before + 1)
            assert(native.vertical && !native.vertical.noScrollRoom, 'Affected tablet routes must exercise vertical page scrolling; no skip allowed')
            assert(native.vertical.direction * (native.vertical.after - native.vertical.before) > 1)
            assert.deepEqual(state.unhandled, [])
            assert.deepEqual(state.mutations, [])
            assert.deepEqual(errors, [])
            results.push({ repetition, mode, screen: screen.name, ...native })
            console.log(`PASS tablet native gestures ${repetition} ${mode} ${screen.name}`)
          } finally { await context.close() }
        }
      }
    }
    assert.equal(results.length, 24)
    const out = path.resolve(__dirname, '../../artifacts/mobile-ux')
    fs.mkdirSync(out, { recursive: true })
    fs.writeFileSync(path.join(out, 'tablet-regression.json'), JSON.stringify({ platform: process.platform, node: process.version, browser: browser.version(), results }, null, 2))
  } finally { await browser.close(); await server.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
