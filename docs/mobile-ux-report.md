# TecnoDesk — Mobile UX 2.0

Estado: PR #22 en borrador. Reproducción Linux confirmada y corrección de sincronización de la prueba preparada. La aprobación depende de los checks del último SHA en el PR; la matriz histórica no acredita por sí sola Linux.

Rama: `feature/mobile-ux-carousels`. Base: `origin/main` en `6aa00849b46d3916d05834e459404474d3d5fee3`, que ya incluye el tema oscuro del PR #21. Worktree aislado; los cambios de otros trabajos se conservaron.

## Pantallas y patrones

| Área | Cambio y motivo |
| --- | --- |
| Dashboard | Métricas y módulos en carruseles finitos. Gráficos por pestañas locales. Alertas completas con filas compactas. Tres movimientos recientes y acceso a toda Caja. |
| Caja | Orígenes y períodos en una fila desplazable. Métricas horizontales. Movimientos verticales con el orden, agrupación y paginación originales. |
| Reventa | Cuatro métricas horizontales y flujo compacto Compra → Reparación → Listo → Vendido. Listado, detalles, edición, venta y eliminación conservados. |
| Reparaciones y Clientes | Encabezados, filtros y fichas móviles compactos. Secciones existentes desplegables en el detalle de reparación, sin desmontar sus contenidos. Estado y pagos siguen accesibles. |
| Comercio | Métricas y categorías con desplazamiento nativo en móvil. Productos antes de categorías para acercar el buscador al inicio. Tabla de ventas como fichas verticales móviles. |
| Punto de venta | Carrito y total dentro de la cabecera de productos. Se conserva el drawer y su estado; sin barra flotante que cubra contenido. |
| Configuración | Navegación por hashes en una fila. Sólo se muestra la sección seleccionada en móvil; formularios y contraseñas siguen montados al navegar. Soporte es un panel hermano independiente. |
| Garantías y Equipo | Métricas horizontales y reclamos expandibles; fichas de empleados compactas y permisos agrupados en acordeones controlados. |
| Suscripción, Perfil y Super Admin | Resúmenes/planes horizontales donde aportan, espacios móviles menores y secciones de plataforma accesibles desde una fila. |
| Landing y rutas públicas | Auditoría visual; se conservan sus carruseles y la presentación de planes existente. |

`MobileCarousel` usa CSS Scroll Snap, gesto táctil nativo, siguiente tarjeta parcialmente visible, botones de 44 px, teclado (flechas, Home/End), posición actual y movimiento reducido. No tiene autoplay ni dependencias nuevas. Un listener pasivo y un ResizeObserver se limpian al desmontar; en escritorio no instala estos listeners. El espaciador final permite alcanzar la última tarjeta en tablet; al filtrar a una sola tarjeta no queda espacio vacío adicional.

Los patrones móviles se aplican por debajo de 900 px. Los listados importantes siguen verticales. Los formularios de Configuración mantienen el mismo nodo DOM, borrador y estado interno durante cambios de pestaña/hash y atrás/adelante.

## Seguridad y alcance

- Sin cambios de backend, servicios financieros, permisos, esquema Prisma ni migraciones.
- Sin acceso a Supabase real, escrituras productivas, merge o despliegues.
- Los importes, períodos, signos y distinción entre estimaciones y operaciones reales se conservan. Ingresos verdes, egresos rojos y ganancias/pérdidas según signo.
- La navegación visual de tarjetas y gráficos no solicita datos nuevos. Se conservan las restricciones de módulos, suscripción vencida y técnicos.
- El acceso rápido a nueva reparación conserva la validación de permiso y se movió del botón flotante al header móvil.
- Se incluye bloqueo de Preview exclusivamente para esta rama en `frontend/vercel.json`; su limpieza debe revisarse al integrar. No se cambió configuración remota de Vercel ni producción.

## Comparación de desplazamiento

<!-- METRICS_START -->
Mediciones a 360 × 800 px, tema claro, sobre el mismo registro ficticio. Posición y desplazamiento en píxeles; los encabezados visibles son una aproximación reproducible de las secciones anteriores, no una clasificación de información innecesaria.

