# Mobile UX browser evidence

Run `node frontend/tests/mobile-ux-browser.cjs` from the repository root. It serves the immutable baseline at 5290 and a fresh isolated AFTER test build at 5330. API data is synthetic and all nonlocal requests are aborted.

Optional environment variables: `MOBILE_UX_PHASES=before` or `after`, `MOBILE_UX_VIEWPORTS=360,390,430,768,1440`, `MOBILE_UX_SCREENS=dashboard,cash,settings`, `PLAYWRIGHT_BROWSER_CHANNEL=chrome`. Phase-specific runs preserve the other phase's matrix records. Missing baseline output skips baseline captures explicitly; comparisons remain null rather than fabricating evidence. A full comparison requires the prepared immutable baseline bundle.

`matrix.json` contains layout, requests, runtime failures, block offsets and screenshot paths. `measurements.json` pairs identical route/theme/viewport records. Negative documentTop delta indicates less scrolling. Anchor names are recorded because a missing or changed anchor cannot support a valid numerical comparison. Financial text equality checks extracted formatted amounts, including mounted carousel cards.

Captures cover both themes at 360, 390 and 1440. 430 and 768 run the same route and overflow audit. Financial writes are refused. Dialogs are opened without submission.

The optional local demo is `node frontend/tests/mobile-ux-demo.cjs`, port 5299. It seeds a synthetic owner automatically. Appearance controls are in Configuración → Mi negocio. Restarting resets fixture memory. No production API is reachable.
