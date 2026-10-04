// Real React/MUI in Chromium; mock only the HTTP boundary. No production DB is contacted.
// PLAYWRIGHT_MODULE may point to Codex's bundled Playwright; no dependency installation needed.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const origin = process.env.ACCOUNT_DELETION_UI_URL || 'http://127.0.0.1:5178'
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Only local UI')
const user = { id: 'owner-ui-test', firstName: 'Test', lastName: 'Owner', fullName: 'Test Owner', phone: null, email: 'owner@example.com', role: 'OWNER', platformRole: 'USER', termsAccepted: true, termsVersion: '1.0', termsAcceptedAt: null, privacyAccepted: true, privacyVersion: '1.0', privacyAcceptedAt: null, profileComplete: true, tutorialSeen: true, permissions: ['settings.access'], business: { id: 'business-ui-test', name: 'UI Test', logoUrl: null } }
async function main() {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_BROWSER_CHANNEL ? { channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL } : {}) })
  let passed = 0
  const check = label => console.log(`OK ${++passed}: ${label}`)
  try {
    for (const [role, platformRole] of [['TECHNICIAN', 'USER'], ['OWNER', 'SUPER_ADMIN'], ['OWNER', 'USER']]) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
      await context.addInitScript(() => { localStorage.setItem('cellufix_access_token', 'test-jwt'); localStorage.setItem('tecnodesk_tutorial_premium-v2_owner-ui-test', 'test'); sessionStorage.setItem('tecnodesk_trial_started', 'false') })
      let calls = 0, release, fail = true, heldMePage, heldMePromise, releaseMe, meStarted
      const requests = []
      await context.route('**/api/**', async route => {
        const req = route.request(), url = new URL(req.url()), path = url.pathname
        requests.push(`${req.method()} ${path}`)
        const fulfill = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
        if (path === '/api/account') {
          calls++
          assert.equal(req.method(), 'DELETE')
          assert.deepEqual(req.postDataJSON(), { password: 'CurrentPassword123!', confirmation: 'ELIMINAR MI CUENTA' })
          await new Promise(resolve => { release = resolve })
          return route.fulfill({ status: fail ? 400 : 200, contentType: 'application/json', body: JSON.stringify({ success: !fail, message: fail ? 'La contraseña actual es incorrecta.' : 'Tu cuenta fue eliminada permanentemente.' }) })
        }
        if (path === '/api/auth/me') {
          if (req.frame().page() === heldMePage) {
            meStarted()
            await heldMePromise
          }
          return fulfill({ ...user, role, platformRole })
        }
        if (path === '/api/settings') return fulfill({ business: { name: 'UI Test', phone: null, address: null, logoUrl: null } })
        if (path === '/api/team') return fulfill({ users: [] })
        if (path === '/api/billing/subscription') return fulfill({ id: 'subscription-test', planCode: 'COMPLETE', effectivePlanCode: 'COMPLETE', status: 'ACTIVE', trialStartedAt: '2026-10-01', trialEndsAt: '2026-10-30', currentPeriodStart: '2026-10-01', currentPeriodEnd: '2026-10-30', graceEndsAt: null, daysRemaining: 27, access: { status: 'ACTIVE', daysRemaining: 27, graceDaysRemaining: null, expiresAt: '2026-10-30', graceEndsAt: null }, plan: { code: 'COMPLETE', name: 'Completo', priceARS: 1, repairLimitPerPeriod: null, trackingLimitPerPeriod: null, dashboardComplete: true, advancedReports: true }, usage: { repairs: 0, trackingLinks: 0, entitlements: { commerce: true, repairLimitPerPeriod: null, trackingLimitPerPeriod: null, dashboardComplete: true, advancedReports: true }, periodStart: '2026-10-01', periodEnd: '2026-10-30' }, pendingPayment: null })
        if (path === '/api/billing/entitlements') return fulfill({ commerce: true })
        if (path === '/api/billing/plans') return fulfill([])
        return fulfill({})
      })
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(origin + '/admin/configuracion#seguridad')
      await page.getByRole('heading', { name: 'Seguridad', exact: true }).waitFor()
      const danger = page.getByRole('button', { name: 'Eliminar mi cuenta y negocio', exact: true })
      if (role === 'TECHNICIAN' || platformRole === 'SUPER_ADMIN') {
        assert.equal(await danger.count(), 0)
        check(`${role}/${platformRole}: no deletion option`)
        await context.close(); continue
      }
      await danger.click()
      const dialog = page.getByRole('dialog'), submit = dialog.getByRole('button', { name: 'Eliminar permanentemente', exact: true })
      await dialog.getByText('Esta acción no se puede deshacer.', { exact: true }).waitFor()
      assert.ok(await submit.isDisabled()); check('confirmation opens MUI Dialog with irreversible warning')
      await dialog.getByLabel('Contraseña actual').fill('CurrentPassword123!')
      const confirmation = dialog.getByLabel('Escribí ELIMINAR MI CUENTA para continuar')
      await confirmation.fill('eliminar mi cuenta'); assert.ok(await submit.isDisabled())
      await confirmation.fill('ELIMINAR MI CUENTA '); assert.ok(await submit.isDisabled())
      await confirmation.fill('ELIMINAR MI CUENTA'); assert.ok(await submit.isEnabled()); check('only exact phrase enables final button')
      if (process.env.ACCOUNT_DELETION_SCREENSHOT) await dialog.screenshot({ path: process.env.ACCOUNT_DELETION_SCREENSHOT })
      // Two click events before React re-render exercise the synchronous double-submit guard.
      await submit.evaluate(button => { button.click(); button.click() })
      await page.waitForFunction(() => document.querySelector('[role="progressbar"]'))
      assert.equal(calls, 1)
      assert.ok(await submit.isDisabled())
      await page.keyboard.press('Escape')
      await page.locator('.MuiBackdrop-root').click({ position: { x: 3, y: 3 }, force: true })
      assert.ok(await dialog.isVisible()); check('double click single request; busy blocks Escape/backdrop')
      release()
      await dialog.getByText('La contraseña actual es incorrecta.', { exact: true }).waitFor()
      assert.equal(await page.evaluate(() => localStorage.getItem('cellufix_access_token')), 'test-jwt')
      assert.ok(await submit.isEnabled()); check('controlled failure keeps session and allows retry')
      fail = false
      const secondTab = await context.newPage()
      heldMePage = secondTab
      heldMePromise = new Promise(resolve => { releaseMe = resolve })
      const pendingMe = new Promise(resolve => { meStarted = resolve })
      await secondTab.goto(origin + '/admin/configuracion')
      await pendingMe
      await submit.click()
      await page.waitForFunction(() => document.querySelector('[role="progressbar"]'))
      release()
      await page.waitForURL('**/login')
      await page.getByText('Tu cuenta fue eliminada permanentemente.', { exact: true }).waitFor()
      assert.equal(await page.evaluate(() => localStorage.getItem('cellufix_access_token')), null)
      assert.equal(await page.evaluate(() => localStorage.getItem('tecnodesk_tutorial_premium-v2_owner-ui-test')), null)
      assert.equal(await page.evaluate(() => sessionStorage.getItem('tecnodesk_trial_started')), null)
      const lateMeResponse = secondTab.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/me')
      releaseMe()
      await lateMeResponse
      await secondTab.waitForURL('**/login')
      assert.ok(!requests.some(req => req.includes('logout'))); check('success clears session/tutorial; login notice; other tab signed out; no logout HTTP')
      assert.deepEqual(errors, []); check('no browser runtime errors')
      await context.close()
    }
    for (const [audience, code] of [['TECHNICIAN', 'SUBSCRIPTION_BLOCKED'], ['OWNER', 'SUBSCRIPTION_BLOCKED'], ['OWNER', 'BUSINESS_BLOCKED']]) {
      const blockedContext = await browser.newContext()
      const restrictedToken = 'deletion-only-memory-token-' + code
      const blockedRequests = []
      let deletionCalls = 0
      await blockedContext.route('**/api/**', async route => {
        const req = route.request(), path = new URL(req.url()).pathname
        blockedRequests.push(path)
        const fulfill = (status, data) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
        if (path === '/api/health') return fulfill(200, { ok: true })
        if (path === '/api/auth/login') return fulfill(403, { success: false, code, audience, message: 'Tu cuenta está temporalmente bloqueada', ...(audience === 'OWNER' ? { deletionToken: restrictedToken } : {}) })
        if (path === '/api/account') {
          deletionCalls++
          assert.equal(req.method(), 'DELETE')
          assert.equal(req.headers().authorization, 'Bearer ' + restrictedToken, 'restricted Authorization must not be overwritten by normal-session interceptor')
          assert.deepEqual(req.postDataJSON(), { password: 'CurrentPassword123!', confirmation: 'ELIMINAR MI CUENTA' })
          if (deletionCalls === 1) return fulfill(400, { success: false, message: 'La contraseña actual es incorrecta.' })
          return fulfill(200, { success: true, message: 'Tu cuenta fue eliminada permanentemente.' })
        }
        return fulfill(401, { success: false, message: 'No autorizado' })
      })
      const blockedPage = await blockedContext.newPage()
      await blockedPage.goto(origin + '/login')
      await blockedPage.getByLabel('Email').fill('blocked@example.com')
      await blockedPage.getByLabel(/^Contraseña/).fill('CurrentPassword123!')
      await blockedPage.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
      const blockedTitle = audience === 'OWNER' ? 'Tu cuenta está temporalmente bloqueada' : 'Acceso temporalmente suspendido'
      await blockedPage.getByRole('heading', { name: blockedTitle, exact: true }).waitFor()
      const deletionButton = blockedPage.getByRole('button', { name: 'Eliminar mi cuenta y negocio', exact: true })
      if (audience === 'TECHNICIAN') {
        assert.equal(await deletionButton.count(), 0); check('blocked TECHNICIAN cannot access deletion UI')
        await blockedContext.close(); continue
      }
      assert.equal(await blockedPage.evaluate(() => localStorage.getItem('cellufix_access_token')), null)
      const stored = await blockedPage.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]))
      assert.ok(!stored.includes(restrictedToken)); assert.ok(!blockedRequests.includes('/api/settings'))
      // A reload before deleting must lose the capability and require fresh credentials.
      await blockedPage.reload()
      assert.equal(await deletionButton.count(), 0)
      await blockedPage.getByLabel('Email').fill('blocked@example.com')
      await blockedPage.getByLabel(/^Contraseña/).fill('CurrentPassword123!')
      await blockedPage.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
      await blockedPage.getByRole('heading', { name: blockedTitle, exact: true }).waitFor()
      await deletionButton.click()
      const blockedDialog = blockedPage.getByRole('dialog')
      await blockedDialog.getByText('Esta acción no se puede deshacer.', { exact: true }).waitFor()
      const blockedSubmit = blockedDialog.getByRole('button', { name: 'Eliminar permanentemente', exact: true })
      assert.ok(await blockedSubmit.isDisabled())
      await blockedDialog.getByLabel('Contraseña actual').fill('CurrentPassword123!')
      await blockedDialog.getByLabel('Escribí ELIMINAR MI CUENTA para continuar').fill('ELIMINAR MI CUENTA')
      // Simulate stale conventional storage; explicit purpose authorization must still win.
      await blockedPage.evaluate(() => { localStorage.setItem('cellufix_access_token', 'stale-normal-token'); localStorage.setItem('tecnodesk_tutorial_premium-v2_owner-ui-test', 'data') })
      await blockedSubmit.click()
      await blockedDialog.getByText('La contraseña actual es incorrecta.', { exact: true }).waitFor()
      assert.ok(blockedPage.url().endsWith('/login')); check(code + ': same irreversible Dialog, token only in memory, no normal access')
      await blockedSubmit.click()
      await blockedPage.getByText('Tu cuenta fue eliminada permanentemente.', { exact: true }).waitFor()
      assert.equal(await blockedPage.getByRole('dialog').count(), 0)
      assert.equal(await blockedPage.evaluate(() => localStorage.getItem('cellufix_access_token')), null)
      assert.equal(await blockedPage.evaluate(() => localStorage.getItem('tecnodesk_tutorial_premium-v2_owner-ui-test')), null)
      assert.ok(!blockedRequests.some(path => path.includes('logout'))); check(code + ': deletion-only success clears data and displays notice without dashboard/logout HTTP')
      await blockedPage.reload()
      assert.equal(await deletionButton.count(), 0); await blockedPage.getByLabel('Email').waitFor()
      check(code + ': reload discards capability and requires credentials again')
      await blockedContext.close()
    }
    const trackingContext = await browser.newContext()
    const trackingRequests = []
    await trackingContext.route('**/api/**', async route => {
      trackingRequests.push(new URL(route.request().url()).pathname)
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Seguimiento no encontrado' }) })
    })
    const trackingPage = await trackingContext.newPage()
    for (const path of ['/seguimiento/deleted-token', '/s/deleted-business/deleted-token']) {
      await trackingPage.goto(origin + path)
      await trackingPage.getByText('Seguimiento no encontrado', { exact: true }).waitFor()
      assert.ok(trackingRequests.includes('/api/tracking/deleted-token'))
      check(path + ': public API 404 displays no tenant data')
    }
    await trackingContext.close()
    console.log(`ACCOUNT DELETION UI TESTS PASSED: ${passed}`)
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
