# Seguridad 7: sesiones, JWT y revocación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** demostrar y corregir fallos de sesiones sin rediseñar autenticación.
**Architecture:** HTTP real contra PostgreSQL local desechable; navegador aislado con API simulada para carreras de React. Primero RED, luego correcciones mínimas y regresiones completas.
**Tech Stack:** Express, Prisma, jsonwebtoken, React, Axios, Playwright.
**Spec:** attachment 2906b603-79f5-4291-a979-60909685bb47/Texto pegado.txt.

## Global Constraints
- Base ce62136157bdd34a3807c688055d5f1bdabfdafd, rama codex/security-7-session-revocation; un PR borrador, sin merge ni despliegue.
- Sólo datos ficticios, sin llamadas de login ni modificaciones productivas; conservar docs/security/ preexistente.
- Sin migraciones, cookies nuevas, tablas de sesiones, cambios de infraestructura, secretos, rate limiting, aislamiento ni permisos.

## Review Focus
- Tokens correctamente firmados con claims ausentes o algoritmo distinto al emisor.
- Revivir sesiones/capabilities al reactivar empleado; no confundir permisos efectivos con invalidación total.
- Respuesta tardía de una sesión vieja frente a login/logout o cambio de cuenta en otra pestaña.
- Error temporal de DB/red frente a rechazo efectivo: conservar credencial sin revelar pantalla privada durante restauración.
- Consumo y límite de intentos concurrentes; distinguir solicitud ya autorizada de solicitud posterior a revocación.

### Task 1: evidencia y límites
**Files:** backend/tests/session-security-complete.ts, backend/tests/helpers/role-permissions-postgres.mjs, frontend/tests/session-security.cjs, docs/security-7-audit.md.
- [x] Trazar emisión, validadores, tokens especiales, emails, revocación, bloqueo y frontend; registrar política existente.
- [x] Probar firma/claims/expiración, dos negocios y admin, roles, reactivación, contraseña, propósitos, concurrencia y renovación con snapshots.
- [x] Reproducir restauración, 401/403/500/red, otras pestañas y respuestas tardías en React.

### Task 2: mínimos cambios confirmados
**Files:** middleware auth, team.service, password-change/reset y AuthContext/api/SettingsPage sólo si las pruebas demuestran fallos.
- [x] Ejecutar RED→GREEN individual; mantener HS256 emitido y sesiones legítimas, documentar incompatibilidades necesarias.
- [x] No prometer revocación de operaciones en vuelo; documentar propuesta para aprobación separada.
- [x] Revisión independiente de toda la rama y controles positivos.

### Task 3: entrega única
**Files:** scripts npm, CI, informe.
- [x] Tests base/regresiones 4–6, eliminación cuenta, contraseña/recuperación/renovación, frontend, typecheck/build.
- [ ] Commit y publicación de un PR borrador; verificar ambos CI del SHA final.

## Ledger / rulings
- Ejecución continua nativa solicitada por el propietario; no pausa de aprobación de plan. Revisión independiente final conforme a la skill.
- La rama nueva aísla cambios en este checkout; no se modifican archivos preexistentes docs/security/.
- Candidatos confirmados con RED→GREEN y recogidos en el informe: HS384/512 o JWT sin exp aceptados; sesión previa revive tras reactivar; error DB convertido en 401; 401 tardío borra token nuevo; cambio de token en otra pestaña no actualiza identidad; intentos de código no atómicos.