| Ancla operativa | Posición anterior → nueva | Scroll mínimo para verla, anterior → nuevo | Encabezados anteriores al ancla |
| --- | --- | --- | --- |
| Dashboard · primer movimiento | 3085 → 1798 | 2365 → 1078 | 12 → 9 |
| Caja · primer movimiento | 897 → 636 | 177 → 0 | 2 → 2 |
| Reventa · primer equipo | 889 → 644 | 169 → 0 | 2 → 2 |
| Comercio · primer producto | 990 → 594 | 270 → 0 | 3 → 2 |
| Punto de venta · primer producto | 324 → 314 | 0 → 0 | 2 → 2 |
| Reparaciones · primer registro | 457 → 393 | 0 → 0 | 1 → 1 |
| Clientes · primer registro | 372 → 320 | 0 → 0 | 1 → 1 |
| Configuración · nombre comercial | 1177 → 787 | 457 → 67 | 4 → 4 |
| Garantías · primer registro | 456 → 375 | 0 → 0 | 1 → 1 |
| Equipo · primer empleado | 716 → 672 | 0 → 0 | 1 → 1 |

Dashboard reduce 1.287 px hasta el primer movimiento; Caja, 261 px; Reventa, 245 px; Comercio, 396 px; Configuración, 390 px hasta el campo del negocio. Las alertas conservan sus accesos. En las listas que ya entraban en el primer viewport, el beneficio es densidad y acceso, no un scroll inexistente.
<!-- METRICS_END -->

Los JSON distinguen la posición absoluta del registro, el desplazamiento necesario para verlo y la altura del documento. Los ejes SVG de gráficos no sirven para comparar dinero: se guardan por separado snapshots semánticos de las respuestas financieras. Tampoco se interpreta como cambio financiero el resumen intencional de tres movimientos del Dashboard.

## Verificaciones

Verificadas localmente:

- Backend: `npm run typecheck`, `npm run build`, `npm test`.
- PostgreSQL desechable local: `dashboard.ts`, `cash-groups.ts`, `cash-period.ts`, `cash-period-30d.ts`, `equipment-sales.ts`, `equipment-delete.ts`, `settings-team.ts` (24 casos). La cadena de migraciones se aplicó sólo al clúster temporal propiedad del harness.
- React con servicios simulados: equipos/detalles/eliminación, flujo/edición/eliminación de reparación, Caja agrupada, métricas de Super Admin, renovación, encoding, PWA (46/46) y preparación de dominio.
- Carrusel: 360/390/430/768 px, teclado, flechas, indicadores, gesto horizontal/vertical, acción hija, filtrado a una tarjeta, ausencia de autoplay, modo oscuro y vuelta a desktop.
- Configuración: diez combinaciones de cinco anchos × dos temas; borradores de negocio/contraseña, identidad DOM, hashes, historial, tamaños táctiles, ausencia de consultas extra, overflow y barra sin solapamiento.
- Logo y colores financieros: 84 casos desktop/390/360, ambos temas, resultados positivos/negativos/cero y contraste; icono original intacto.

<!-- MATRIX_START -->
- Matriz histórica y repetición local tras la corrección (Chrome/Windows): **900/900**, 450 antes + 450 después, 45 rutas/escenarios/hashes × cinco anchos × dos temas. Sin overflow inesperado, errores de aplicación, peticiones externas ni escrituras.
- Paridad de peticiones iniciales: **450/450 pares** con los mismos métodos y rutas. Las interacciones de carrusel y pestañas verifican ausencia de consultas adicionales.
- Valores financieros semánticos: **70/70 pares** con snapshots disponibles, sin diferencias.
- Workflows: 40 casos sobre carrito/pagos locales, permisos, reclamos, secciones de reparación y menú de categorías; resultados individuales en el enlace inferior. Se volvió a verificar POS después del ajuste de cabecera.
- Revisión humana de capturas: Dashboard, Caja, Reventa, Configuración, Suscripción, Punto de venta y escritorio. Se corrigieron los problemas encontrados antes de consolidar la matriz.
<!-- MATRIX_END -->

La revisión visual detectó y corrigió la expansión intrínseca de los grids de Dashboard/Suscripción al alojar carruseles y el offset de 96 px heredado por la barra de Configuración. Se repiten las pantallas afectadas después de cada corrección.

