# Archive Report — web-shell-rulebook

**Change**: web-shell-rulebook
**Closed**: 2026-08-07
**Status**: ✅ PASS — SDD cycle complete (no blockers, no CRITICAL; 2 non-blocking WARNINGs carried)
**Artifact store**: openspec (filesystem)

---

## 1. Change Summary

| Field | Value |
|-------|-------|
| Change name | `web-shell-rulebook` |
| Goal | Canonical light rulebook web shell (**Config C**, user-approved): design tokens, root layout light body base, white Sidebar (navy "BLOODBOWL" wordmark + red "Teams" tag + Teams-only nav), and white Topbar (navy h1 "Bloodbowl Teams") wrapping every route. Search form lives in the Topbar but renders ONLY on the home route `/`. TeamList home restructure (book heading + "Create New Team" CTA, square rulebook cards, light empty states); light square not-found panel. |
| Branch | main (PR #17 merged) |
| PR merge | #17 — `web-shell-rulebook` delivered to main; verify PASS |
| Verify verdict | **PASS** — 7/7 requirements, 15/15 scenarios (12 automated + 3 declared visual/manual), 412 unit + 14 e2e green, tsc/lint clean, 0 blockers |
| Requirements | 7/7 (app-shell 4 req / 9 scenarios; team-list delta 3 req / 6 scenarios) |
| Scenarios | 15/15 (12 COMPLIANT with runtime evidence + 3 PARTIAL styling/manual per spec-declared coverage) |
| Unit tests | 412/412 passed (19 files) |
| E2E tests | 14/14 passed |
| Build / Type-check | ✅ (`npx tsc --noEmit` exit 0) |
| Lint | ✅ (`pnpm lint` exit 0) |
| Scope shipped | full-light shell (body `#f8fafc`; white sidebar navy wordmark + red Teams tag + Teams-only nav; white topbar navy h1 + route-conditional search on `/` only); TeamList home heading CTA + square rulebook cards + light empty states; team not-found light square panel |

---

## 2. SDD Cycle Trace

| Phase | Artifact | Date | Status |
|-------|----------|------|--------|
| Explore | `openspec/changes/archive/2026-08-07-web-shell-rulebook/exploration.md` | 2026-08-07 | ✅ |
| Propose | `openspec/changes/archive/2026-08-07-web-shell-rulebook/proposal.md` | 2026-08-07 | ✅ |
| Spec | `openspec/changes/archive/2026-08-07-web-shell-rulebook/specs/` (2 delta files: `app-shell/spec.md`, `team-list.md`) | 2026-08-07 | ✅ |
| Design | `openspec/changes/archive/2026-08-07-web-shell-rulebook/design.md` | 2026-08-07 | ✅ |
| Tasks | `openspec/changes/archive/2026-08-07-web-shell-rulebook/tasks.md` | 2026-08-07 | ✅ 14/14 |
| Apply | `openspec/changes/archive/2026-08-07-web-shell-rulebook/apply-progress.md` | 2026-08-07 | ✅ |
| Verify | `openspec/changes/archive/2026-08-07-web-shell-rulebook/verify-report.md` | 2026-08-07 | ✅ PASS |
| Archive | `openspec/changes/archive/2026-08-07-web-shell-rulebook/archive-report.md` (this file) | 2026-08-07 | ✅ |

---

## 3. Artifacts Inventory

### Filesystem (openspec/)

| Artifact | Path | Status |
|----------|------|--------|
| Exploration | `openspec/changes/archive/2026-08-07-web-shell-rulebook/exploration.md` | ✅ |
| Proposal | `openspec/changes/archive/2026-08-07-web-shell-rulebook/proposal.md` | ✅ |
| Spec delta — app-shell | `openspec/changes/archive/2026-08-07-web-shell-rulebook/specs/app-shell/spec.md` | ✅ |
| Spec delta — team-list | `openspec/changes/archive/2026-08-07-web-shell-rulebook/specs/team-list.md` | ✅ |
| Design | `openspec/changes/archive/2026-08-07-web-shell-rulebook/design.md` | ✅ |
| Tasks | `openspec/changes/archive/2026-08-07-web-shell-rulebook/tasks.md` | ✅ |
| Apply progress | `openspec/changes/archive/2026-08-07-web-shell-rulebook/apply-progress.md` | ✅ |
| Verify report | `openspec/changes/archive/2026-08-07-web-shell-rulebook/verify-report.md` | ✅ |
| Archive report | `openspec/changes/archive/2026-08-07-web-shell-rulebook/archive-report.md` | ✅ (this file) |

Note: this change folder ships `exploration.md` and `apply-progress.md` in addition to the standard proposal/specs/design/tasks/verify-report — the change includes an explore phase and apply-progress persisted to the filesystem.

### Main Specs Synced

| Spec | Path | Action |
|------|------|--------|
| app-shell | `openspec/specs/app-shell/spec.md` | **Created** — new capability; main spec did not exist, so the full delta spec was copied verbatim as source of truth (4 requirements / 9 scenarios) |
| team-list | `openspec/specs/team-list.md` | **Updated** — 3 ADDED requirement blocks appended; 2 existing requirements preserved (total 5) |

---

## 4. Spec Sync Details

### app-shell → `openspec/specs/app-shell/spec.md` (NEW capability)

Main spec `openspec/specs/app-shell/spec.md` did not exist. Per OpenSpec convention, the delta spec (a full spec with plain Requirements, no ADDED/MODIFIED/REMOVED sections) was copied verbatim as the source of truth. Contents (4 requirements / 9 scenarios):

- **Design Tokens** — canonical rulebook-light tokens: navy `#12225a`, red `#d11938`, body background `#f8fafc`, border `#e2e8f0`, slate text scale, panel shadow `0 4px 8px rgba(0,0,0,0.1)`, zebra `#e6eef5`. Shell components MUST use them; other rulebook surfaces SHOULD converge.
- **Light Body Layout** — root layout body `bg-[#f8fafc]` with `text-slate-900`; `main` inherits light background; no content MUST depend on a dark body for legibility.
- **Sidebar Structure** — white `<aside aria-label="Sidebar">` with `border-slate-200` right border; navy "BLOODBOWL" wordmark + red "Teams" tag + Teams-only nav (single link to `/`); active `bg-[#12225a] text-white`, hover `bg-slate-100`. (Supersedes earlier dark two-item sidebar — `(Previously: ...)` clause retained.)
- **Topbar with Route-Conditional Search** — white header, navy h1 "Bloodbowl Teams"; search form `role="search"` + `aria-label="Search teams"` renders only when `usePathname() === "/"`; filtering behavior unchanged.

### team-list → `openspec/specs/team-list.md`

Applied the delta's `## ADDED Requirements` into the existing flat main spec. Preserved both existing requirements verbatim (`Detail Navigation Link`, `Preserved List Behavior`) and appended 3 new requirements (total 5):

- **Home Heading with Create Action** — h2 "Teams" navy `#12225a` + red `#d11938` underline (book section style); right navy "Create New Team" link → `/teams/create`.
- **Empty States** — light square book panels: no-teams shows "No teams yet. Create your first team." + navy CTA; no-match shows "No teams match your search." without CTA.
- **Rulebook Card Presentation** — `rounded-none` white card, `h-[6px]` navy top band with `2px` red bottom border, navy name / slate-500 race / slate-400 summary; grid, link-to-detail, and keyboard focus unchanged.

No REMOVED or RENAMED requirements in this delta.

---

## 5. Task Completion Gate

All 14 implementation tasks (Phases 1–4, tasks 1.1–4.1) were checked `[x]` in the persisted `tasks.md` with **0 unchecked** implementation boxes at archive time. No exceptional stale-checkbox reconciliation was required. The archived `tasks.md` reflects the final completed state (14/14).

---

## 6. Final Harness Results

Source: `verify-report.md` (the change's persisted verification artifact) corroborated by the orchestrator's launch-prompt final-state handoff (highest-ranked account of the final shipped state). The final Verify verdict is **PASS** with **0 blockers** — a clean pass snapshot with no CRITICAL findings. Verify was run against the merged state on `main` (PR #17).

- **Unit**: `pnpm test` → 412 passed (19 files), 0 failed, 0 skipped (exit 0)
- **E2E**: 14/14 passed (`e2e/create-team.spec.ts`)
- **Type-check**: `npx tsc --noEmit` → exit 0, empty output
- **Lint**: `pnpm lint` → exit 0
- **Requirements**: 7/7 compliant
- **Scenarios**: 15/15 covered (12 COMPLIANT with runtime evidence; 3 PARTIAL — visual/styling per spec-declared coverage, no runtime color assertions needed)

---

## 7. Final-State Facts & Snapshot Reconciliation

`verify-report.md` IS a final-state snapshot here: it records **PASS** with 0 blockers, 0 CRITICAL, and 2 non-blocking WARNINGs at verification time. No later fixes were required after verification was persisted, so the final state matches the verify snapshot without reconciliation. Launch-prompt final-state facts match verify exactly (7 req / 15 scenarios, 412 unit + 14 e2e green, tsc/lint clean, 0 blockers).

**Carried non-blocking WARNINGs** (no code change needed; behavior fully covered):

1. **TDD triangulation verbal claim (Task 1.3)** — task claims "3 cases" for the Topbar suite but it has 2 test blocks; the heading-always behavior is asserted within the off-home test. Report-level wording imprecision only; behavior fully covered.
2. **Pre-existing `act(...)` warnings** in TeamList tests — declared pre-existing in apply-progress; not introduced by this change.

**No blocked tasks, no open gaps, no conflicting-final-state contradiction requires recording.** The 3 PARTIAL scenarios (Design Tokens visual, Light Body Layout manual, Active/hover static) are spec-declared manual/visual coverage per the delta's Test Coverage table, not defects.

---

## 8. Commit History

| SHA | Subject | Notes |
|-----|---------|-------|
| (PR #17) | `web-shell-rulebook` — rulebook light web shell | delivered to main; verify PASS on merged state |
| `Merge pull request #17 → main` | final verified implementation | archived from `main` |

Review workload: PR #17 = 211 authored changed lines (non-docs) — well under the 400-line budget; matches the "Low" risk forecast. Delivery strategy: `single-pr` (valid domain value). No chained/stacked PRs needed.

---

## 9. Delivery Notes

- Implementation delivered to `main` via PR #17. The final state on main reflects the user-approved Config C full-light shell.
- **Implementation scope shipped** (from design.md + verify correctness evidence):
  - `app/layout.tsx` — body → `min-h-screen bg-[#f8fafc] text-slate-900 antialiased`; `main` inherits light background.
  - `components/Sidebar.tsx` — white `bg-white border-r border-slate-200`; navy "BLOODBOWL" + red "Teams" tag; `NAV_ITEMS = [{ href: "/", label: "Teams" }]`; active via `usePathname() === item.href` (`bg-[#12225a] text-white`), inactive `text-slate-600 hover:bg-slate-100 hover:text-[#12225a]`; `aria-label="Sidebar"` preserved.
  - `components/Topbar.tsx` — white `border-b border-slate-200`; navy h1 "Bloodbowl Teams"; search `<form role="search">` renders only when `usePathname() === "/"`; light input classes; `aria-label="Search teams"` preserved.
  - `features/teams/TeamList.tsx` — heading row (navy h2 "Teams" + red underline + right navy "Create New Team" Link → `/teams/create`); `rounded-none` square rulebook cards (navy `h-[6px]` top band + red `border-b-2`, navy name / slate-500 race / slate-400 summary), grid + Link + focus preserved; light square empty states (no-teams with CTA; no-match without CTA).
  - `app/teams/[teamId]/not-found.tsx` — light square panel: navy h2 "Team not found" + red underline, message, navy "Back to teams" Link → `/`; texts/roles preserved.
  - Tests: `vi.mock("next/navigation", () => ({ usePathname: () => "/" }))` added to `app/page.test.tsx` / `features/teams/TeamList.test.tsx`; new Topbar route-conditional search, sidebar Teams-only, home CTA assertions.
- Out-of-scope untouched (zero git diff across change range): `features/teams/create`, `features/teams/detail`, `features/teams/roster-table`; `e2e/create-team.spec.ts` unchanged.
- No new npm dependencies added.
- Rollback: `git revert` of the PR #17 merge (UI-only shell restyle; no migration/data impact).

---

## 10. Non-Blocking Notes & Risks

- New **source-of-truth spec**: `openspec/specs/app-shell/spec.md` (capability: canonical light rulebook web shell). This is the baseline for any future shell/layout change.
- `openspec/specs/team-list.md` now reflects the rulebook home contract (heading CTA, empty states, square cards). Any future TeamList change must consult both the preserved `Detail Navigation Link`/`Preserved List Behavior` requirements and the new home/heading/card/empty-state requirements.
- Token convergence note: shell components MUST use the canonical tokens; other rulebook-light surfaces SHOULD converge on them (Design Tokens requirement).
- No open cosmetic deviations, no unresolved verify warnings, no risks blocking future SDD cycles.
