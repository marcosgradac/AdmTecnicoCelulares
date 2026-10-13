# Premium theme visual fixtures

These files mount the real `App`, router, authentication provider, theme provider,
CSS baseline, error boundary and global SCSS. They do not register a service worker.
The navigation middleware serves the same fixture entry on reloads of application
routes. API data is synthetic and never forwarded to another service.

Run from the repository root:

```powershell
$env:PLAYWRIGHT_BROWSER_CHANNEL = 'msedge'
node frontend/tests/premium-theme-browser.cjs
```

`PREMIUM_THEME_SCREENSHOT_DIR` selects the output directory. The default is
`docs/screenshots/premium-dark-mode`. Desktop (1440 × 900) and mobile (390 × 844)
get full-page captures, including repair/payment/delete, resale and platform
section dialogs. Laptop (1280 × 800), tablet (768 × 1024) and narrow mobile
(360 × 800) run the same route readiness, overflow, light-panel and JS-error checks.
Every viewport runs both light and dark themes. Results are saved in
`visual-matrix.json`. Use `PREMIUM_THEME_SCREENS` and `PREMIUM_THEME_VIEWPORTS`
(comma-separated names) for a targeted rerun. `PREMIUM_THEME_PORT` defaults to 5197.

The matrix opens financial and destructive dialogs without submitting them.
The fixture API rejects these writes with 405. Every non-local browser request
is aborted, including analytics, email, external logos and Turnstile assets.
Registration and recovery screens can be visually inspected without completing
security challenges.

## Reuse for provider tests

`premium-theme-fixtures.cjs` exports:

- `createFixtureState({ themePreference, role, platformRole, scenario })`.
- `installMockApi(context, state)` installs local fixtures and external-request blocking.
- `handleMockRequest({ url, method, headers, body }, state)` returns `{ status, body }`.
- `fixtures` exposes synthetic entities for additional assertions.

State contains users keyed by bearer token: `synthetic-owner`, `synthetic-other`,
`synthetic-admin`. The first account is `owner@example.test`; the second is
`other@example.test`. Each account has an independent theme preference.
`GET /auth/me`, `GET/PATCH /profile`, `PATCH /profile/theme` and `POST /auth/login`
operate on that account. Theme PATCH returns `{ themePreference }`.

Mutable failure controls: `themePatchStatus`, `themePatchDelayMs`, `authDelayMs`,
`pathErrors[path]` and `pathDelays[path]`. `requests`, `mutations` and `unhandled`
record traffic. The visual runner treats unhandled endpoints or any submitted
mutation as failures. Unknown paths return 404, never a production response.

`premium-theme-browser.cjs` exports `createFixtureServer(port, optionalState)`,
`openScreen`, `inspectLayout`, `capture`, `dialogCaptures`, `screens`, and `viewports`.
A state supplied to `createFixtureServer` installs the same API as local middleware;
without state, Playwright interception provides the API.

## Local demo

```powershell
node frontend/tests/premium-theme-demo.cjs
```

Open `http://127.0.0.1:5199/admin/configuracion#negocio`. Private routes seed a
synthetic owner automatically, without credentials. A demo-only CSP blocks external
services. Use the appearance switch to compare both themes. Appearance changes persist only in the running
process's synthetic state; financial/destructive writes are refused.