## Evidencia

- [Matriz de rutas, peticiones y medidas](screenshots/mobile-ux/matrix.json).
- [Comparaciones](screenshots/mobile-ux/measurements.json).
- [SHA y hashes del bundle anterior](screenshots/mobile-ux/baseline.json).
- [Colores financieros y logo](screenshots/mobile-ux/financial-checks/results.json).
- [Workflows completos](screenshots/mobile-ux/workflows/results.json) y [POS tras el ajuste de cabecera](screenshots/mobile-ux/workflows/focused-results.json).

| Pantalla, 360 px | Antes | Después |
| --- | --- | --- |
| Dashboard claro | [Captura](screenshots/mobile-ux/before-light-360-dashboard.png) | [Captura](screenshots/mobile-ux/after-light-360-dashboard.png) |
| Caja clara | [Captura](screenshots/mobile-ux/before-light-360-cash.png) | [Captura](screenshots/mobile-ux/after-light-360-cash.png) |
| Reventa oscura | [Captura](screenshots/mobile-ux/before-dark-360-equipment.png) | [Captura](screenshots/mobile-ux/after-dark-360-equipment.png) |
| Configuración oscura | [Captura](screenshots/mobile-ux/before-dark-360-settings.png) | [Captura](screenshots/mobile-ux/after-dark-360-settings.png) |
| Punto de venta claro, 390 px | [Captura](screenshots/mobile-ux/before-light-390-pos.png) | [Captura](screenshots/mobile-ux/after-light-390-pos.png) |

Se conservan 24 PNG representativos: Dashboard/Caja/Reventa/Configuración a 360 px en ambos temas, Comercio/POS a 390 px claro y Dashboard desktop a 1440 px en ambos temas, siempre antes/después. Los 641 PNG restantes se preservaron localmente en artifacts/mobile-ux/original-captures/, fuera de Git. Las nuevas capturas de rutas, diálogos, fallos y diagnósticos se generan en artifacts/mobile-ux/ y se publican como artefacto mobile-browser-<run_id> de GitHub Actions durante 14 días.

## Demo local

`http://127.0.0.1:5173/admin`

La revisión local usa Vite, API en 127.0.0.1:3001 y PostgreSQL en 127.0.0.1:55449, con datos ficticios y sin acceso a producción. El lanzador temporal está fuera de los archivos versionados y mantiene la sesión local abierta. Para cambiar de tema: Mi negocio → Apariencia.

La alternativa sintética reproducible sigue disponible desde frontend con `npm run demo:mobile-ux`; utiliza otra URL y no requiere base de datos.

## Corrección del gesto vertical en CI

