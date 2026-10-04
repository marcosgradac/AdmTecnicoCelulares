// Pruebas del MODO RENOVACIÓN (suscripción vencida) del frontend de TecnoDesk.
//
// No se agrega ningún framework: el repo no tiene Jest/Vitest/Playwright propio, así que
// estas pruebas son estáticas sobre los archivos reales que gobiernan la navegación. Verifican
// que la pantalla de renovación exista y que el resto de la app no ofrezca accesos que el
// backend va a rechazar con 403.
//
// Uso: npm run test:expired-owner-renewal-ui
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const SRC = path.resolve(__dirname, '../src')
const read = relative => fs.readFileSync(path.join(SRC, relative), 'utf8')

const appShell = read('components/layout/AppShell.tsx')
const subscriptionContext = read('features/billing/SubscriptionContext.tsx')
const subscriptionPage = read('features/billing/SubscriptionPage.tsx')
const billingApi = read('features/billing/billing.api.ts')
const adminPayments = read('features/platformAdmin/sections/PaymentsSection.tsx')
const adminDashboard = read('features/platformAdmin/sections/DashboardSection.tsx')

let passed = 0
const check = label => console.log(`OK ${++passed}: ${label}`)

const main = () => {
  // El modo renovación se decide con el rol OWNER y el estado real de acceso, no por heurísticas.
  assert.ok(
    /user\?\.role === 'OWNER' && subscription\?\.access\.status === 'BLOCKED'/.test(subscriptionContext),
    'SubscriptionContext define renewalMode con role OWNER y access.status BLOCKED'
  )
  check('OWNER BLOCKED activa el modo renovación según el estado de acceso del backend')

  // Mientras se consulta la suscripción no se dibuja el sistema normal.
  assert.ok(/subscriptionLoading/.test(appShell), 'AppShell espera la suscripción antes de renderizar')
  assert.ok(/<CircularProgress/.test(appShell), 'AppShell muestra un estado de carga explícito')
  check('no se muestra brevemente el dashboard mientras se consulta la suscripción')

  // Cualquier ruta privada manda a /admin/suscripcion y sólo esa ruta escapa de la redirección.
  assert.ok(/RENEWAL_PATH = '\/admin\/suscripcion'/.test(appShell), 'la ruta de renovación es /admin/suscripcion')
  assert.ok(
    /renewalMode && location\.pathname !== RENEWAL_PATH\) return <Navigate to=\{RENEWAL_PATH\} replace \/>/.test(appShell),
    'AppShell redirige a la renovación con replace'
  )
  check('cualquier ruta del OWNER vencido cae en /admin/suscripcion sin loop')

  // Menú restringido: sólo Suscripción, y nada de atajos que el backend vaya a rechazar.
  assert.ok(/navItems\.filter\(item => item\.path === RENEWAL_PATH\)/.test(appShell), 'el menú de renovación deja sólo Suscripción')
  const renewalBranch = appShell.slice(appShell.indexOf('renewalMode\n'), appShell.indexOf('const drawer'))
  const blockedLinks = ['/admin/punto-de-venta', '/admin/reparaciones', '/admin/clientes', '/admin/comercio', '/admin/venta-equipos', '/admin/caja', '/admin/empleados', '/admin/garantias', '/admin/configuracion']
  for (const link of blockedLinks) assert.ok(!renewalBranch.includes(`path === '${link}'`), `${link} no debe aparecer en modo renovación`)
  assert.ok(/!renewalMode && <Box className=\{styles\.businessAccess\}/.test(appShell), 'el acceso a Mi negocio se oculta en modo renovación')
  assert.ok(/!renewalMode && mobile && canAccess\(user, 'repairs\.create'\)/.test(appShell), 'el botón de nueva reparación se oculta en modo renovación')
  check('menú de renovación sin accesos que devolverían 403')

  // Pantalla de suscripción vencida: aviso claro, datos de transferencia y eliminación de cuenta.
  assert.ok(/Tu suscripción venció/.test(subscriptionPage), 'se avisa que la suscripción venció')
  assert.ok(/renová tu plan\. Tus datos siguen guardados/.test(subscriptionPage), 'se explica que los datos siguen guardados')
  for (const field of ['Alias', 'CBU/CVU', 'CUIT', 'Titular', 'Banco']) {
    assert.ok(subscriptionPage.includes(`'${field}'`), `se muestran los datos de transferencia: ${field}`)
  }
  assert.ok(/Copiar/.test(subscriptionPage), 'siguen los botones de copiar alias y CBU')
  assert.ok(/renewalBlocked && <AccountDeletionSection \/>/.test(subscriptionPage), 'la eliminación de cuenta sigue disponible al final')
  check('la pantalla de renovación conserva datos bancarios y eliminación de cuenta')

  // Con un pago pendiente no se puede volver a informar otro.
  assert.ok(/pendingPayment\?/.test(subscriptionPage), 'el botón de transferir se reemplaza cuando hay pago pendiente')
  assert.ok(/Pago pendiente de verificación/.test(subscriptionPage), 'se informa que el pago está pendiente de verificación')
  assert.ok(/después de que confirmemos la acreditación/.test(subscriptionPage), 'no se promete acreditación automática')
  assert.ok(/PAYMENT_ALREADY_PENDING/.test(subscriptionPage), 'el 409 del backend se muestra al cliente')
  check('con pago pendiente se muestra el estado en vez de permitir otro envío')

  // El motivo de rechazo se muestra sin exponer datos administrativos.
  assert.ok(/payment\.rejectionReason/.test(subscriptionPage), 'el motivo de rechazo se muestra en el historial')
  assert.ok(!/reviewedByUserId|reviewedAt/.test(subscriptionPage), 'no se expone información interna de revisión')
  check('el historial muestra el motivo de rechazo')

  // La API de billing es la única usada para el flujo; no hay un segundo sistema de pagos.
  for (const endpoint of ['/billing/subscription', '/billing/plans', '/billing/payments', '/billing/transfer-details']) {
    assert.ok(billingApi.includes(endpoint), `billing.api usa ${endpoint}`)
  }
  assert.ok(!/mercadopago|stripe|webhook/i.test(subscriptionPage + billingApi), 'no hay integración de pago automático')
  check('el flujo usa los endpoints de Billing existentes')

  // El Super Admin ve y resuelve el pago pendiente con las acciones existentes.
  assert.ok(/'Pagos pendientes'/.test(adminDashboard), 'el dashboard muestra el contador de pagos pendientes')
  for (const column of ['Negocio', 'Plan', 'Monto esperado', 'Monto informado', 'Fecha', 'Estado']) {
    assert.ok(adminPayments.includes(column), `la tabla de pagos muestra ${column}`)
  }
  assert.ok(/Aprobar/.test(adminPayments) && /Rechazar/.test(adminPayments), 'hay acciones de aprobar y rechazar')
  check('el Super Admin ve el pago pendiente y puede aprobarlo o rechazarlo')

  console.log(`EXPIRED OWNER RENEWAL UI TESTS PASSED: ${passed}`)
}

main()