# Security 5 tenant isolation implementation plan

> Execute in this task using `superpowers:executing-plans`; no merge or production deployment.

**Goal:** demonstrate tenant isolation throughout the backend and fix only reproducible failures.

**Architecture:** preserve the existing authenticated business context, module boundaries and public/Super Admin exceptions. Exercise real HTTP handlers against disposable local PostgreSQL with two independent tenants.

**Tech stack:** Express, Prisma, PostgreSQL, TypeScript/tsx, existing test helpers.

**Spec:** owner's Security 5 request, 2026-10-10.

## Global constraints

No production access, infrastructure, secrets, schema, frontend or authentication-policy changes. Preserve user-owned `docs/security/`. One branch and one unmerged PR.

## Review focus

Known foreign IDs; nonexistent IDs; mixed own/foreign nested IDs; arbitrary business/user claims; concurrent financial/state operations. Assert response privacy and unchanged database state after rejection.

## Tasks

- [x] Update main and create `codex/security-5-tenant-isolation`; run existing security baseline.
- [x] Read routes, services, shared helpers, raw queries and transaction boundaries for every tenant-bearing module; record protected paths and unresolved structural risks.
- [x] Add `backend/tests/tenant-isolation-complete.ts` using an ephemeral local HTTP server and synthetic PostgreSQL fixtures. Cover positive own-tenant behavior, foreign reads/writes/associations, list/aggregate isolation, public tokens, explicit Super Admin exceptions and concurrent financial rejection.
- [x] No demonstrated production isolation failure; retain existing behavior. Fix only the demonstrated nondeterministic cancellation test assertion and verify it passes.
- [x] Run all backend tests, typecheck, build and route-registration preservation; document reproducible commands and limitations in `docs/security-5-audit.md`.
- [ ] Commit only task files, push one branch, create one draft PR to main and check both CI jobs. Report SHA and evidence; do not merge/deploy.
