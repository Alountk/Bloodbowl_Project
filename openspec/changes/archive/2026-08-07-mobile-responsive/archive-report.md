# Archive Report — mobile-responsive

**Change**: mobile-responsive
**Closed**: 2026-08-07
**Status**: ✅ PASS — SDD cycle complete
**Artifact store**: openspec (filesystem)

---

## 1. Change Summary

| Field | Value |
|-------|-------|
| Change name | `mobile-responsive` |
| Goal | Make every route usable on phones with zero data loss using the user-approved **Config A (drawer hamburger) + horizontal-scroll tables**. Desktop markup stays structurally identical so e2e and unit contracts hold. |
| Branch | `feat/mobile-responsive` (from `main`) |
| PR merge | `b5800fa` (Merge PR #19, feat/mobile-responsive → main) |
| Verify verdict | ✅ PASS (0 CRITICAL, 0 BLOCKER, 1 WARNING at verification time — see §7) |
| Requirements | 9/9 compliant |
| Scenarios | 29/29 compliant |
| Unit tests | 421/421 passed (20 files) |
| E2E tests | 14/14 passed |
| Build / Type-check | ✅ (npx tsc --noEmit exit 0) |
| Lint | ✅ (pnpm lint exit 0) |
| Scope shipped | Mobile drawer shell (hamburger + scrim + conditional overlay sidebar, `SidebarContent` partial); nested horizontal-scroll tables (RosterTable, PlayerAvailabilityTable, detail coaching table); home wrapping heading row + ≥40px CTA tap target; responsive heroes |

---

## 2. SDD Cycle Trace

| Phase | Artifact | Date | Status |
|-------|----------|------|--------|
| Propose | `openspec/changes/archive/2026-08-07-mobile-responsive/proposal.md` | 2026-08-07 | ✅ |
| Explore | `openspec/changes/archive/2026-08-07-mobile-responsive/exploration.md` | 2026-08-07 | ✅ |
| Spec | `openspec/changes/archive/2026-08-07-mobile-responsive/specs/` (5 delta files) | 2026-08-07 | ✅ |
| Design | `openspec/changes/archive/2026-08-07-mobile-responsive/design.md` | 2026-08-07 | ✅ |
| Tasks | `openspec/changes/archive/2026-08-07-mobile-responsive/tasks.md` | 2026-08-07 | ✅ 13/13 |
| Apply | `openspec/changes/archive/2026-08-07-mobile-responsive/apply-progress.md` | 2026-08-07 | ✅ |
| Verify | `openspec/changes/archive/2026-08-07-mobile-responsive/verify-report.md` | 2026-08-07 | ✅ PASS |
| Archive | `openspec/changes/archive/2026-08-07-mobile-responsive/archive-report.md` (this file) | 2026-08-07 | ✅ |

Note: this change produced no `state.yaml` in the change folder (concise single-cycle change; the folder ships proposal, exploration, specs, design, tasks, apply-progress, verify-report).

---

## 3. Artifacts Inventory

### Filesystem (openspec/)

| Artifact | Path | Status |
|----------|------|--------|
| Proposal | `openspec/changes/archive/2026-08-07-mobile-responsive/proposal.md` | ✅ |
| Exploration | `openspec/changes/archive/2026-08-07-mobile-responsive/exploration.md` | ✅ |
| Spec delta — app-shell | `openspec/changes/archive/2026-08-07-mobile-responsive/specs/app-shell/spec.md` | ✅ |
| Spec delta — create-team | `openspec/changes/archive/2026-08-07-mobile-responsive/specs/create-team/spec.md` | ✅ |
| Spec delta — roster-table | `openspec/changes/archive/2026-08-07-mobile-responsive/specs/roster-table/spec.md` | ✅ |
| Spec delta — team-detail-view | `openspec/changes/archive/2026-08-07-mobile-responsive/specs/team-detail-view/spec.md` | ✅ |
| Spec delta — team-list | `openspec/changes/archive/2026-08-07-mobile-responsive/specs/team-list/spec.md` | ✅ |
| Design | `openspec/changes/archive/2026-08-07-mobile-responsive/design.md` | ✅ |
| Apply progress | `openspec/changes/archive/2026-08-07-mobile-responsive/apply-progress.md` | ✅ |
| Tasks | `openspec/changes/archive/2026-08-07-mobile-responsive/tasks.md` | ✅ 13/13 |
| Verify report | `openspec/changes/archive/2026-08-07-mobile-responsive/verify-report.md` | ✅ |
| Archive report | `openspec/changes/archive/2026-08-07-mobile-responsive/archive-report.md` | ✅ (this file) |

### Main Specs Synced

| Spec | Path | Action |
|------|------|--------|
| app-shell | `openspec/specs/app-shell/spec.md` | Updated — 1 ADDED requirement (Mobile Drawer Navigation) + 2 MODIFIED (Sidebar Structure, Topbar with Route-Conditional Search); 2 preserved (Design Tokens, Light Body Layout) |
| create-team | `openspec/specs/create-team/spec.md` | Updated — 1 ADDED requirement (Responsive Step 2 Hero and Panels) + 1 MODIFIED (Jugadores Disponibles Availability Table); 7 preserved |
| roster-table | `openspec/specs/roster-table/spec.md` | Updated — 1 MODIFIED requirement (Scrollable Roster Table); 9 preserved |
| team-detail-view | `openspec/specs/team-detail-view.md` | Updated — 2 MODIFIED requirements (Identity Display, Coaching Staff Display); 6 preserved |
| team-list | `openspec/specs/team-list.md` | Updated — 1 MODIFIED requirement (Home Heading with Create Action); 4 preserved |

---

## 4. Spec Sync Details

### app-shell → `openspec/specs/app-shell/spec.md`

- **ADDED `Mobile Drawer Navigation`** — hamburger button (< `md`) opens overlay drawer; scrim `fixed inset-0 bg-slate-900/45 z-40` + drawer `fixed left-0 top-0 bottom-0 z-50`; closes on scrim click, hamburger toggle, nav link click; drawer copy mounts only while open so at most one `aria-label="Sidebar"` exists; desktop (md+) renders no scrim/drawer/hamburger. 3 scenarios.
- **MODIFIED `Sidebar Structure`** — added `hidden md:flex` desktop gating (stays in DOM, visible at `md+`) and the shared `SidebarContent` partial so desktop + drawer render identical nav. Scenario "Sidebar landmark and wordmark" updated to assert `hidden md:flex` on the root.
- **MODIFIED `Topbar with Route-Conditional Search`** — added hamburger `md:hidden` with `aria-label="Open navigation menu"`, h1 `truncate`, compact search on `/`. New scenario "Hamburger and h1 on mobile".
- Preserved unchanged: Design Tokens, Light Body Layout. Main spec "Test Coverage" table updated to cite the new `AppShell.test.tsx` drawer coverage.

### create-team → `openspec/specs/create-team/spec.md`

- **ADDED `Responsive Step 2 Hero and Panels`** — step-2 hero text scales via responsive tokens (`text-2xl md:text-[28px]`); hero/panel horizontal padding tightens (`px-4 sm:px-6`); legible and non-overflowing at 375px. 2 scenarios.
- **MODIFIED `Jugadores Disponibles Availability Table`** — added nested `overflow-x-auto` wrapper + `min-w-[640px] md:min-w-0` inner panel for horizontal scroll on mobile; sticky headers preserved. New scenario "Horizontal scroll on mobile".
- Preserved unchanged: Two-Step Wizard Navigation, Step 2 Plantilla Section, Default Player Naming, Editable POSICIÓN Subtext, Coaching Staff English Labels, Submit Team, and (unchanged behavior in) the shared availability scenarios.

### roster-table → `openspec/specs/roster-table/spec.md`

- **MODIFIED `Scrollable Roster Table`** — outer container keeps `max-h-[55vh] overflow-auto`; nested `overflow-x-auto` wrapper added inside it; inner panel `min-w-[640px] md:min-w-0` (the `md:min-w-0` prevents 768–880px page overflow); sticky `top-0 z-10` headers preserved. New scenario "Horizontal scroll on mobile"; "Height cap and sticky header" tightened to assert the exact outer classes.
- Preserved unchanged: Light Theme Isolation, Rulebook Column Set and Order, Qty Derivation, Editable POSICIÓN Subtext, Position Cell with Spanish Role Subtitle, Spanish Skill Names with English Fallback, Access Column Rendering, Cost Format, Banner, Rulebook Footer, Totals Row, Accessibility and Consumer Contract Preservation.

### team-detail-view → `openspec/specs/team-detail-view.md`

- **MODIFIED `Identity Display`** — added responsive hero heading tokens (`text-2xl md:text-[28px]`) and tightened hero padding at 375px. New scenario "Hero heading responsive".
- **MODIFIED `Coaching Staff Display`** — added nested `overflow-x-auto` wrapper + `min-w-[640px] md:min-w-0` panel so the coaching table scrolls horizontally below `md`; header stays sticky. New scenario "Horizontal scroll on mobile".
- Preserved unchanged: Route Resolution, Hydration Gating, Team Lookup, Roster Display, Derived Treasury Display, Race-not-in-catalog Fallback.

### team-list → `openspec/specs/team-list.md`

- **MODIFIED `Home Heading with Create Action`** — below `md` the heading row wraps (`flex-wrap`) so h2 + CTA stack; CTA tap target ≥40px (`py-2.5`); card grid stays single-column by default. New scenario "Heading row wraps on mobile".
- Preserved unchanged: Detail Navigation Link, Preserved List Behavior, Empty States, Rulebook Card Presentation.

---

## 5. Task Completion Gate

All 13 tasks (Phases 1–6, tasks 1.1–6.3) are checked `[x]` in the persisted tasks.md.

**Exceptional archive-time reconciliation**: task **6.3** (manual 375px/390px real-browser QA of drawer open/close, table scrolls, hero/home readability) was the single default-`- [ ]` item. It is a **human/real-browser visual QA item**, not automatable under jsdom (per `apply-progress.md` and `verify-report.md`, both written at apply/verify time). The orchestrator explicitly instructed archive to reconcile it: the user reviewed and approved the first iteration, so 6.3 is not treated as a blocker. This is the exact `verify-report`-`apply-progress` proof required for such reconciliation. The reconciled `[x]` records the reason inline and this §5 records it for the audit trail.

The archived audit trail contains **no stale unchecked implementation boxes** — 13/13 `[x]`.

---

## 6. Final Harness Results

Source: `verify-report.md` (the change's persisted verification artifact) + the orchestrator's launch-prompt final-state handoff (highest-ranked account of the shipped state).

- **Unit**: `pnpm test` → 421 passed (20 files), 0 failed, 0 skipped (exit 0)
- **E2E**: 14/14 passed (`create-team.spec.ts`, Desktop Chrome 1280×720, untouched)
- **Type-check**: `npx tsc --noEmit` → exit 0, empty output
- **Lint**: `pnpm lint` → exit 0, no output
- **Requirements**: 9/9 compliant
- **Scenarios**: 29/29 compliant
- **Coverage**: not configured for this change (pure additive class/markup change; no gate)

---

## 7. Final-State Facts & Snapshot Reconciliation

`verify-report.md` (written at verification time) records **PASS** with 0 CRITICAL, 0 BLOCKER, and a single **WARNING**: task 6.3 (manual 375px/390px real-browser QA) had not yet been run — a human/browser item, not automatable in jsdom.

Per the orchestrator's final-state handoff (most recent authoritative account, outranking the verify snapshot), that warning is **behind the shipped state**: task 6.3 is a human verification item, and the **user reviewed and approved the first iteration**. Consequently it is recorded here as a **follow-up note only, not a blocker**. This archive report reflects the FINAL state: the change is closed with all automatable verification green and the single human-QA item acknowledged as reviewed/approved by the user.

**Follow-up note (not a blocker)**: a dedicated real-browser 375px/390px pass (drawer open/close ergonomics, the four nested table scrolls, hero/home readability) remains available for any future design change or regression sweep. It was not required to close this cycle because the user approved the first iteration.

No other verify warnings, blockers, or critical findings existed at verification time. No contradiction was unresolvable.

---

## 8. Commit History

| SHA | Subject | Notes |
|-----|---------|-------|
| `4fa057f` | feat(shell): add mobile drawer navigation with hamburger, scrim, and overlay sidebar | Config A drawer shell |
| `7b9634c` | feat(tables): add nested horizontal scroll to rulebook tables | RosterTable/PlayerAvailabilityTable/coaching wrap |
| `c04b243` | feat(mobile): wrap home heading and scale heroes for small screens | Home + heroes |
| `0466ee1` | docs(mobile-responsive): persist SDD apply-progress and task completion | Docs |
| `543605e` | docs(mobile-responsive): record verify PASS | Docs |
| `b5800fa` | Merge pull request #19 from Alountk/feat/mobile-responsive | Merge to `main` |

Review workload: single PR (#19), within the 400-line budget (≈300–400 estimated; `delivery_strategy = single-pr`, `chained PRs recommended = No`, risk Medium).

---

## 9. Delivery Notes

- Implementation merged to `main` via PR #19 (`b5800fa`). HEAD on main is `b5800fa` at archive time.
- PR reviewed and merged; no new npm dependencies added (Tailwind v4 utilities only).
- Rollback: revert PR #19. Additive class/markup + one AppShell state hook; no data migration, no store/schema change (localStorage untouched).

---

## 10. Non-Blocking Notes & Risks

- **Manual-QA follow-up** (task 6.3): deferred real-browser 375px/390px pass; user approved the first iteration, so it does not block close. See §7.
- Hamburger action is open-only (`onMenuClick = openMenu`), not a toggle: when the drawer is open the scrim/drawer (z-40/z-50) overlays the Topbar hamburger, so the same physical tap reaches the scrim and closes via that path. Verified behaviorally in verify-report; no action required.
- The mobile-wrap CTA test asserts Tailwind utility classes (`flex-wrap`, `py-2.5`) as the only reliable jsdom way to verify responsive presence; documented in design's testing strategy — implementation evidence, not a spec violation.
- No `openspec/config.yaml` exists in this repo, so no `rules.archive` constraints applied; the merge followed the existing repo archive precedent (see `2026-08-07-team-detail-rulebook/archive-report.md`).
