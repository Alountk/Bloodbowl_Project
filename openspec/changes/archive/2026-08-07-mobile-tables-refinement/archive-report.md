# Archive Report — mobile-tables-refinement

**Change**: mobile-tables-refinement
**Closed**: 2026-08-07
**Status**: ✅ PASS — SDD cycle complete (receipt-driven review disabled by explicit maintainer decision)
**Artifact store**: openspec (filesystem)

---

## 1. Change Summary

| Field | Value |
|-------|-------|
| Change name | `mobile-tables-refinement` |
| Goal | Refine the mobile experience of the team roster and availability tables: render stacked row-cards/rows below `md` (replacing the nested horizontal-scroll wrapper on mobile), wrap the native Race and League selects in a relative div with a separate chevron element and `font-size:16px`, and add the `useIsDesktop` hook to gate exactly one render branch per viewport |
| Branch | `feat/mobile-tables-refinement` |
| PR merge | `4d1b0eb` (Merge pull request #20) |
| Verify verdict | ✅ PASS (0 CRITICAL, 0 BLOCKER) |
| Requirements | 8/8 delta requirements compliant |
| Scenarios | 22/22 compliant |
| Unit tests | 446/446 passed (21 files) |
| E2E tests | 19/19 passed (14 Desktop Chrome 1280 + 5 mobile 375×812) |
| Build / Type-check | ✅ (`npx tsc --noEmit` exit 0) |
| Lint | ✅ (`pnpm lint` exit 0) |
| Scope shipped | `useIsDesktop` hook + `mockMatchMedia` util; RosterTable desktop vs mobile stacked row-cards (single branch); PlayerAvailabilityTable desktop vs mobile stacked rows; `SelectWithChevron` for Race + League type; new mobile Playwright project (375×812) |

---

## 2. SDD Cycle Trace

| Phase | Artifact | Date | Status |
|-------|----------|------|--------|
| Propose | `openspec/changes/mobile-tables-refinement/proposal.md` | 2026-08-08 | ✅ |
| Spec | `openspec/changes/mobile-tables-refinement/specs/` (3 delta files) | 2026-08-08 | ✅ |
| Design | `openspec/changes/mobile-tables-refinement/design.md` | 2026-08-08 | ✅ |
| Tasks | `openspec/changes/mobile-tables-refinement/tasks.md` | 2026-08-08 | ✅ 19/19 |
| Apply | `openspec/changes/mobile-tables-refinement/apply-progress.md` | 2026-08-08 | ✅ |
| Verify | `openspec/changes/mobile-tables-refinement/verify-report.md` | 2026-08-08 | ✅ PASS |
| Archive | `openspec/changes/archive/2026-08-07-mobile-tables-refinement/archive-report.md` (this file) | 2026-08-08 | ✅ |

Note: this change produced no `state.yaml` (consistent with the repo's concise single-cycle change pattern). The folder ships proposal, specs, design, tasks, apply-progress, verify-report, archive-report.

---

## 3. Artifacts Inventory

### Filesystem (openspec/)

| Artifact | Path | Status |
|----------|------|--------|
| Proposal | `openspec/changes/archive/2026-08-07-mobile-tables-refinement/proposal.md` | ✅ |
| Spec delta — roster-table | `openspec/changes/archive/2026-08-07-mobile-tables-refinement/specs/roster-table/spec.md` | ✅ |
| Spec delta — create-team | `openspec/changes/archive/2026-08-07-mobile-tables-refinement/specs/create-team/spec.md` | ✅ |
| Spec delta — team-detail-view | `openspec/changes/archive/2026-08-07-mobile-tables-refinement/specs/team-detail-view/spec.md` | ✅ |
| Design | `openspec/changes/archive/2026-08-07-mobile-tables-refinement/design.md` | ✅ |
| Apply progress | `openspec/changes/archive/2026-08-07-mobile-tables-refinement/apply-progress.md` | ✅ |
| Tasks | `openspec/changes/archive/2026-08-07-mobile-tables-refinement/tasks.md` | ✅ |
| Verify report | `openspec/changes/archive/2026-08-07-mobile-tables-refinement/verify-report.md` | ✅ |
| Archive report | `openspec/changes/archive/2026-08-07-mobile-tables-refinement/archive-report.md` | ✅ (this file) |

### Main Specs Synced

| Spec | Path | Action |
|------|------|--------|
| roster-table | `openspec/specs/roster-table/spec.md` | Updated — 1 ADDED (Mobile Stacked Row-Cards) + 1 MODIFIED (Scrollable Roster Table) + 1 REMOVED (Horizontal scroll on mobile scenario); 11 preserved |
| create-team | `openspec/specs/create-team/spec.md` | Updated — 2 ADDED (Native Select Wrapper with Chevron Element, Mobile Availability Stacked Rows) + 1 MODIFIED (Jugadores Disponibles Availability Table); 7 preserved |
| team-detail-view | `openspec/specs/team-detail-view.md` | Updated — 1 ADDED (Mobile ReadOnly Roster Inherits Row-Cards) + 1 MODIFIED (Coaching Staff Display); 7 preserved |

The separate `use-is-desktop` main spec (`openspec/specs/use-is-desktop/spec.md`) is a supporting capability spec, NOT part of this change's delta spec set. It predates this change's archive and is not synced by it.

---

## 4. Spec Sync Details

### roster-table → `openspec/specs/roster-table/spec.md`

- **ADDED `Mobile Stacked Row-Cards`** — below `md` RosterTable renders stacked row-cards (one per player) instead of the book table, no horizontal scroll, no chevron/expand; name line, subtitle, stats chips MV FU AG PS AR, labeled SKILLS (Spanish, "Ninguna" fallback)/PRIMARIAS/SECUNDARIAS, cost line; editable keeps rename/remove. 4 scenarios.
- **MODIFIED `Scrollable Roster Table`** — outer container `max-h-[55vh] overflow-auto`; desktop branch adds nested `overflow-x-auto` + `min-w-[640px]` panel + sticky `top-0 z-10` headers; mobile branch renders stacked row-cards with NO book table/wrapper/min-w panel. Carries `(Previously: …)` note. 3 scenarios (old `Horizontal scroll on mobile` scenario now split into desktop-preserved + mobile-stacked).
- **REMOVED `Horizontal scroll on mobile`** — the old mobile horizontal-scroll scenario is deleted, `(Reason: mobile now renders stacked row-cards instead of a horizontally-scrolling book table.)`, `(Migration: replaced by the "Mobile Stacked Row-Cards" requirement and the mobile scenario of "Scrollable Roster Table".)`.
- Preserved unchanged: Light Theme Isolation, Rulebook Column Set and Order, Qty Derivation, Editable POSICIÓN Subtext, Position Cell with Spanish Role Subtitle, Spanish Skill Names with English Fallback, Access Column Rendering, Cost Format, Banner, Rulebook Footer, Totals Row, Accessibility and Consumer Contract Preservation.

### create-team → `openspec/specs/create-team/spec.md`

- **ADDED `Native Select Wrapper with Chevron Element`** — Race + League selects wrapped in `relative` div with separate `pointer-events: none` chevron element (not background-image) for Samsung Android; `font-size:16px` to prevent iOS auto-zoom; labels/handlers/`aria-label="League type"` preserved. 2 scenarios.
- **ADDED `Mobile Availability Stacked Rows`** — below `md` the availability table renders stacked rows (name, subtitle, counter `{n}/{max}` with always-visible "+ Add", stats chips, labeled rows); row disappears at max; Add disabled (row visible) when over budget. 4 scenarios.
- **MODIFIED `Jugadores Disponibles Availability Table`** — desktop branch keeps nine rulebook headers + `formatRulebookCost` + `{n}/{max}` counter + "Add {positional.name}" + `overflow-x-auto` + `min-w-[640px]` + sticky headers; mobile branch renders stacked rows per the ADDED requirement. Carries `(Previously: …)` note. 3 scenarios.
- Preserved unchanged: Two-Step Wizard Navigation, Responsive Step 2 Hero and Panels, Step 2 Plantilla Section, Default Player Naming, Editable POSICIÓN Subtext, Coaching Staff English Labels, Submit Team.

### team-detail-view → `openspec/specs/team-detail-view.md`

- **ADDED `Mobile ReadOnly Roster Inherits Row-Cards`** — readOnly `RosterTable` inherits the mobile stacked row-card rendering below `md` and the desktop book table at/above `md`; NOT passed `bannerText`/`apothecary`, so no banner/footer on either branch. 2 scenarios.
- **MODIFIED `Coaching Staff Display`** — desktop branch uses nested `overflow-x-auto` + `min-w-[640px]` panel; mobile branch renders stacked rows (label + quantity × unit cost, total right; Apotecario SÍ/NO; bold total) with NO table/wrapper/min-w panel — no horizontal overflow allowed on mobile. Carries `(Previously: …)` note. 4 scenarios.
- Preserved unchanged: Route Resolution, Hydration Gating, Team Lookup, Identity Display, Roster Display, Derived Treasury Display, Race-not-in-catalog Fallback.

---

## 5. Task Completion Gate

All 19 implementation tasks (Phases 1–6, tasks 1.1–6.3) were checked `[x]` in the persisted `tasks.md` with **0 unchecked** implementation boxes at archive time. No exceptional stale-checkbox reconciliation was required. The archived `tasks.md` reflects the final completed state.

---

## 6. Final Harness Results

Source: `verify-report.md` (the change's persisted verification artifact) + the orchestrator's launch-prompt final-state handoff (most recent authoritative account of the shipped state — change merged to `main` via PR #20 `4d1b0eb`, working tree functionally clean).

- **Unit**: `pnpm test` → 446 passed (21 files), 0 failed, 0 skipped (exit 0)
- **E2E**: 19/19 passed (14 Desktop Chrome 1280 + 5 mobile Chromium 375×812 via new `mobile` Playwright project)
- **Type-check**: `npx tsc --noEmit` → exit 0, empty output
- **Lint**: `pnpm lint` → exit 0, no output
- **Requirements**: 8/8 delta requirements compliant
- **Scenarios**: 22/22 compliant
- **Coverage**: not configured (`@vitest/coverage-v8` absent); informational only, never blocking

---

## 7. Native Review Receipt Gate & Final-State Facts

The dispatcher (`gentle-ai sdd-status --json --instructions`) reported `reviewGate.result: invalidated` with no review receipt/ledger/policy/state artifacts present in the change folder. A terminal review receipt was not producible because the user explicitly disabled receipt-driven review for this already-merged change: `gentle-ai review mode disable` (global scope). Verified at archive time: `gentle-ai review mode status` → `receipt-driven development: off (decided by global)`, `global: off`.

Per the skill's Native Review Receipt Gate, with the kill switch off and no review governing this change, `reviewGate.delivery` is in the `disabled/unmanaged` relaxation: demanding a terminal receipt here would demand one that `review start` is refused from producing — a deadlock, not a safeguard. There are no explicit review artifacts (receipt/ledger) that failed validation; the dispatcher's `invalidated` reflects the absence of a valid receipt under the disabled regime, not a rejected review artifact. The gate therefore proceeds under the `disabled/unmanaged` relaxation (orchestrator-confirmed explicit maintainer decision). No fabrication of an `allow` state occurred.

### Verify-report count correction (final state)

`verify-report.md` was corrected at archive preparation time (working-tree modification, uncommitted — commits are owned by the orchestrator): requirements **8/8**, scenarios **22/22**. These are the delta-headed counts (3 create-team + 3 roster-table + 2 team-detail-view; scenarios 9+7+6). The earlier 11/29 counts wrongly included the separate `use-is-desktop` main spec as if part of this change's delta set. The final counts reflect only this change's delta specs. The verify-report explicitly flags the `use-is-desktop` main spec as "separate".

### WARNING carried (non-blocking, from verify-report at verification time)

`verify-report` recorded one WARNING: `design.md`/`proposal.md` still describe coaching as "out of scope / keep horizontal scroll on mobile", but bugfix `9c9d342` converted detail-view coaching to a mobile stacked branch that the updated spec requires. The implementation matches the (updated) spec; the design artifact was not updated (spec > design; benign to verdict, 0 CRITICAL). This is recorded as a documented non-blocking deviation, consistent with the archive precedent (`2026-08-07-mobile-responsive` archives carried similar design-staleness notes). No blocker.

Additional benign documented deviations (from verify-report, all WARNING/SUGGESTION grade, none blocking): `text-[16px]` asserted via className (jsdom can't compute Tailwind computed style); mobile availability subtitle renders `(race, rol)` + cost as sibling text nodes joined by ` · `; no dedicated `mockMatchMedia(false)` unit test for the coaching mobile branch (covered by mobile e2e + source inspection).

---

## 8. Commit History

| SHA | Subject | Notes |
|-----|---------|-------|
| `ab5f587` | docs(mobile-tables): record apply-progress and SDD artifacts | Docs |
| `78bea6c` | docs(mobile-tables): record verify PASS | Docs |
| `9c9d342` | fix(mobile): eliminate horizontal overflow in detail coaching and scroll wrappers | Bugfix — coaching mobile stacked branch, desktop `md:min-w-0` removal |
| `18d3c7e` | docs(mobile-tables): record re-verify PASS after overflow fix | Docs — re-verify |
| `4d1b0eb` | Merge pull request #20 from Alountk/feat/mobile-tables-refinement | Merge to `main` |

Review workload: single PR (#20), within the 400-line budget (`delivery_strategy = single-pr`, `chained PRs recommended = No`). Uncommitted working-tree modification: `verify-report.md` count correction (8/8, 22/22) — intentionally left uncommitted for the orchestrator.

---

## 9. Delivery Notes

- Implementation merged to `main` via PR #20 (`4d1b0eb`). HEAD on main is `4d1b0eb` at archive time.
- PR reviewed and merged; no new npm dependencies added (`useIsDesktop` hook + Tailwind v4 utilities + Playwright mobile project only).
- Rollback: revert PR #20 (`git revert 4d1b0eb`). UI-only change; no data migration, no store/schema change (localStorage untouched).

---

## 10. Non-Blocking Notes & Risks

- **Design doc staleness** (follow-up, not a blocker): `design.md`/`proposal.md` describe coaching as unchanged/out-of-scope while the shipped implementation (confirmed by spec + verify-report + mobile e2e) added a mobile stacked coaching branch. Spec > design; the design artifact was not updated. If any future change re-opens the detail coaching area, update `design.md` to reflect the shipped mobile stacked branch.
- **Coaching mobile unit-test gap** (suggestion): the coaching mobile stacked branch is verified by mobile e2e + source inspection rather than a dedicated `mockMatchMedia(false)` unit test; a future UNIT test would harden regression coverage.
- **Coverage tooling** (`@vitest/coverage-v8`) not installed — a per-branch coverage gate would harden future mobile-branch changes; informational.
- No `openspec/config.yaml` exists in this repo, so no `rules.archive` constraints applied; the merge followed the existing repo archive precedent (`2026-08-07-team-detail-rulebook`, `2026-08-07-mobile-responsive`).
