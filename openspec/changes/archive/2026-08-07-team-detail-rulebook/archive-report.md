# Archive Report — team-detail-rulebook

**Change**: team-detail-rulebook
**Closed**: 2026-08-07
**Status**: ✅ PASS WITH WARNINGS (single warning fixed in PR2) — SDD cycle complete
**Artifact store**: openspec (filesystem)

---

## 1. Change Summary

| Field | Value |
|-------|-------|
| Change name | `team-detail-rulebook` |
| Goal | Restyle the team detail view to Style A ("Todo libro") rulebook fidelity: navy hero, 3 Spanish book sections, coaching table with always-present Apotecario row, 3 treasury cards; make `RosterTable` read-only render the 10-column rulebook set without `CANT.` |
| Branch | `feat/detail-roster-format` (PR1 #13 → main, PR2 #15 stacked → main) |
| PR1 merge | `ca83ee4` (Merge PR #13, feat/detail-roster-pr1) |
| PR2 merge | `cc278c8` (Merge PR #15, feat/detail-roster-pr2) |
| Warning-fix commit | `8477c77` style(teams): gold treasury card value per rulebook design |
| Verify verdict | PASS WITH WARNINGS (0 CRITICAL, 0 BLOCKER, 1 WARNING at verification time) |
| Requirements | 9/9 compliant |
| Scenarios | 22/22 compliant |
| Unit tests | 396/396 passed (18 files) |
| E2E tests | 14/14 passed |
| Build / Type-check | ✅ (npx tsc --noEmit exit 0) |
| Lint | ✅ (pnpm lint exit 0) |
| Scope shipped | TeamDetailView Style A rewrite; RosterTable read-only 10-column contract; shared `features/teams/format.ts`; `LEAGUE_LABELS` Spanish mapping |

---

## 2. SDD Cycle Trace

| Phase | Artifact | Date | Status |
|-------|----------|------|--------|
| Propose | `openspec/changes/team-detail-rulebook/proposal.md` | 2026-08-07 | ✅ |
| Spec | `openspec/changes/team-detail-rulebook/specs/` (2 delta files) | 2026-08-07 | ✅ |
| Design | `openspec/changes/team-detail-rulebook/design.md` | 2026-08-07 | ✅ |
| Tasks | `openspec/changes/team-detail-rulebook/tasks.md` | 2026-08-07 | ✅ 13/13 |
| Apply | PR1 #13 + PR2 #15 (Engram apply-progress) | 2026-08-07 | ✅ |
| Verify | `openspec/changes/team-detail-rulebook/verify-report.md` | 2026-08-07 | ✅ PASS WITH WARNINGS |
| Archive | `openspec/changes/archive/2026-08-07-team-detail-rulebook/archive-report.md` (this file) | 2026-08-07 | ✅ |

Note: this change produced no `state.yaml` and no `apply-progress.md` in the change folder (concise single-cycle change; apply-progress was persisted to Engram and referenced by verify-report). The filesystem change folder ships proposal, specs, design, tasks, verify-report.

---

## 3. Artifacts Inventory

### Filesystem (openspec/)

| Artifact | Path | Status |
|----------|------|--------|
| Proposal | `openspec/changes/archive/2026-08-07-team-detail-rulebook/proposal.md` | ✅ |
| Spec delta — team-detail-view | `openspec/changes/archive/2026-08-07-team-detail-rulebook/specs/team-detail-view.md` | ✅ |
| Spec delta — roster-table | `openspec/changes/archive/2026-08-07-team-detail-rulebook/specs/roster-table/spec.md` | ✅ |
| Design | `openspec/changes/archive/2026-08-07-team-detail-rulebook/design.md` | ✅ |
| Tasks | `openspec/changes/archive/2026-08-07-team-detail-rulebook/tasks.md` | ✅ |
| Verify report | `openspec/changes/archive/2026-08-07-team-detail-rulebook/verify-report.md` | ✅ |
| Archive report | `openspec/changes/archive/2026-08-07-team-detail-rulebook/archive-report.md` | ✅ (this file) |

### Main Specs Synced

| Spec | Path | Action |
|------|------|--------|
| team-detail-view | `openspec/specs/team-detail-view.md` | Updated — 4 MODIFIED requirements applied (Identity Display, Roster Display, Coaching Staff Display, Derived Treasury Display); 4 preserved (Route Resolution, Hydration Gating, Team Lookup, Race-not-in-catalog Fallback) |
| roster-table | `openspec/specs/roster-table/spec.md` | Updated — 5 MODIFIED requirements applied (Rulebook Column Set and Order, Qty Derivation, Banner, Rulebook Footer, Totals Row); 6 preserved |

---

## 4. Spec Sync Details

### team-detail-view → `openspec/specs/team-detail-view.md`

Applied the 4 MODIFIED requirement blocks from the delta spec. Each replaced the prior main-spec requirement in place, carrying the `(Previously: ...)` parenthetical that documents the change:
- **Identity Display** — navy `#12225a` hero, bold race + Spanish league label, "Equipo listo" + gold "Tesorería" tags, league enum mapped to Spanish label, raw token never rendered.
- **Roster Display** — read-only `RosterTable` 10-column rulebook set (no `CANT.`), NOT passed `bannerText`/`apothecary`, "Plantilla" heading.
- **Coaching Staff Display** — "Cuerpo técnico" table with Concepto/Cantidad/Coste unitario/Total headers, zebra rows, always-present Apotecario row (SÍ green / NO), bold total row including the apothecary.
- **Derived Treasury Display** — `STARTING_TREASURY − rosterCost − coachingCost`, 3 cards, "Tesorería restante" gold `#d11938`.

All other requirements preserved unchanged: Route Resolution, Hydration Gating, Team Lookup, Race-not-in-catalog Fallback.

### roster-table → `openspec/specs/roster-table/spec.md`

Applied the 5 MODIFIED requirement blocks, replacing the prior in-place blocks:
- **Rulebook Column Set and Order** — read-only 10 `th scope="col"` headers omitting `CANT.` and the blank remove header (12 editable retained).
- **Qty Derivation** — Qty cell `{min}-{max}` in editable only; not rendered in read-only.
- **Banner** — editable-mode only (read-only suppresses the banner even when `bannerText` is provided).
- **Rulebook Footer** — read-only colSpans 4 + 6 = 10 (editable 5 + 6 + 1 = 12), present when `apothecary` provided including `false`.
- **Totals Row** — read-only navy row "{n} jugadores · Coste total" colSpans 7+1+2=10; editable keeps English + compact budget (12).

All other requirements preserved unchanged: Light Theme Isolation, Position Cell with Spanish Role Subtitle, Spanish Skill Names with English Fallback, Access Column Rendering, Cost Format, Accessibility and Consumer Contract Preservation.

---

## 5. Task Completion Gate

All 13 implementation tasks (Phases 1–4, tasks 1.1–4.1) were checked `[x]` in the persisted `tasks.md` with **0 unchecked** implementation boxes at archive time. No exceptional stale-checkbox reconciliation was required. The archived `tasks.md` reflects the final completed state.

---

## 6. Final Harness Results

Source: `verify-report.md` (committed in PR1 `22fd0ce`, the change's persisted verification artifact) + the orchestrator's launch-prompt final-state handoff (highest-ranked account of the final shipped state). The launch prompt confirmed the single verify warning was FIXED in a later PR2 commit.

- **Unit**: `pnpm test` → 396 passed (18 files), 0 failed, 0 skipped (exit 0)
- **E2E**: 14/14 passed (`create-team.spec.ts`, untouched)
- **Type-check**: `npx tsc --noEmit` → exit 0, empty output
- **Lint**: `pnpm lint` → exit 0
- **Requirements**: 9/9 compliant
- **Scenarios**: 22/22 compliant

---

## 7. Final-State Facts & Snapshot Reconciliation

`verify-report.md` (written at verification time, before the warning fix landed) records **PASS WITH WARNINGS** with a single WARNING: the "Tesorería restante" treasury-card value rendered navy `#12225a` instead of gold `#d11938`.

Per the orchestrator's final-state handoff (most recent authoritative account, outranking the verify snapshot), that single warning was **FIXED** in PR2 by commit `8477c77` "style(teams): gold treasury card value per rulebook design" (also referenced as `d8ae5f1` in the PR branch) and merged to main via PR #15 (`cc278c8`). **This archive report records the FINAL state: the treasury-card value is now gold `#d11938` as the spec/design mandate.**

**Code confirmation at archive time**: `features/teams/detail/TeamDetailView.tsx:161` renders the "Tesorería restante" card value with `text-[#d11938]` (gold). The fix is present on `main`.

No other verify warnings, blockers, or critical findings existed. The PASS WITH WARNINGS verdict's sole warning is resolved in the shipped state, so the close is clean.

---

## 8. Commit History

| # | SHA | Subject | Notes |
|---|-----|---------|-------|
| — | `ca83ee4` | Merge pull request #13 (feat/detail-roster-pr1 → main) | PR1 merge |
| 1 | `3e919cb` | feat(teams): add readOnly 10-column RosterTable contract for team detail | PR1 |
| 2 | `c5a62ab` | refactor(teams): extract formatRulebookCost into shared features/teams/format | PR1 |
| 3 | `22fd0ce` | docs(teams): record PR1 verify report for team-detail-rulebook | PR1 |
| — | `cc278c8` | Merge pull request #15 (feat/detail-roster-pr2 → main) | PR2 merge |
| 4 | `c24bbe4` | feat(teams): restyle TeamDetailView to Style A rulebook layout | PR2 |
| 5 | `8477c77` | style(teams): gold treasury card value per rulebook design | PR2 — fixes verify WARNING |

Review workload: PR1 (RosterTable readOnly + format.ts) + PR2 (TeamDetailView Style A) split per the tasks `delivery_strategy = ask-on-risk` / `chained PRs recommended = Yes` forecast. Both PRs reviewable; the oversized single-view rewrite was isolated in PR2.

---

## 9. Delivery Notes

- Implementation merged to `main` via PR #13 (`ca83ee4`) and PR #15 (`cc278c8`). HEAD on main is `cc278c8`.
- Both PRs reviewed and merged; no new npm dependencies added.
- Rollback: revert the PR1 + PR2 commit ranges (UI-only restyle; no migration/data impact). `git revert` of the two merge commits suffices.

---

## 10. Non-Blocking Notes & Risks

- The archive-time code check confirmed the gold `#d11938` fix on `main` (`TeamDetailView.tsx:161`), so no open cosmetic deviation remains from the single verify warning.
- `apply-progress` for this change lived in Engram (referenced by verify-report's TDD section); the change folder shipped concise proposal/specs/design/tasks/verify-report without a filesystem `state.yaml`/`apply-progress.md`, consistent with the pattern used for smaller, single-cycle changes. No blocker.
- Design open question "League label wording is product content" (design.md:102) is a pinned-display-string note, not a defect; values "Liga Abierta"/"Exhibición" are one-string changes if the user prefers alternatives later.
