# Seguridad 7 — sesiones, JWT y revocación

Base: ce62136157bdd34a3807c688055d5f1bdabfdafd. Sólo HTTP en loopback, PostgreSQL desechable, negocios/usuarios ficticios y navegador aislado con API simulada. Sin consultas de login ni modificaciones productivas.

## Hallazgos reproducibles y correcciones

| Evidencia RED | Corrección mínima | Cambio visible |
|---|---|---|
| Sesión firmada HS512 aceptada 200; el emisor usa HS256. Los verificadores generales no restringían algoritmo ni exigían exp/tokenVersion/estructura. | HS256 explícito al emitir/validar; schema para userId, businessId, tokenVersion entero no negativo, iat/exp y exp > iat. Autoridad sigue proviniendo de DB. | Los JWT emitidos legítimamente siguen válidos; JWT sintéticos sin vencimiento no. |
| Sesión anterior a desactivar TECHNICIAN vuelve a recibir 200 después de reactivarlo. Recuperación anterior también puede cambiar contraseña después de reactivar. | Al desactivar un usuario activo, incrementar tokenVersion e invalidar credenciales pendientes de recuperación/cambio dentro de la misma transacción de Equipo. | Reactivar requiere nuevo login; enlaces/códigos anteriores dejan de servir. |
| Capability password-change sin exp permite cambiar contraseña 200. | HS256 y schema de propósito, usuario, versión y duración máxima de 600 segundos. | Sólo autorizaciones temporales emitidas por el flujo legítimo. |
| Ocho códigos erróneos simultáneos dejan attempts=3; el código correcto sigue utilizable. | Incremento condicional atómico hasta cinco; cierre condicionado por contador; el consumo correcto también exige attempts < 5. | El límite de cinco intentos se cumple bajo concurrencia. |
| Falla temporal simulada de la consulta de identidad devuelve 401, que provoca logout del navegador. | Separar validación JWT (401) de disponibilidad de DB (503 genérico, sin detalles). | Mantener credencial y permitir reintento ante fallo temporal. |
| 401 tardío de una petición A borra el token B recién emitido. | Interceptor sólo retira la credencial si coincide con Authorization de la petición fallida; login público exceptuado. | Un nuevo login no se pierde por respuestas de una sesión vieja. |
| Otra pestaña cambia a B pero la primera mantiene identidad privada A; localStorage.clear tampoco retira su pantalla. | Sincronizar altas/cambios/borrados y clear usando el valor actual; invalidar generación de solicitudes; restaurar identidad y desmontar contenido al cambiar de usuario. | Pestañas coherentes, sin conservar componentes privados de otra cuenta. |
| 403 por usuario inactivo durante uso no retira pantalla privada. | Código USER_INACTIVE y retiro condicionado de la credencial actual; 403 de permiso ordinario no cierra sesión. | Usuario inactivo pierde pantalla privada; falta de permiso no expulsa sesiones legítimas. |

Los cambios de fixtures de tests existentes sólo incorporan expiresIn: 8h en sesiones sintéticas válidas, como el emisor real. Seguridad 6 cambia explícitamente sus expectativas de reactivación a 401 y agrega nuevo login/acceso 200. No se eliminan pruebas negativas ni se cambian expectativas para esconder fallos.

## Contratos auditados

- Login/registro: bcrypt, emisor HS256 con JWT_EXPIRES_IN (default 8h); registro fija OWNER/USER de negocio nuevo. Esquemas existentes y Turnstile/rate limiting conservados. La respuesta no expone passwordHash. Errores de credenciales genéricos.
- Sesión: firma, algoritmo, expiración, notBefore y claims validados antes de consultar DB. userId/businessId vinculados; rol/plataforma/permisos/tokenVersion/actividad se releen en cada petición. Claims falsificados no confieren autoridad. SUPER_ADMIN sólo alcance global en plataforma.
- Capacities: cualquier propiedad purpose impide uso como sesión ordinaria. Account deletion HS256, purpose exacto, userId/businessId/versión, TTL 600, método DELETE y router exclusivo; además OWNER USER activo, contraseña y confirmación exacta, último OWNER y revalidación transaccional. Purga invalida capacidad porque elimina usuario; no se exige tabla nueva para un token de operación irreversible de una sola cuenta.
- Recuperación: 32 bytes aleatorios, hash SHA256 en DB, 30 minutos por defecto; respuesta genérica; consumo transaccional condicionado, sólo usuario activo; un ganador concurrente; passwordHash y tokenVersion se actualizan juntos. Token raw no es JWT ni sirve como sesión. Reenvío invalida anteriores.
- Cambio de contraseña: código criptográfico de seis dígitos ligado a userId mediante hash, TTL 10m, cooldown y límites existentes; cinco intentos atómicos; código consumido una vez; capability 10m ligada a usuario/versión. Confirmación CAS de tokenVersion permite sólo un ganador; retiros anteriores/replay rechazados.
- Reset administrativo y baja lógica: incrementan tokenVersion; reset consume credenciales pendientes. Borrar empleado no libera su identidad histórica ni permite login. Desactivación ahora hace lo propio sin alterar la garantía transaccional del último OWNER.
- Cambios de rol/permisos: mismo JWT refleja autoridad DB actual en siguiente petición. No se introduce logout obligatorio por cada edición; concede/revoca según política de Seguridad 6. No sustituir esta garantía por confiar claims obsoletos.
- Bloqueo/desactivación/reactivación de negocio y suspensión/reactivación manual: acciones existentes incrementan versiones. Contraseña nueva no evita bloqueos. Vencimiento automático conserva OWNER únicamente en renovación (auth/me, billing, eliminación); TECH bloqueado; SUPER_ADMIN mantiene excepción existente. No cambiar esa política.
- logout-other-sessions: incrementa tokenVersion y revoca **todas** las sesiones, también la actual. Backend y UI ya requerían volver a login actual; corregida descripción de confirmación para decirlo claramente. No hay identificador de dispositivo y no se promete conservar una sesión.
- Logout ordinario: retiro local y sincronización entre pestañas; no hay endpoint de revocación de un dispositivo. Retirar token del navegador no invalida una copia externa hasta exp/version. Propuesta separada abajo, sin cambio silencioso de política.
- React: restauración 401/403 de auth/me retira sesión; red/5xx conserva credencial y muestra reintento sin página privada. 403 de permiso no cierra sesión. Generación y token evitan respuestas tardías de perfil/me/login después de logout o cambio de identidad. PWA no cachea API.
- JWT/capabilities/códigos/contraseñas no se agregan a logs. Mail fake exclusivamente en tests. Recuperación usa URL token en email por contrato existente; ese transporte y la persistencia del navegador se evalúan como riesgo residual, no se afirma exfiltración sin evidencia.

