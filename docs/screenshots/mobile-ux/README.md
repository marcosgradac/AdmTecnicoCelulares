# Evidencia de Mobile UX

Se conservan 24 PNG representativos antes/después. Las medidas y matrices originales corresponden al SHA 4df0567 en Chrome/Windows; no acreditan el gesto vertical en Linux.

Ejecutar `npm run test:mobile-ux` desde frontend. Las nuevas capturas y resultados van a `artifacts/mobile-ux/`, ignorado por Git. Se mantienen MOBILE_UX_PHASES, MOBILE_UX_VIEWPORTS y MOBILE_UX_SCREENS. Sin filtros se verifican cinco anchos y ambos temas. El baseline anterior requiere el bundle inmutable preparado; si falta se informa y no se inventan comparaciones.

GitHub Actions adjunta `mobile-browser-<run_id>` durante 14 días, incluso si falla una prueba. Incluye capturas de 768 px y evidencias de fallos. Las pruebas usan API sintética y bloquean peticiones externas.

Los PNG retirados siguen preservados localmente en `artifacts/mobile-ux/original-captures/`. La demo real local usa http://127.0.0.1:5173/admin con API y PostgreSQL locales.