Reproducción real: Ubuntu 24.04.5, Node 22 y Chromium de Playwright 1.62.1, [ejecución de diagnóstico](https://github.com/marcosgradac/AdmTecnicoCelulares/actions/runs/38830684855/job/116748515749), SHA b51978f. Las ocho combinaciones afectadas fallaron con la aserción original y sin cambios de producto. [Evidencia resumida](screenshots/mobile-ux/linux-touch-reproduction.json).

En los ocho casos el punto estaba dentro del carrusel, pero scrollLeft todavía avanzaba hacia 996 px durante el gesto vertical (por ejemplo 921 → 996). El segundo toque frenaba la inercia del primero; no era una prueba independiente de desplazamiento vertical. Un control con el bundle de producto original, cambiando sólo la espera por reposo horizontal real, aprobó 8/8 en Windows.

Corrección: esperar posición de snap y estabilidad de scrollLeft durante 160 ms, recalcular el punto y comprobar hit testing antes de cada gesto. Se conservan las aserciones de desplazamiento horizontal y vertical y se espera el reposo de página. No se modificó MobileCarousel ni los contenedores. La regresión Linux repite las cuatro rutas en ambos temas tres veces (24 casos), y exige que ninguna omita el scroll vertical a 768 px.

Los resultados nuevos se guardan fuera de Git y se adjuntan incluso cuando falla CI. La matriz histórica del primer commit se conserva identificada como evidencia de Windows; no sustituye los resultados de esta corrección.

## Límites de la verificación

Chrome/Chromium real con anchos y gestos táctiles emulados; no se probó un dispositivo físico ni Safari/iOS. La demostración usa colecciones acotadas y no constituye un benchmark de catálogos masivos. El build mantiene el aviso de chunks superiores a 500 kB; no se añadieron librerías de carrusel. Las pruebas no demuestran el estado de datos productivos y no los consultan.

<!-- FILES_START -->
## Archivos modificados

- `.github/workflows/ci.yml`
- `docs/mobile-ux-report.md`
- `docs/superpowers/plans/2026-10-13-mobile-ux-carousels.md`
- `frontend/package.json`
- `frontend/src/components/commerce/CategoryCard.tsx`
- `frontend/src/components/commerce/CommerceCategoryCarousel.tsx`
- `frontend/src/components/commerce/CommerceMetricsRow.tsx`
- `frontend/src/components/commerce/CommercePointOfSale.tsx`
- `frontend/src/components/commerce/CommerceProductsSection.tsx`
- `frontend/src/components/commerce/CommerceSalesTable.tsx`
- `frontend/src/components/common/MobileCarousel.tsx`
- `frontend/src/components/common/PageHeader.tsx`
- `frontend/src/components/dashboard/MobileChartTabs.tsx`
- `frontend/src/components/dashboard/OverviewSections.tsx`
- `frontend/src/components/layout/AppShell.module.scss`
- `frontend/src/components/layout/AppShell.tsx`
- `frontend/src/components/records/RecordDetailSection.tsx`
- `frontend/src/components/records/recordResponsiveStyles.ts`
- `frontend/src/features/billing/PlanCards.tsx`
- `frontend/src/features/billing/SubscriptionPage.tsx`
- `frontend/src/features/billing/billing.scss`
- `frontend/src/features/equipmentSales/EquipmentSalesPage.tsx`
- `frontend/src/features/platformAdmin/PlatformAdminPage.tsx`
- `frontend/src/features/platformAdmin/platform-admin.scss`
- `frontend/src/features/platformAdmin/sections/DashboardSection.tsx`
- `frontend/src/features/settings/SettingsPage.tsx`
- `frontend/src/features/settings/SettingsSection.tsx`
- `frontend/src/features/settings/settings.scss`
- `frontend/src/features/warranties/WarrantiesPage.tsx`
- `frontend/src/features/warranties/WarrantyClaimDetails.tsx`
- `frontend/src/pages/CashPage.tsx`
- `frontend/src/pages/ClientDetailPage.tsx`
- `frontend/src/pages/ClientsPage.tsx`
- `frontend/src/pages/CommercePageV2.tsx`
- `frontend/src/pages/ProfilePage.tsx`
- `frontend/src/pages/RepairDetailPage.tsx`
- `frontend/src/pages/RepairsPage.tsx`
- `frontend/src/pages/TeamPage.tsx`
- `frontend/src/pages/dashboard/DashboardPage.tsx`
- `frontend/tests/mobile-native-touch.cjs`
- `frontend/tests/mobile-native-touch-regression.cjs`
- `frontend/tests/mobile-touch-diagnostics.cjs`
- `frontend/tests/premium-final-visual.cjs`
- `frontend/tests/mobile-carousel.cjs`
- `frontend/tests/mobile-carousel.fixture.html`
- `frontend/tests/mobile-carousel.fixture.tsx`
- `frontend/tests/mobile-settings.cjs`
- `frontend/tests/mobile-ux-browser.cjs`
- `frontend/tests/mobile-ux-demo.cjs`
- `frontend/tests/mobile-ux-server.cjs`
- `frontend/tests/mobile-workflows.cjs`
- `frontend/tests/premium-theme-fixtures.cjs`
- `frontend/tests/repair-edit.cjs`
- `frontend/tests/repair-flow.cjs`
- `frontend/vercel.json`

La selección histórica de 24 PNG está en `docs/screenshots/mobile-ux/`. Las ejecuciones nuevas escriben `artifacts/mobile-ux/` y CI las adjunta durante 14 días. No se modificaron las capturas de PR anteriores.
<!-- FILES_END -->
