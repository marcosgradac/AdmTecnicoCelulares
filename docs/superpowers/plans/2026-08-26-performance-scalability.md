# TecnoDesk Performance and Scalability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce repeated authenticated-request queries and bound list payloads for repairs, clients, cash, and platform administration without changing behavior or weakening security.

**Architecture:** Keep the current Express application structure and introduce only focused helpers: a pure subscription-access calculator plus a short-lived BillingSettings cache, dedicated Prisma list selects, lightweight client options, and a paginated cash envelope. Frontend consumers evolve in lockstep with optimized response contracts, while detail endpoints remain complete.

**Tech Stack:** Node.js, Express 5, TypeScript 5.8, Prisma 6, PostgreSQL, React 19, Material UI 7, Axios, Sass, TSX integration tests.

**Spec:** `docs/superpowers/specs/2026-08-26-performance-scalability-design.md`

## Global Constraints

- Do not redesign screens, remove functionality, or change user flows.
- Preserve JWT verification, tokenVersion, businessId isolation, roles, permissions, SUPER_ADMIN, subscription blocking, rate limiting, Turnstile, CORS, and Zod validation.
- Do not cache users, tokens, sessions, businesses, or subscriptions.
- BillingSettings cache TTL must be short and invalidated immediately after lifecycle settings change.
- Cash daily metrics use `America/Argentina/Buenos_Aires`; historical total is all-time.
- Prisma migration is additive only; never reset or delete data.
- Business logos remain Base64 in PostgreSQL; object storage is future work.
- Do not push implementation to main until all required verification passes.

---

### Task 1: Subscription access calculation and request-scoped reuse

**Files:**
- Create: `backend/tests/performance-access.ts`
- Modify: `backend/package.json`
- Modify: `backend/src/modules/billing/billing.service.ts`
- Modify: `backend/src/middlewares/auth.ts`
- Modify: `backend/src/modules/billing/billing.middleware.ts`

**Interfaces:**
- Produces: `getBillingLifecycleSettings(): Promise<BillingLifecycleSettings>`
- Produces: `invalidateBillingLifecycleSettingsCache(): void`
- Produces: `calculateAccountAccessStatus(subscription, settings, now): AccountAccessStatus`
- Produces: `getAccountAccessStatus(subscription, now?, settings?): Promise<AccountAccessStatus>` for compatibility.
- Produces: `Request.accountAccess?: AccountAccessStatus | null` for write-middleware reuse.

- [ ] **Step 1: Add a focused test script and failing cache/access tests**

Add to `backend/package.json`:

```json
"test:performance-access": "tsx tests/performance-access.ts"
```

Create `backend/tests/performance-access.ts` that imports the new functions, constructs `Subscription` fixtures, and asserts:

```ts
assert.equal(calculateAccountAccessStatus(active, { expirationWarningDays: 7, defaultGraceDays: 5 }, now).status, 'ACTIVE')
assert.equal(calculateAccountAccessStatus(manuallyBlocked, settings, now).shouldBlock, true)
assert.equal(calculateAccountAccessStatus(expired, settings, now).status, 'GRACE')
```

Instrument `prisma.billingSettings.findUnique` in the test, call `getBillingLifecycleSettings()` twice, assert one database call, then call `invalidateBillingLifecycleSettingsCache()` and assert the next load performs a second database call.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm run test:performance-access`

Expected: FAIL because the exported cache and pure calculation functions do not exist.

- [ ] **Step 3: Implement the pure calculation and settings cache**

In `billing.service.ts`, define:

```ts
export interface BillingLifecycleSettings {
  expirationWarningDays: number
  defaultGraceDays: number
}

const BILLING_SETTINGS_TTL_MS = 30_000
let billingSettingsCache: { value: BillingLifecycleSettings; expiresAt: number } | null = null

