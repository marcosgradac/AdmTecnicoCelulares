const assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs');
const { chromium } = require('playwright');
async function main() {
    process.env.VITE_API_URL = 'http://127.0.0.1:39887';
    const reservation = require('node:net').createServer();
    await new Promise(r => reservation.listen(0, '127.0.0.1', r));
    const port = reservation.address().port;
    await new Promise(r => reservation.close(r));
    const { createServer } = await import('vite');
    const server = await createServer({ server: { host: '127.0.0.1', port, strictPort: true }, mode: 'test' });
    await server.listen();
    const base = 'http://127.0.0.1:' + server.httpServer.address().port;
    const browser = await chromium.launch({ headless: process.env.REGISTER_HEADED !== '1', ...(process.env.PLAYWRIGHT_BROWSER_CHANNEL ? { channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL } : {}) });
    let passed = 0;
    const out = path.resolve(process.env.REGISTER_SCREENSHOTS || '../docs/register-validation/screenshots');
    fs.mkdirSync(out, { recursive: true });
    try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
        let calls = [], response = { status: 409, body: { message: 'PRIVATE_ACCOUNT_DETAIL' } };
        await context.addInitScript(() => { window.__security = {}; window.turnstile = { render(el, opts) { window.__security = opts; el.textContent = 'Verificación de seguridad simulada (prueba local)'; return 'test-widget'; }, remove() { } }; });
        await context.route('**/*', r => ['127.0.0.1', 'localhost'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
        await context.route('**/api/**', async (r) => { if (new URL(r.request().url()).pathname === '/api/auth/register') {
            calls.push(r.request().postDataJSON());
            if (response.abort)
                return r.abort('failed');
            return r.fulfill({ status: response.status, contentType: 'application/json', body: JSON.stringify(response.body) });
        } return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) }); });
        console.log("Browser ready");
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        page.setDefaultNavigationTimeout(120000);
        const field = name => page.getByLabel(new RegExp('^' + name + '(?:\\s*\\*)?$'));
        const submit = () => page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
        async function fresh() { await page.goto(base + '/register', { waitUntil: 'domcontentloaded' }); await field('Nombre').waitFor(); await page.waitForFunction(() => Boolean(window.__security.callback)); calls = []; }
        async function valid() { for (const [n, v] of [['Nombre', 'marina'], ['Apellido', 'demo'], ['Teléfono', '0000000001'], ['Nombre del negocio', 'Taller Demo'], ['Teléfono del negocio', '0000000002'], ['Email', 'registro@example.invalid'], ['Contraseña', 'Registro123'], ['Confirmar contraseña', 'Registro123']])
            await field(n).fill(v); await page.getByRole('checkbox').check(); }
        await fresh();
        await field('Contraseña').fill('registro12!');
        await page.getByText('La contraseña requiere: al menos una letra mayúscula.', {exact:true}).waitFor();
        assert.equal(await field('Contraseña').evaluate(e=>e===document.activeElement), true);
        await field('Contraseña').fill('Registro123');
        assert.equal(await page.locator('#register-password-helper-text').count(),0);
        assert.equal(await field('Contraseña').getAttribute('aria-invalid'),'false');
        assert.equal(calls.length,0);
        console.log('PASS live password error and correction without blur'); passed++;
        if (!process.env.REGISTER_VISUAL_ONLY) {
            console.log("Probe empty submission");
            await fresh();
            await submit();
            await page.getByText('Ingresá tu nombre', { exact: true }).waitFor();
            assert.equal(await field('Nombre').evaluate(e => e === document.activeElement), true);
            assert.equal(calls.length, 0);
            assert.equal(await page.locator('form').getAttribute('novalidate'), '');
            passed++;
            console.log('PASS empty fields, pending Turnstile, focus and custom validation');
            await valid();
            assert.equal(await page.locator('form .MuiFormHelperText-root.Mui-error').filter({hasNotText:'Completá la verificación'}).count(),0);
            assert.equal(calls.length,0);
            console.log('PASS errors clear individually while security remains pending');passed++;
            await fresh();
            await field('Nombre del negocio').fill('A');
            await field('Nombre').click();
            await page.getByText('El nombre del negocio debe tener al menos 2 caracteres', { exact: true }).waitFor();
            passed++;
            for (const [password, missing] of [['abcdef12!', 'mayúscula'], ['ABCDEF12!', 'minúscula'], ['Abcdefgh!', 'número'], ['Abc123', '8 caracteres'], ['Aa1' + 'x'.repeat(126), '128 caracteres']]) {
                await fresh();
                await valid();
                await field('Contraseña').fill(password);
                await field('Confirmar contraseña').fill(password);
                await page.evaluate(() => window.__security.callback('synthetic-token'));
                await submit();
                assert.equal(calls.length, 0, password + ' must not reach API');
                assert((await field('Contraseña').getAttribute('aria-describedby')).includes('register-password-requirements'));
                console.log('PASS missing ' + missing);
                assert.equal(await field('Contraseña').getAttribute('aria-invalid'), 'true');
                assert((await page.locator('#register-password-helper-text').innerText()).includes(missing));
                assert.equal(await field('Contraseña').evaluate(e => e === document.activeElement), true);
                passed++;
            }
            for (const [n, v, msg] of [['Confirmar contraseña', 'Otra1234', 'Las contraseñas no coinciden'], ['Teléfono', '123', 'Ingresá un teléfono válido'], ['Teléfono del negocio', 'abcdef', 'Ingresá un teléfono válido'], ['Email', 'mal@@correo', 'Revisá el formato de tu correo electrónico']]) {
                await fresh();
                await valid();
                await field(n).fill(v);
                await submit();
                assert.equal(calls.length, 0);
                assert((await page.locator('form').innerText()).includes(msg));
                assert.equal(await field(n).evaluate(e => e === document.activeElement), true);
                passed++;
            }
            await fresh();
            await valid();
            await page.getByRole('checkbox').uncheck();
            await submit();
            assert.equal(calls.length, 0);
            assert.equal(await page.getByRole('checkbox').evaluate(e => e === document.activeElement), true);
            await page.getByText('Aceptá los términos y la política de privacidad para continuar', { exact: true }).waitFor();
            passed++;
            await fresh();
            await valid();
            await submit();
            assert.equal(calls.length, 0);
            await page.getByText('Completá la verificación de seguridad para continuar.', { exact: true }).waitFor();
            await page.evaluate(() => window.__security['error-callback']());
            await page.getByText(/No pudimos completar la verificación/).waitFor();
            assert.equal(calls.length, 0);
            passed++;
            for (const [status, message] of [[400, 'Revisá los datos'], [403, 'verificación de seguridad'], [409, 'No pudimos crear la cuenta con esos datos'], [429, 'Demasiados intentos'], [503, 'no está disponible'], [500, 'servicio no está disponible']]) {
                await fresh();
                await valid();
                response = { status, body: { message: 'PRIVATE_ACCOUNT_DETAIL' } };
                await page.evaluate(() => window.__security.callback('synthetic-token'));
                await submit();
                await page.getByRole('alert').filter({ hasText: new RegExp(message, 'i') }).waitFor();
                assert.equal(calls.length, 1);
                assert(!(await page.locator('body').innerText()).includes('PRIVATE_ACCOUNT_DETAIL'));
                passed++;
            }
            await fresh();
            await valid();
            response = { abort: true };
            await page.evaluate(() => window.__security.callback('synthetic-token'));
            await submit();
            await page.getByRole('alert').filter({ hasText: /conexión/ }).waitFor();
            passed++;
            await fresh();
            await valid();
            await page.evaluate(() => { window.__security.callback('synthetic-token'); window.__security['expired-callback'](); });
            await submit();
            assert.equal(calls.length, 0);
            passed++;
        }
        for (const theme of ['light', 'dark'])
            for (const width of [360, 390, 430, 1440]) {
                await page.emulateMedia({ colorScheme: theme });
                await page.setViewportSize({ width, height: width === 1440 ? 1000 : 932 });
                await fresh();
                await valid();
                await field('Contraseña').fill('registro12!');
                await field('Confirmar contraseña').fill('registro12!');
                await submit();
                assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
                console.log('VIEW ' + width + ' ' + theme);

                const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 8).map(e => ({ tag: e.tagName, cls: e.className, width: e.getBoundingClientRect().width, right: e.getBoundingClientRect().right })));
                if (overflow.length) await page.screenshot({ path: path.join(out, 'overflow-debug.png'), fullPage: true });
                assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, JSON.stringify(overflow));
                await page.screenshot({ path: path.join(out, `registro-${width}-${theme}.png`), fullPage: width === 1440 });
                await page.getByRole('list', { name: 'Requisitos de la contraseña' }).scrollIntoViewIfNeeded();
                await page.screenshot({ path: path.join(out, `password-${width}-${theme}.png`) });
                await field('Contraseña').fill('Registro123');
                await field('Confirmar contraseña').fill('Registro123');
                assert.equal(await page.locator('#register-password-helper-text').count(),0);
                assert.equal(await page.locator('#register-repeatPassword-helper-text').count(),0);
                assert.equal(calls.length,0);
                assert.equal(await page.getByText('Completá la verificación de seguridad para continuar.',{exact:true}).isVisible(),true);
                await page.evaluate(()=>window.__security.callback('synthetic-token'));
                assert.equal(await page.locator('#register-security-error').count(),0);
                if([390,1440].includes(width)) await page.screenshot({path:path.join(out,`corregido-${width}-${theme}.png`)});
                passed++;
            }
        await fresh();
        await valid();
        response = { status: 201, body: { token: 'synthetic-registration-session', user: { id: 'local-user', fullName: 'marina demo', firstName: 'marina', lastName: 'demo', role: 'OWNER', profileComplete: true, tutorialSeen: true, themePreference: 'SYSTEM', permissions: [], business: { id: 'local-business', name: 'Taller Demo', logoUrl: null } } } };
        await page.evaluate(() => window.__security.callback('synthetic-token'));
        await submit();
        await page.waitForURL('**/admin',{waitUntil:'domcontentloaded'});
        assert.equal(calls.length, 1);
        assert.equal(calls[0].password, 'Registro123');
        assert.equal(calls[0].firstName, 'marina');
        assert.equal(calls[0].termsAccepted, true);
        assert.equal(calls[0].privacyAccepted, true);
        assert(calls[0].termsVersion && calls[0].privacyVersion);
        passed++;
        console.log(`PASS ${passed} registration scenarios; synthetic API only`);
        await context.close();
    }
    catch (e) {
        console.error(e);
        throw e;
    }
    finally {
        await browser.close();
        await server.close();
    }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
