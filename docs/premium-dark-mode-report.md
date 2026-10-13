# TecnoDesk — Tema oscuro premium personal

Rama: `feature/premium-dark-mode`. Base verificada: `6ad815278ba7902d7fbecdae5765e952fa84d5de`. Trabajo aislado; checkouts y modificaciones anteriores conservados. Publicación pendiente de revisión del propietario.

## Resultado y arquitectura

Apariencia es una tarjeta independiente en Configuración → Mi negocio, con switch accesible, estado claro/oscuro e icono. El cambio es inmediato y se guarda por usuario; no guarda ni altera el formulario del negocio.

`AppThemeProvider` está dentro de `AuthProvider`. Combina LIGHT/DARK/SYSTEM con la preferencia del sistema, crea el tema MUI por modo y aplica tokens CSS compartidos a admin, gráficos, formularios, menús, diálogos, pantallas públicas y Super Admin. Los temas anidados conservan el modo. Los valores originales son los fallbacks del tema claro. No se invierten logos, fotos ni capturas comerciales. Ingresos y ganancias positivas son verdes; egresos y pérdidas, rojos.

`theme-init.js` aplica la preferencia antes de React utilizando una caché ligada a la sesión; el servidor sigue siendo la autoridad. Hay rollback y aviso si falla el guardado, escucha de SYSTEM y sincronización entre pestañas. Identidad y revisión de sesión impiden que respuestas tardías afecten otra cuenta, incluso al volver a entrar con el mismo token. Lecturas antiguas de /auth/me no sobrescriben una preferencia recién confirmada.

PATCH /api/profile/theme acepta exclusivamente {themePreference: LIGHT|DARK|SYSTEM}. Requiere autenticación y limitador de escrituras existente; actualiza solo el usuario autenticado en su businessId. La preferencia se incluye en login, /auth/me y perfil. Ningún permiso operativo ni cálculo financiero fue modificado.

## Verificación local

- Backend: typecheck, build y suite base aprobados; nuevo test:profile-theme aprobado con PostgreSQL local desechable, validación estricta, autenticación, pertenencia, usuarios independientes, persistencia, fallback SYSTEM y 429 real.
- Aislamiento: 355 peticiones HTTP aprobadas. Permisos: 289 peticiones HTTP aprobadas.
- Frontend: typecheck y build aprobados; métricas Super Admin y renovación (11 casos) aprobadas; Caja, flujo/edición/borrado de reparaciones, reventa/listado/detalle/borrado, encoding y marcas aprobados.
- PWA: 46/46. Preparación de dominio API: aprobada offline.
- Navegador de preferencias: aprobado con React y API ficticia; cambio inmediato, recarga/relogin, usuarios independientes, SYSTEM, rollback 500, temas MUI anidados, dos pestañas y carreras de sesión/lecturas/escrituras.
- Seguridad de sesión frontend: 21 comprobaciones UI, 0 grupos fallidos. Browser hardening: 9 grupos aprobados. CSP compilada: aprobada con fixtures aislados, incluyendo MUI/Emotion, API y service worker.
- Matriz visual: **374 casos aprobados**, 33 pantallas × 5 resoluciones × 2 temas más 44 diálogos/secciones. Resoluciones: 1440×900, 1280×800, 768×1024, 390×844 y 360×800. Sin desbordamiento horizontal, paneles claros indebidos en oscuro, errores JS ni mutaciones operativas.
- **176 capturas PNG** claras/oscuras desktop/mobile en [screenshots/premium-dark-mode](screenshots/premium-dark-mode). [Resultados estructurados](screenshots/premium-dark-mode/visual-matrix.json). Capturas abiertas e inspeccionadas visualmente, incluyendo formularios, estados de error y diálogos.
- Contraste representativo de paleta oscura: texto principal 14.80:1, secundario 8.32:1, violeta 5.95:1, azul 7.84:1, verde 10.15:1, rojo 7.45:1; cumplen AA en las combinaciones medidas. Focus y movimiento reducido cubiertos. Cambio portrait/landscape adicional aprobado en ambos modos sin overflow.

## Defectos corregidos durante la revisión

Dos aserciones de estilos literales (Caja y chip Trial del Super Admin) se actualizaron a tokens con los fallbacks originales tras reproducir el fallo de CI; las comprobaciones financieras y de estados permanecen intactas. Controles de período negros en oscuro; importes del dashboard sin semántica verde/roja; panel de error blanco; cabeceras ocultas de Comercio con width:1 interpretado como 100% y causando overflow; bordes de estados que concatenaban transparencia hexadecimal con variables CSS; temas anidados que anulaban el modo; respuestas tardías de preferencias y lecturas de sesión; cobertura del error boundary exterior al mover AuthProvider.

## Demo para revisión