export function invalidateBillingLifecycleSettingsCache() {
  billingSettingsCache = null
}
```

`getBillingLifecycleSettings()` must return cached values before expiry, otherwise query only the two lifecycle fields and cache defaults `{ expirationWarningDays: 7, defaultGraceDays: GRACE_DAYS }` when the row is absent. Move status arithmetic into synchronous `calculateAccountAccessStatus`. Keep `getAccountAccessStatus` as an async compatibility wrapper accepting optional preloaded settings.

- [ ] **Step 4: Reuse authenticated subscription access inside the request**

Extend the authentication query to select `business.subscription` together with `business.isActive`. Calculate access using the subscription already returned and attach it to `req.accountAccess`. Keep the current user/token/business validation order. Update `requireSubscriptionWriteAccess` to use `req.accountAccess` and only call `getBusinessAccessStatus` if the request lacks the property, preserving safe compatibility for isolated middleware tests.

- [ ] **Step 5: Run focused and security-sensitive tests**

Run:

```text
npm run test:performance-access
npm run test:billing
npm run test:subscription-lifecycle
npm run test:password-change
npm run test:settings-team
```

Expected: all PASS, with the cache test proving one settings query before invalidation.

- [ ] **Step 6: Commit Task 1**

```text
git add backend/package.json backend/tests/performance-access.ts backend/src/modules/billing/billing.service.ts backend/src/middlewares/auth.ts backend/src/modules/billing/billing.middleware.ts
git commit -m "perf: reuse subscription access checks"
```

---

### Task 2: Eliminate BillingSettings N+1 in platform administration

**Files:**
- Modify: `backend/tests/performance-access.ts`
- Modify: `backend/src/modules/platform-admin/platform-admin.routes.ts`

**Interfaces:**
- Consumes: `getBillingLifecycleSettings`, `calculateAccountAccessStatus`, and `invalidateBillingLifecycleSettingsCache` from Task 1.
- Preserves: current platform-admin JSON response shapes.

- [ ] **Step 1: Add failing batch and invalidation tests**

Extend `performance-access.ts` to evaluate multiple subscription fixtures using one settings object and assert no additional BillingSettings lookup. Add an HTTP test using a SUPER_ADMIN token that PATCHes `/api/platform-admin/service-settings`, then calls `getBillingLifecycleSettings()` and verifies the updated values are returned rather than the old cached values.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm run test:performance-access`

Expected: FAIL because platform-admin still invokes the async settings-loading wrapper per subscription and does not invalidate the cache.

- [ ] **Step 3: Batch access evaluation and invalidate lifecycle updates**

For `/dashboard` and `/businesses`, load lifecycle settings once before mapping subscriptions and call `calculateAccountAccessStatus(item, settings, now)`. For `/businesses/:id` and subscription mutation responses, pass the already-loaded settings to `getAccountAccessStatus` or use the pure calculator.

After a successful `/service-settings` upsert, call `invalidateBillingLifecycleSettingsCache()` before returning. Do not invalidate on `/billing-settings` because bank/payment fields do not affect access calculations.

- [ ] **Step 4: Run platform and billing regression tests**

Run:

```text
npm run test:performance-access
npm run test:billing
npm run test:subscription-lifecycle
```

Expected: all PASS and response assertions unchanged.

- [ ] **Step 5: Commit Task 2**

```text
git add backend/tests/performance-access.ts backend/src/modules/platform-admin/platform-admin.routes.ts
git commit -m "perf: batch platform access evaluation"
```

---

### Task 3: Lightweight repair list query

**Files:**
- Modify: `backend/tests/pagination.ts`
- Modify: `backend/src/server.ts`
- Modify: `frontend/src/services/repairs.ts`

**Interfaces:**
- Produces: `repairListSelect` dedicated to `GET /api/repairs`.
- Preserves: `{ items, total, page, pageSize, pages }` and existing filter parameters.
- Preserves: complete `includeRepair` for detail and mutation responses.

- [ ] **Step 1: Add a failing repair payload regression test**

Extend `backend/tests/pagination.ts` so the first list item must contain required summary fields and must not own heavy relation keys:

```ts
for (const key of ['payments', 'statusHistory', 'photos', 'warrantyClaims', 'device']) {
  assert.equal(Object.hasOwn(listItem, key), false, `list item omits ${key}`)
}
assert.equal(typeof listItem.client.name, 'string')
```

Also assert search, status filtering, pagination, and cross-tenant isolation remain correct.

- [ ] **Step 2: Run pagination tests and verify RED**

Run: `npm run test:pagination`

Expected: FAIL because list items currently include the heavy relations.

- [ ] **Step 3: Add the dedicated Prisma select**

Define `repairListSelect` next to `includeRepair`, selecting only:

```ts
id, number, clientId, deviceBrand, deviceModel, imei, color, issue,
diagnosis, notes, status, total, paid, trackingToken, trackingEnabled,
estimatedDeliveryDate, warrantyEnabled, warrantyDurationDays,
warrantyStartedAt, warrantyExpiresAt, createdAt, updatedAt,
client: { select: { id: true, name: true, phone: true, createdAt: true } }
```

Use it only in the `findMany` inside `GET /api/repairs`. Keep `includeRepair` unchanged elsewhere. Make `statusHistory` optional in the frontend transport type and keep the current mapper fallback.

- [ ] **Step 4: Run repair-related tests and frontend typecheck through build**

Run:

```text
npm run test:pagination
npm run test:simplified-repairs
npm run test:warranties
cd ../frontend
npm run build
```

Expected: all PASS.

- [ ] **Step 5: Commit Task 3**

```text
git add backend/tests/pagination.ts backend/src/server.ts frontend/src/services/repairs.ts
git commit -m "perf: slim repair list payloads"
```

