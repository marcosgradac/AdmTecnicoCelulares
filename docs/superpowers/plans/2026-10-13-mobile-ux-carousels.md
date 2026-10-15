# Mobile UX 2.0 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for sequential integration and superpowers:dispatching-parallel-agents for independent route groups.

**Goal:** Reduce mobile scroll before operational data without removing important information or changing business logic.
**Architecture:** Native horizontal scroll-snap carousel for small finite card groups; compact horizontal tabs for navigation/filter controls; visible-on-demand sections preserving mounted form state. Existing lists, pagination, permissions, financial calculations and desktop layouts stay intact.
**Tech Stack:** React, Material UI, TypeScript, native CSS and Playwright; no new runtime dependencies.
**Spec:** User-provided Mobile UX 2.0 request, 2026-10-13.

## Global constraints
- Base latest origin/main: 6aa00849b46d3916d05834e459404474d3d5fee3; branch feature/mobile-ux-carousels.
- Worktree isolated; preserve all previous worktrees/local changes.
- No backend behavior, production data, schema/migrations, merge or deployment changes.
- Preserve personal dark mode, financial colors/labels/values, operating permissions, subscriptions and destructive confirmations.
- Breakpoint for mobile patterns: below 900px, matching existing AppShell; desktop 1440 unchanged. Validate tablet 768 separately.
- Screens: mobile 360/390/430, tablet 768, desktop 1440; light/dark.
- Draft PR only, fake API demo and exact before/after browser captures/scroll measurements.

## Shared interface
Create frontend/src/components/common/MobileCarousel.tsx:
`MobileCarousel({label, children, desktopSx?, itemWidth?, itemLabels?, arrows?})`.
label required; children finite cards, not large lists or forms; desktopSx preserves original grid wrapper; itemWidth defaults clamp(240px, 76vw, 320px); itemLabels optional accessible names; arrows optional default true. Mobile uses native scroll snap, next-card peek, position buttons, keyboard (arrows/Home/End only on track itself), reduced motion and one passive scroll listener/ResizeObserver with cleanup. Desktop renders original children in desktopSx, without carousel controls/listeners. Agents can import this interface while root owns its implementation.

## Review focus
- Settings drafts/password flow retain state after tab/hash/back navigation; no repeated requests.
- Critical alerts/actions, restrictions and destructive confirmations remain reachable with keyboard/touch.
- Nested horizontal gestures avoided; child controls do not trigger carousel shortcuts.
- Narrow mobile has no document overflow or overlay covering actionable content.
- Finite carousel uses current data without queries on slide changes; numbers/periods unmodified.

## Tasks
- [x] Capture/build immutable baseline from main before product edits; install dependencies and baseline typecheck/tests.
- [x] Shared carousel + interaction tests; compact shared PageHeader/AppShell and remove covering mobile repair FAB.
- [x] Root: Dashboard metrics/modules, grouped charts, compact attention/recent activity; Caja compact tabs/periods/metric carousel.
- [x] Route group A: Settings hash tabs with mounted panels; subscription/profile/Super Admin responsive audit.
- [x] Route group B: equipment stats/flow; repairs/clients compact top/list/details using actual sections.
- [x] Route group C: Commerce existing categories/POS/cart; warranties/team; preserve all commercial/operational logic.
- [x] Root: mobile interaction/browser matrix with fake API; before/after measure list offset/required scroll and API request parity.
- [x] Review all routes, touch/keyboard/swipe/vertical movement/menu/filter/permissions/subscription and both themes.
- [x] Frontend/backend typecheck/build/relevant local tests; CI configured for the draft PR; report/baseline comparison plus new captures.
- [ ] Commit/push only feature branch, create single draft PR with preview blocked for branch, attach PR; leave local interactive demo open.
