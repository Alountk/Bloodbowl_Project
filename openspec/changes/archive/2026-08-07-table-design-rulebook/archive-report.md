# Archive Report — table-design-rulebook

**Change**: table-design-rulebook
**Closed**: 2026-08-07
**Status**: ✅ PASS — SDD cycle complete
**Artifact store**: openspec (filesystem)

---

## 1. Change Summary

| Field | Value |
|-------|-------|
| Change name | `table-design-rulebook` |
| Goal | Restyle `RosterTable` (both modes) to rulebook fidelity: light theme, Spanish column set and skills, Qty + Access columns, name+role subtitle, banner + footer; add `min` / `accessPrimary` / `accessSecondary` data to all positionals |
| Branch | `feat/table-rulebook-ui` (PR1 `feat/table-rulebook-data` merged to main, PR2 UI stacked) |
| PR1 commits | `fbb91cf`, `b60945f`, `4d3828d`, merge `00d0eda` (#10) |
| PR2 commits | `522901e`, `62feb14`, `acc62d6`, `456a7b0` |
| Verify verdict | PASS (0 CRITICAL, 0 WARNING, 0 BLOCKER) |
| Requirements | 13/13 compliant |
| Scenarios | 31/31 compliant |
| Unit/integration tests | 391/391 passed (17 files) |
| E2E tests | 14/14 passed |
| Build / Type-check | ✅ (tsc --noEmit exit 0) |
| Lint | ✅ (exit 0) |
| Scope shipped | 30 races / 144 positionals access data; RosterTable rulebook UI + CreateTeamForm/TeamDetailView consumers |

---

## 2. SDD Cycle Trace

| Phase | Artifact | Date | Status |
|-------|----------|------|--------|
| Explore | `openspec/changes/table-design-rulebook/exploration.md` | 2026-08-07 | ✅ |
| Propose | `openspec/changes/table-design-rulebook/proposal.md` | 2026-08-07 | ✅ |
| Spec | `openspec/changes/table-design-rulebook/specs/` (3 files) | 2026-08-07 | ✅ |
| Design | `openspec/changes/table-design-rulebook/design.md` | 2026-08-07 | ✅ |
| Tasks | `openspec/changes/table-design-rulebook/tasks.md` | 2026-08-07 | ✅ |
| Apply | (Engram #135 apply-progress; commits PR1 + PR2) | 2026-08-07 | ✅ 12/12 tasks |
| Verify | `openspec/changes/table-design-rulebook/verify.md` | 2026-08-07 | ✅ PASS |
| Archive | `openspec/changes/archive/2026-08-07-table-design-rulebook/archive-report.md` (this file) | 2026-08-07 | ✅ |

---

## 3. Artifacts Inventory

### Filesystem (openspec/)

| Artifact | Path | Status |
|----------|------|--------|
| Exploration | `openspec/changes/archive/2026-08-07-table-design-rulebook/exploration.md` | ✅ |
| Proposal | `openspec/changes/archive/2026-08-07-table-design-rulebook/proposal.md` | ✅ |
| Spec — roster-table | `openspec/changes/archive/2026-08-07-table-design-rulebook/specs/roster-table/spec.md` | ✅ |
| Spec delta — team-detail-view | `openspec/changes/archive/2026-08-07-table-design-rulebook/specs/team-detail-view.md` | ✅ |
| Spec delta — race-data-bb2025 | `openspec/changes/archive/2026-08-07-table-design-rulebook/specs/race-data-bb2025/spec.md` | ✅ |
| Design | `openspec/changes/archive/2026-08-07-table-design-rulebook/design.md` | ✅ |
| Tasks | `openspec/changes/archive/2026-08-07-table-design-rulebook/tasks.md` | ✅ |
| Verify report | `openspec/changes/archive/2026-08-07-table-design-rulebook/verify.md` | ✅ |
| Archive report | `openspec/changes/archive/2026-08-07-table-design-rulebook/archive-report.md` | ✅ (this file) |

### Main Specs Synced

| Spec | Path | Action |
|------|------|--------|
| roster-table | `openspec/specs/roster-table/spec.md` | Created (new capability — delta IS a full spec; copied directly) |
| team-detail-view | `openspec/specs/team-detail-view.md` | Updated — "Roster Display" requirement MODIFIED to rulebook columns/theme/Spanish + `bannerText`/`apothecary` (flat file) |
| race-data-bb2025 | `openspec/specs/race-data-bb2025/spec.md` | Created REQ-RACE-07 (ADDED: `min`, `accessPrimary`, `accessSecondary` ⊆ {G,A,P,S,M,F}); purpose line reconciled to 30 lists |

---

## 4. Spec Sync Details

### roster-table → `openspec/specs/roster-table/spec.md`

No prior main spec existed. The delta spec is the initial/full contract for the new capability and was copied directly to `openspec/specs/roster-table/spec.md`. Contains 11 requirements and 22 scenarios covering: Light Theme Isolation, Rulebook Column Set/Order (ES headers `CANT.|POSICIÓN|COSTE|MV|FU|AG|PS|AR|HABILIDADES Y RASGOS|PRIMARIAS|SECUNDARIAS`, +blank editable th), Qty Derivation (`{min}-{max}`, min default 0), Position Cell with Spanish Role Subtitle (`(Raza, Rol)`), Spanish Skill Names with English fallback ("Ninguna" on empty), Access Column Rendering, Cost Format (`formatRulebookCost` "50 000"; budget keeps `formatGold`), Banner, Rulebook Footer, Totals Row, Accessibility & Consumer Contract Preservation.

### team-detail-view → `openspec/specs/team-detail-view.md`

Applied the MODIFIED "Roster Display" requirement (delta form, `specs/team-detail-view.md`). Replaced the prior 1-scenario block with the v2 3-scenario version (Valid roster display / Read-only rulebook presentation / Read-only totals preserved). All other requirements (Route Resolution, Hydration Gating, Team Lookup, Identity Display, Coaching Staff Display, Derived Treasury Display, Race-not-in-catalog Fallback) preserved unchanged. The main spec is a flat file per repo layout.

### race-data-bb2025 → `openspec/specs/race-data-bb2025/spec.md`

Applied the ADDED requirement REQ-RACE-07 (6 scenarios) covering the two-array access model. REQ-RACE-01..06 preserved unchanged. Purpose statement reconciled from "26 core races" to "30 team lists discovered ... ~144 positionals" to reflect the final shipped data scope (the prior count was stale relative to the merged REQ-RACE-07 which cites the 30-list catalog).

---

## 5. Task Completion Gate

All 12 implementation tasks (Phases 1–4) were checked `[x]` in the persisted `tasks.md` with **0 unchecked** boxes at archive time. No exceptional stale-checkbox reconciliation was required. The archived `tasks.md` reflects the final completed state.

---

## 6. Final Harness Results

Source: `verify.md` (final, committed in `456a7b0`) — highest-ranked artifact for final harness results; corroborated by the orchestrator's launch-prompt final-state handoff.

- **Unit/integration**: `pnpm test` → 391 passed (17 files), 0 failed, 0 skipped (exit 0)
- **E2E**: 14/14 passed (`create-team.spec.ts`, untouched)
- **Type-check**: `npx tsc --noEmit` → exit 0, no output
- **Lint**: `pnpm lint` → exit 0
- **Data scan (independent)**: 30 races, 144 positionals; both `accessPrimary` and `accessSecondary` present ×144; letters ⊆ {G,A,P,S,M,F}; canonical order; `min ≤ max`

Note: `verify.md` (the persisted change folder artifact) contains a `verdict: pass` block with `blockers: 0`, `critical_findings: 0`, `requirements: 13/13`, `scenarios: 31/31`.

---

## 7. Final-State Facts & Snapshot Reconciliation

The SDD cycle went through an earlier FAIL (blockers: PR2 UI split pending, REQ-RACE-07 spec form, Dwarf audit rows, partially-covered `min` scenario) that was fully resolved before close. The final shipped state is what is recorded here. Intermediate `apply-progress` (Engram #135) and any prior partial verify snapshots describe the state at their time; the final PASS in `verify.md` and the orchestrator's final-state handoff govern this archive report.

Final-resolution evidence:
- PR2 UI landed (`522901e`, `62feb14`) — RosterTable rulebook restyle + consumer wiring.
- REQ-RACE-07 reconciled to the two-array `accessPrimary`/`accessSecondary` ⊆ {G,A,P,S,M,F} v2 model.
- 2 Dwarf `[]` rows (troll-slayer `[G,F]`/`[]`, deathroller `[F]`/`[]`) added to the audit log.
- Previously-PARTIAL "Min defined explicitly" scenario now covered by a passing synthetic `min:2` → "2-4" test.
- `apply-progress` updated with formal RED/GREEN/TRIANGULATE/SAFETY NET TDD evidence table.

---

## 8. Commit History

| # | SHA | Subject | Notes |
|---|-----|---------|-------|
| 1 | `fbb91cf` | feat(teams): add skill-access data to all 144 positionals | PR1 — data |
| 2 | `b60945f` | docs(teams): record OCR skill-access normalization for BB2025 races | PR1 — audit |
| 3 | `4d3828d` | docs(teams): record PR1 verify report | PR1 |
| — | `00d0eda` | Merge pull request #10 (feat/table-rulebook-data → main) | PR1 merge |
| 4 | `522901e` | feat(teams): restyle RosterTable to rulebook light theme | PR2 — core UI |
| 5 | `62feb14` | feat(teams): wire bannerText and apothecary into RosterTable consumers | PR2 |
| 6 | `acc62d6` | docs(teams): reconcile spec deltas and audit to v2 | PR2 |
| 7 | `456a7b0` | docs(teams): record final verify PASS | PR2 |

Review workload: PR1 + PR2 split per the tasks `delivery_strategy = ask-on-risk`/`chained PRs recommended = Yes` forecast. Both PRs reviewable; the 400-line budget was split across the two stacked PRs.

---

## 9. Delivery Notes

- Implementation is on `feat/table-rulebook-ui`, stacked on `main` (PR1 merged `00d0eda`, PR2 commits `522901e`..`456a7b0`).
- Not pushed to remote — delivery (PR creation, remote push) handled by the orchestrator / delivery skill.
- No new npm dependencies added.
- Rollback: revert the PR1 + PR2 commit ranges (additive data fields + UI-only restyle; no persisted-team migration).

---

## 10. Non-Blocking Notes & Risks

- The `race-data-bb2025` main spec's prior purpose line ("26 core races") was stale relative to the merged REQ-RACE-07 (30 lists) and was reconciled during archive sync. This is a documentation consistency correction within the delta-merge, not a behavioral change.
- Design Open Question "canonical order G→A→P→S→M→F assumed" (design.md:97) remains formally open but is enforced by `races-access.test.ts` invariants (letters ⊆ {G,A,P,S,M,F}, canonical order, dedupe) — data and tests already assume it.
- Banner font-weight (design.md:98) not confirmed against reference CSS; cosmetic only, non-blocking.