---

### Task 4: Lightweight client lists and selector options

**Files:**
- Modify: `backend/tests/pagination.ts`
- Modify: `backend/src/server.ts`
- Modify: `frontend/src/services/operations.ts`
- Modify: `frontend/src/pages/ClientsPage.tsx`
- Modify: `frontend/src/components/repairs/NewRepairDrawer.tsx`
- Modify: `frontend/src/components/repairs/EditRepairDrawer.tsx`
- Modify: `frontend/src/pages/RepairDetailPage.tsx`

**Interfaces:**
- Produces: paginated client item with `repairCount: number` and no `repairs` array.
- Produces: `GET /api/clients/options` returning `Array<{ id: string; name: string; phone: string | null }>`.
- Preserves: `GET /api/clients/:id` with complete repairs.

- [ ] **Step 1: Add failing list/options/detail tests**

Extend `pagination.ts` to assert paginated clients expose `repairCount`, omit `repairs`, and remain tenant-scoped. Assert `/clients/options` returns only `id`, `name`, and `phone`, does not expose history, and excludes the other tenant. Assert `/clients/:id` still includes the client's repairs.

- [ ] **Step 2: Run pagination tests and verify RED**

Run: `npm run test:pagination`

Expected: FAIL because `repairCount` and `/clients/options` do not exist.

- [ ] **Step 3: Implement client list select and options endpoint**

Place `/api/clients/options` before `/api/clients/:id` to avoid treating `options` as an ID. Select only `id`, `name`, and `phone`, order by `name`, and scope by `businessId`. Paginated `/api/clients` selects displayed fields plus `_count: { select: { repairs: true } }`, then maps `_count.repairs` to `repairCount` before returning the existing pagination envelope.

- [ ] **Step 4: Update frontend client contracts and consumers**

Add `ClientOption` and `ClientListRecord` types. Replace `getClients()` in repair creation/editing consumers with `getClientOptions()`. Update `ClientsPage` to display `repairCount`. Keep `getClient(id)` and detail types complete. Ensure the drawer selection behavior and labels are unchanged.

- [ ] **Step 5: Run client/repair tests and frontend build**

Run:

```text
npm run test:pagination
npm run test:simplified-repairs
cd ../frontend
npm run build
```

Expected: all PASS with no TypeScript errors.

- [ ] **Step 6: Commit Task 4**

```text
git add backend/tests/pagination.ts backend/src/server.ts frontend/src/services/operations.ts frontend/src/pages/ClientsPage.tsx frontend/src/components/repairs/NewRepairDrawer.tsx frontend/src/components/repairs/EditRepairDrawer.tsx frontend/src/pages/RepairDetailPage.tsx
git commit -m "perf: separate client summaries and options"
```

---

### Task 5: Paginated cash movements with Argentina-day summary

**Files:**
- Create: `backend/tests/cash-pagination.ts`
- Create: `backend/src/lib/argentina-day.ts`
- Modify: `backend/package.json`
- Modify: `backend/src/server.ts`
- Modify: `frontend/src/services/operations.ts`
- Modify: `frontend/src/pages/CashPage.tsx`

**Interfaces:**
- Produces: `GET /api/cash/movements?page=1&pageSize=10` response `{ items, total, page, pageSize, pages, summary }`.
- Produces: `summary: { incomeToday: number; expenseToday: number; balanceToday: number; totalMovements: number }`.

- [ ] **Step 1: Add the failing cash pagination test**

Add to `backend/package.json`:

```json
"test:cash-pagination": "tsx tests/cash-pagination.ts"
```

Create `cash-pagination.ts` with two tenants and at least 12 movements. Assert page 1 has 10 items, page 2 has 2, total/pages are correct, invalid page sizes return 400, and no cross-tenant item contributes to totals.

Export `getArgentinaDayBounds(now: Date)` from `backend/src/lib/argentina-day.ts` and test it directly with a fixed `now`. Insert boundary fixtures equivalent to `2026-08-27T02:30:00.000Z` (2026-08-26 23:30 in Buenos Aires) and `2026-08-27T03:30:00.000Z` (2026-08-27 00:30 locally). Assert that only the fixture belonging to the calendar date returned for `America/Argentina/Buenos_Aires` contributes to daily income/expense.

- [ ] **Step 2: Run the cash test and verify RED**

Run: `npm run test:cash-pagination`

Expected: FAIL because the endpoint returns an array and has no Argentina-day summary.

- [ ] **Step 3: Implement Argentina calendar-day bounds and backend pagination**

Implement `getArgentinaDayBounds(now: Date)` as a dependency-free helper that returns UTC instants for midnight-to-midnight in `America/Argentina/Buenos_Aires`, regardless of the host timezone. Call it from the endpoint with `new Date()` and test the midnight boundary through the fixed `now` argument. Validate page/pageSize with Zod. In one Prisma transaction obtain page items, all-time count, and grouped/summed current-day movements scoped by `businessId` and `createdAt: { gte: start, lt: end }`.

