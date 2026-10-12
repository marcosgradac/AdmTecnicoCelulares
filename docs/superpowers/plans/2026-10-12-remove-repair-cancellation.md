# Remove repair cancellation implementation plan

Goal: remove repair cancellation completely from latest origin/main d575aea, retaining PR18 hard deletion and every normal operation.
Architecture: move unchanged DELETE handler to repair-delete.routes.ts; remove cancellation-only routes, fields, enum labels and calculations. A new locked transaction migration refuses any cancellation data before dropping fields/recreating enums. Frontend consumes only normal statuses and payment fields.
Tech: Express, React, Prisma PostgreSQL/SQLite. Spec: user attachment c5fdf7bc-f33a-4702-9876-52f9f29a9206/Texto pegado.txt.
Constraints: preserve other worktrees; no PR17 commits, production writes, migrations in production, merges or deployment. Read-only audit only. Historical migrations retained.
Review focus: legacy default-zero vs populated fields; enum defaults and all usages; deleted financial pointers now prevented by migration; shared cash/tenant protection; Commerce cancellation remains independent.
- [x] Red regression: cancellation endpoints absent and CANCELLED rejected with no mutations.
- [x] Move DELETE, remove backend cancellation-only calculations, read fields, demos and filters.
- [x] Remove frontend cancellation services/dialog/summary/status; preserve ordinary Cancelar buttons.
- [x] Guarded migration and local rejection/rollback tests; update Prisma PostgreSQL and SQLite schemas.
- [x] Update outdated tests and route contract; run builds, repair/Cash/warranty/Commerce/permissions/tenant regressions.
- [x] Independent review, final audit and report; commit/push independent draft PR with previews blocked in Git config only.
