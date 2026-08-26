# TecnoDesk performance and scalability design

Date: 2026-08-26

## Scope

Optimize authenticated request overhead and the data volume returned by repair, client, cash, and platform-admin queries without changing user flows, permissions, tenant isolation, security controls, or public API behavior consumed by the current frontend. Logo storage remains unchanged and is documented as a future object-storage candidate.

## Authentication and subscription access

Authentication will fetch the authenticated user, business activation state, and business subscription in one Prisma query. User, token, session, and subscription records will not be cached.

`BillingSettings` lifecycle values (`expirationWarningDays` and `defaultGraceDays`) will use an in-process cache with a short TTL. The cache exposes an explicit invalidation function. Every Super Admin route that changes lifecycle settings must invalidate it immediately after the database write succeeds.

Access evaluation will be split into:

- a pure calculation that accepts a subscription, lifecycle settings, and current time;
- a settings loader with the short-lived cache;
- compatibility helpers that load a subscription only when the caller does not already have one.

The result calculated during authentication will be attached to the Express request. `requireSubscriptionWriteAccess` will reuse that result, preventing a second subscription and settings lookup on authenticated writes. Super Admin remains exempt according to the existing behavior. Blocked subscriptions are never cached, so a block or suspension is effective on the next request; lifecycle-setting changes invalidate the only cache involved.

## Platform administration

Dashboard, business listing, and business detail operations will load lifecycle settings once and reuse the pure access calculation for every subscription. This removes the `BillingSettings` N+1 pattern.

The business listing keeps its existing lifecycle filtering, sorting, pagination response, and UI semantics. This task does not move derived lifecycle filtering into SQL because that would require duplicating access-domain logic and expand the risk surface.

## Repair listing

`GET /api/repairs` will use a dedicated list select containing only fields required by `RepairsPage` and its row actions:

- repair identity, number, client identity and display fields;
- device display fields;
- status, issue, financial totals, dates;
- tracking and warranty summary fields needed by existing actions.

It will not load payments, status history, photos, warranty claims, device records, or other detail-only relations. The paginated envelope and filters remain unchanged. `GET /api/repairs/:id` and mutation responses keep the complete include.

## Client listing and options

The paginated client listing will select displayed client fields and `_count.repairs`, exposed to the frontend as `repairCount`. `ClientsPage` will render this count instead of receiving complete repairs.

A lightweight client-options query will return only `id`, `name`, and `phone`, ordered consistently for repair forms. Existing repair drawers and detail editing will use this query. `GET /api/clients/:id` retains complete repair history. No client history will be loaded for list or selector use.

## Cash pagination

`GET /api/cash/movements` will accept validated `page` and `pageSize` parameters, with a maximum page size and a default of 10. Its response will contain:

- `items`, `total`, `page`, `pageSize`, and `pages`;
- `summary` with today's income, expense, balance, and the real total movement count.

The backend will compute page items, total count, and today's aggregates without loading historical rows into application memory. The frontend will use Material UI pagination controls with 10 rows per page. Reloading after a mutation will move to the preceding page when the requested page is empty but the collection still contains records. The existing visual row design and creation flow remain unchanged.

## Database indexes

An additive PostgreSQL migration will create indexes for observed tenant-scoped filters and ordering:

- `Repair(businessId, createdAt)`;
- `Repair(businessId, status, createdAt)`;
- `Client(businessId, createdAt)`;
- `CashMovement(businessId, createdAt)`.

Existing unique and relation indexes remain untouched. No reset, destructive migration, or data rewrite is allowed.

## Compatibility and security

The implementation preserves:

- JWT verification and `tokenVersion` checks;
- active user and business validation;
- `businessId` isolation on every affected query;
- roles, permissions, Super Admin rules, rate limiting, Turnstile, CORS, and Zod validation;
- subscription blocking and write restrictions;
- existing detail endpoints and public tracking behavior.

Frontend and backend contracts may evolve together only for the optimized list responses described above. No visual redesign is included.

## Testing and verification

Tests will cover:

- pure access calculation and cached settings invalidation;
- one-settings-load behavior for batch access evaluation;
- repair list omission of heavy relations while preserving filters and isolation;
- client list counts, lightweight options, detail history, and isolation;
- cash pagination, totals, daily summary, validation, and tenant isolation;
- current platform-admin lifecycle behavior.

Required commands:

Backend:

```text
npm ci
npm run prisma:generate
npx prisma validate
npm run typecheck
npm run build
all existing test scripts plus new focused tests
```

Frontend:

```text
npm ci
npm run build
```

`git diff --check` must pass. Manual/logical regression review covers authentication, registration, dashboard, repairs, creation, state changes, payments, clients, cash, tracking, warranties, team permissions, subscriptions, and platform administration.

## Explicit non-goals and future work

- No UI redesign or feature removal.
- No broad `server.ts` refactor.
- No user, session, or subscription cache.
- No object-storage migration. Business logos currently remain Base64 data in PostgreSQL; object storage is a future scalability improvement.
- No speculative indexes beyond the four tied to current queries.