Return the envelope and compute `balanceToday = incomeToday - expenseToday`. `totalMovements` equals the all-time `total`, not the daily count.

- [ ] **Step 4: Update CashPage without redesigning it**

Update `getCashMovements` to accept `{ page, pageSize }`. Store `page`, `total`, and backend `summary`. Replace client-side daily filtering with summary values. Add existing Material UI `TablePagination` below the movement stack with fixed `rowsPerPage={10}`, visible next/previous controls, and Spanish labels. After creation reload the current page; if it is empty and `page > 0` while `total > 0`, decrement page.

- [ ] **Step 5: Run cash test and frontend build**

Run:

```text
npm run test:cash-pagination
cd ../frontend
npm run build
```

Expected: PASS; desktop and mobile keep the current layout with compact pagination controls.

- [ ] **Step 6: Commit Task 5**

```text
git add backend/package.json backend/tests/cash-pagination.ts backend/src/lib/argentina-day.ts backend/src/server.ts frontend/src/services/operations.ts frontend/src/pages/CashPage.tsx
git commit -m "perf: paginate cash movements"
```

---

### Task 6: Add query-backed database indexes

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260827010000_add_list_query_indexes/migration.sql`

**Interfaces:**
- Produces four additive PostgreSQL indexes matching the approved spec.

- [ ] **Step 1: Add exact composite indexes to Prisma schema**

Add:

```prisma
// Repair
@@index([businessId, createdAt])
@@index([businessId, status, createdAt])

// Client
@@index([businessId, createdAt])

// CashMovement
@@index([businessId, createdAt])
```

- [ ] **Step 2: Create the additive migration SQL**

Create only `CREATE INDEX` statements with Prisma-style stable names:

```sql
CREATE INDEX "Repair_businessId_createdAt_idx" ON "Repair"("businessId", "createdAt");
CREATE INDEX "Repair_businessId_status_createdAt_idx" ON "Repair"("businessId", "status", "createdAt");
CREATE INDEX "Client_businessId_createdAt_idx" ON "Client"("businessId", "createdAt");
CREATE INDEX "CashMovement_businessId_createdAt_idx" ON "CashMovement"("businessId", "createdAt");
```

- [ ] **Step 3: Validate schema and generated client**

Run:

```text
npm run prisma:generate
npx prisma validate
```

Expected: both commands exit 0 without applying or resetting the database.

- [ ] **Step 4: Commit Task 6**

```text
git add backend/prisma/schema.prisma backend/prisma/migrations/20260827010000_add_list_query_indexes/migration.sql
git commit -m "perf: index tenant list queries"
```

---

### Task 7: Full verification and regression audit

**Files:**
- Modify only if a verification failure demonstrates a regression in an affected file.

**Interfaces:**
- Consumes all prior tasks.
- Produces verified build/test evidence and a clean project diff excluding user PNG files.

- [ ] **Step 1: Install reproducibly**

Run from `backend` and then `frontend`:

```text
npm ci
```

Expected: exit 0 in both workspaces with lockfiles unchanged.

- [ ] **Step 2: Verify Prisma and backend compilation**

Run from `backend`:

```text
npm run prisma:generate
npx prisma validate
npm run typecheck
npm run build
```

Expected: every command exits 0.

- [ ] **Step 3: Run every backend test script**

Run:

```text
npm run test:password-reset
npm run test:password-change
npm run test:settings-team
npm run test:inventory
npm run test:reports
npm run test:simplified-repairs
npm run test:warranties
npm run test:pagination
npm run test:billing
npm run test:subscription-lifecycle
npm run test:performance-access
npm run test:cash-pagination
```

Expected: all suites PASS with zero failures.

- [ ] **Step 4: Verify frontend production build**

Run from `frontend`:

```text
npm run build
```

Expected: TypeScript and Vite exit 0. Existing bundle-size warnings are non-blocking unless they become materially worse.

- [ ] **Step 5: Review protected flows logically and inspect diffs**

Confirm affected code paths still enforce authentication, tenant isolation, permissions, subscription writes, and full detail payloads. Check login, registration, admin dashboard, repairs, repair creation/status/payment, clients, cash, public tracking, warranties, team, subscription, and platform-admin routes by targeted tests and code inspection.

Run:

```text
git diff --check
git status --short
git diff --stat
```

Expected: diff check passes; only planned project files plus pre-existing untracked user PNGs appear.

- [ ] **Step 6: Commit any verification-only fixes, if required by observed failures**

Stage only files directly required by a reproduced failure and commit with a message naming that regression. If no failures occur, create no extra commit.