## Concurrencia y límites demostrados

Una barrera sobre la consulta real de identidad, después de leer su snapshot, permite revocar tokenVersion antes de continuar POST clients. La petición en vuelo todavía termina 201; la siguiente devuelve 401 y no cambia clientes/caja/usuarios. Ésta es una garantía de autorización por petición, no revocación de toda transacción ya empezada. No se oculta ni se promete resolverla mediante un cambio de middleware.

Para garantizar cancelación/revalidación de operaciones ya autorizadas haría falta política explícita y coordinación transaccional de cada escritura sensible con revocación (orden de locks, lecturas/versiones, rollback y respuesta). Se deja para aprobación separada. Código/contraseña usan CAS/consumo atómico propios; estos flujos sí demuestran un ganador concurrente.

## Pruebas y reproducción

- npm run test:session-security (backend): cluster loopback desechable, dos talleres y admin; firma/claims, tokens inválidos/expirados, propósitos, versiones, reactivación, roles/permisos, logout-all, códigos, recuperación, renovación, DB temporal y carrera en vuelo; snapshots verifican ausencia de efectos denegados.
- npm run test:session-security (frontend): Playwright declarado como dependencia dev; Vite local y módulos reales AuthContext/ProtectedRoute/Axios; sólo HTTP boundary simulado. Cubre red/500, retry, 401/403, token nuevo frente a 401 tardío, cambio de cuenta/clear/logout en pestañas y ausencia de página privada.
- npm run test:account-deletion (frontend): runner ahora inicia/termina Vite local y ejecuta la prueba real de React/MUI existente. Cuenta sintética; no DB.
- Regresiones PostgreSQL existentes con tests/helpers/role-permissions-postgres.mjs --regressions; account-deletion por separado --account-deletion; matrices Seguridad 5/6 y tests base/contratos/Origin Auth/client IP/OG/PWA, typecheck/build backend/frontend y CI.

## Riesgos / decisiones pendientes

- JWT en localStorage queda accesible al JavaScript del origen y, por tanto, a XSS. No se demostró XSS dentro de este alcance; cookies HttpOnly requerirían diseño CSRF/CORS/persistencia/infraestructura y aprobación. No realizar esa migración aquí.
- Logout local no revoca copias externas; logout-other revoca todo. Un sistema por dispositivo requiere estado/identificador y posiblemente migración; aprobación separada.
- Recuperación via query string puede permanecer en historial/logs del hosting del frontend y referrer según política del navegador. La ruta backend recibe el token en cuerpo, no URL. No se consultan logs privados ni se cambia contrato de email aquí; propuesta para aprobación: capturar token en memoria, limpiar URL y revisar política de referrer/hosting sin romper recarga y flujos.
- Revocación de operaciones en vuelo y concurrencia con administración de plataforma: límite documentado arriba; no garantía global de cancelación.
- Riesgo FK histórico de Seguridad 5 continúa pendiente; ninguna migración ni consulta a integridad productiva.
- npm audit del frontend informa cinco paquetes con severidad high (axios, react-router/dom, nanoid, source-map-js); versiones ya presentes en base, lock sólo agrega Playwright. Actualizarlos requiere revisión de dependencias aparte, no se ejecuta audit fix.

## Validación final y revisión

- PostgreSQL desechable: 90 comprobaciones de sesiones, 289 de roles/permisos, 355 de aislamiento y 63 de eliminación de cuenta; 24 suites de regresión y 13 adicionales aprobadas.
- Navegador aislado: 21 comprobaciones de sesiones (incluido estado privado capturado al montar) y 17 de eliminación de cuenta. Typecheck y build backend/frontend; contratos base y ocho suites frontend aprobados.
- Revisión independiente: sin Critical/Important; corregidos los dos Minor (textos de todas las sesiones y aserción de estado montado). Los límites arquitectónicos y exposición en hosting externo quedaron declined-to-judge/documentados, sin afirmación de seguridad absoluta.
- El runner adicional detectó dependencia del puerto fijo 3000 en dos pruebas existentes; ahora ambas levantan su app local en puerto efímero. Sin cambios de comportamiento productivo.
- En Windows se usó Edge instalado con PLAYWRIGHT_BROWSER_CHANNEL=msedge; CI instala Chromium. La primera ejecución sin navegador instalado falló antes de las pruebas y la repetición con Edge pasó.
