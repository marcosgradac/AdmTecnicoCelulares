# Repair hard deletion on main — implementation plan

Goal: implement permanent repair deletion on origin/main without PR #17, financial migrations, or commerce/stock changes.
Architecture: lock the Repair row with PostgreSQL FOR UPDATE, validate exclusive ownership of existing cash links, delete children and all owned cash rows atomically. Cash/dashboard/reports continue using their existing queries. Historical cancellations stay readable; new cancellation is rejected.
Constraints: preserve original worktree; synthetic local databases only; no production writes, merge or deployment. One guarded photo-table removal migration; no new financial columns.

- [x] Establish clean main baseline and create tests using existing schema.
- [x] Implement atomic hard deletion; remove new cancellation routes/UI and photo model/API references.
- [x] Verify balances, report history, commerce/stock snapshots, permissions, tenants, rollback and concurrent writes.
- [x] Run frontend/backend builds and focused regressions; review diff against main and independently review code.
- [ ] Commit only this worktree, push new branch, open independent PR toward main and attach it.