`node frontend/tests/premium-theme-demo.cjs` mantiene Vite y API simulada local en [http://127.0.0.1:5199/admin/configuracion#negocio](http://127.0.0.1:5199/admin/configuracion#negocio). Chrome abierto. Entrada automática como usuario ficticio; sin credenciales. Usar el switch Apariencia para comparar modos. Estado únicamente en memoria; escrituras financieras/destructivas rechazadas. CSP exclusiva de la demo bloquea servicios externos. Verificados teclado, claro/oscuro y persistencia al recargar. Servidor dejado ejecutándose.

## Migraciones, límites y publicación futura

**Sin migraciones ni cambios de esquema**: themePreference ya existe en main con default SYSTEM. No se modificaron producción, Supabase, credenciales ni archivos .env. No merge ni despliegue. Protección de previews limitada a esta rama en vercel.json; deberá retirarse esa regla específica al preparar la integración final.

Para publicar posteriormente: coordinar backend con el endpoint y frontend con theme-init.js y archivos compilados. No requiere migración. El build conserva la advertencia existente de chunks mayores de 500 kB. Los contrastes documentados son mediciones representativas y no una certificación integral WCAG. Las pruebas públicas no completan desafíos reales de Turnstile; se bloquean recursos externos y se usan fixtures de seguridad. Las imágenes incrustadas de productos/landing conservan su aspecto original. Revisión y aprobación visual del propietario pendientes.

## Archivos modificados

- .github/workflows/ci.yml
- backend/package.json
- backend/src/modules/auth/auth.routes.ts
- backend/tests/fixtures/route-registration.json
- frontend/index.html
- frontend/package.json
- frontend/src/auth/AuthContext.tsx
- frontend/src/components/admin/AdminPatterns.tsx
- frontend/src/components/admin/AdminVisualScope.tsx
- frontend/src/components/admin/CashMovementList.tsx
- frontend/src/components/auth/auth-layout.scss
- frontend/src/components/charts/IncomeExpenseChart.tsx
- frontend/src/components/commerce/CategoryCard.tsx
- frontend/src/components/commerce/CircularCategoryCarousel.tsx
- frontend/src/components/commerce/CommerceMetricsRow.tsx
- frontend/src/components/commerce/CommercePointOfSale.tsx
- frontend/src/components/commerce/CommerceProductsTable.tsx
- frontend/src/components/commerce/CommerceSalesTable.tsx
- frontend/src/components/commerce/categoryIcons.tsx
- frontend/src/components/common/AppErrorBoundary.tsx
- frontend/src/components/common/DeviceBrandAvatar.tsx
- frontend/src/components/common/FormDrawer.tsx
- frontend/src/components/common/StatCard.tsx
- frontend/src/components/common/StatusChip.tsx
- frontend/src/components/common/UiState.tsx
- frontend/src/components/dashboard/OverviewCharts.tsx
- frontend/src/components/dashboard/OverviewSections.tsx
- frontend/src/components/layout/AppShell.module.scss
- frontend/src/components/repairs/RepairStatusChip.tsx
- frontend/src/config/repairStatus.ts
- frontend/src/config/workflowRepairStatus.tsx
- frontend/src/features/billing/SubscriptionPage.tsx
- frontend/src/features/billing/billing.scss
- frontend/src/features/equipmentSales/EquipmentDialogs.tsx
- frontend/src/features/equipmentSales/EquipmentSalesPage.tsx
- frontend/src/features/landing/components/redesign/redesign.scss
- frontend/src/features/legal/terms-page.scss
- frontend/src/features/onboarding/styles/onboarding.module.scss
- frontend/src/features/platformAdmin/BusinessDetailDialog.tsx
- frontend/src/features/platformAdmin/platform-admin.scss
- frontend/src/features/platformAdmin/platformAdmin.shared.tsx
- frontend/src/features/platformAdmin/sections/DashboardSection.tsx
- frontend/src/features/settings/SettingsPage.tsx
- frontend/src/features/settings/settings.scss
- frontend/src/features/settings/support.scss
- frontend/src/features/warranties/WarrantiesPage.tsx
- frontend/src/main.tsx
- frontend/src/pages/ClientsPage.tsx
- frontend/src/pages/RepairDetailPage.tsx
- frontend/src/pages/RepairsPage.tsx
- frontend/src/pages/TeamPage.tsx
- frontend/src/pages/TrackingPage.tsx
- frontend/src/pages/dashboard/DashboardPage.tsx
- frontend/src/pages/dashboard/dashboard.scss
- frontend/src/services/auth.ts
- frontend/src/styles/global.scss
- frontend/src/theme/theme.ts
- frontend/src/theme/tokens.ts
- frontend/vercel.json
- backend/tests/profile-theme.ts
- docs/superpowers/plans/2026-10-13-premium-dark-mode.md
- frontend/public/theme-init.js
- frontend/src/features/settings/AppearanceCard.tsx
- frontend/src/pages/tracking-page.scss
- frontend/src/theme/AppThemeProvider.tsx
- frontend/tests/premium-theme-browser.cjs
- frontend/tests/premium-theme-browser.html
- frontend/tests/premium-theme-browser.tsx
- frontend/tests/premium-theme-demo.cjs
- frontend/tests/premium-theme-fixtures.cjs
- frontend/tests/premium-theme-readme.md
- frontend/tests/theme-preference.cjs
- frontend/tests/theme-preference.fixture.html
- frontend/tests/theme-preference.fixture.tsx
- frontend/tests/cash-groups.cjs
- frontend/tests/platform-admin-metrics.cjs
- docs/premium-dark-mode-report.md
- docs/screenshots/premium-dark-mode/: 176 PNG y visual-matrix.json.
