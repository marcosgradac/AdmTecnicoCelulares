# Seguridad 6: roles y permisos

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** demostrar autorización efectiva y corregir únicamente fallos reproducibles.
**Architecture:** matriz derivada de routers y servicios; HTTP contra PostgreSQL local desechable. Comparación de estado antes/después de rechazos; ninguna llamada productiva.
**Tech Stack:** Express, Prisma, PostgreSQL, TypeScript, JWT y assertions Node.
**Spec:** consigna del propietario en attachment 1a2ef980-8c49-440f-8162-3bab59bbdb5e/Texto pegado.txt.

## Global Constraints
- Base b6b595d7ef77a153d1b260c828bc471b8922f0d5; único PR en borrador; no merge/deploy.
- No infraestructura, secretos, datos reales, frontend, migraciones ni cambios de política sin justificación.
- Preservar Origin Auth, CORS, Turnstile, rate limits, aislamiento y riesgo FK de Seguridad 5.

## Review Focus
- Permisos cambiados entre autenticación y transacción: alcance de revocación de operaciones en vuelo.
- Campos financieros anidados y errores: comprobar proyecciones explícitas.
- Autorizaciones OWNER con todos los permisos frente a TECHNICIAN con todos los permisos.
- Tokens anteriores a cambios y capabilities no válidas como sesión.
- Dos OWNER que se despromueven simultáneamente: conservar uno activo.

### Task 1: matriz y evidencia HTTP
**Files:** docs/security-6-audit.md, backend/tests/role-permissions-complete.ts, backend/tests/helpers/role-permissions-postgres.mjs.
- [x] Inventariar todos los guards, proyecciones y excepciones; contrastar frontend de sólo lectura.
- [x] Crear fixtures A/B/admin, permisos completos/parciales/nulos, bloqueos y tokens manipulados.
- [x] Ejecutar evidencia antes de corregir; reproducir candidatos con snapshots y concurrencia.

### Task 2: correcciones mínimas y validación
**Files:** sólo límites HTTP/servicios que fallen, backend/package.json y .github/workflows/ci.yml.
- [x] Corregir fallos confirmados sin alterar operaciones legítimas; ejecutar RED→GREEN.
- [x] Tests relevantes y Seguridad 5, typecheck/build backend/frontend, revisión independiente.
- [ ] Publicar un único PR borrador y verificar ambos jobs de CI para el SHA final.
