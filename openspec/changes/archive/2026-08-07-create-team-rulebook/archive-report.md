# Archive Report — create-team-rulebook

**Change**: create-team-rulebook
**Closed**: 2026-08-07
**Status**: ✅ PASS — SDD cycle complete (no blockers, no CRITICAL, no WARNING)
**Artifact store**: openspec (filesystem)

---

## 1. Change Summary

| Field | Value |
|-------|-------|
| Change name | `create-team-rulebook` |
| Goal | Rework `CreateTeamForm` into the user-approved **Config 4 2-step wizard**: a light book panel (Step 1: name + race + "Siguiente →"), then a navy `#12225a` rulebook hero (Step 2: editable `RosterTable` Plantilla at top + budget bar + rulebook "Jugadores disponibles" availability table + Coaching Staff + Create Team submit). Reverts default player naming to `Player N`; adds editable `RosterTable` POSICIÓN subtext prefix; turns `RosterTable` into 11 editable / 10 read-only columns (no `CANT.`) with a scroll container + sticky header. |
| Branch | `feat/create-team-rulebook` |
| PR merge | #16 (`Merge pull request #16` → main) — final wizard verify PASS |
| Verify verdict | **PASS** — 13/13 requirements, 28/28 scenarios, 408 unit + 14 e2e green, tsc/lint clean, 0 blockers |
| Requirements | 13/13 compliant (create-team 7 req / 17 scenarios; roster-table 6 req / 11 scenarios) |
| Scenarios | 28/28 compliant |
| Unit tests | 408/408 passed (19 files) |
| E2E tests | 14/14 passed |
| Build / Type-check | ✅ (npx tsc --noEmit exit 0) |
| Lint | ✅ (pnpm lint exit 0) |
| Scope shipped | 2-step wizard form; new `PlayerAvailabilityTable`; `Player N` naming; editable POSICIÓN subtext prefix; RosterTable 11/10 cols + scroll container + sticky header; `form.step` in `useCreateTeamForm` |

---

## 2. SDD Cycle Trace

| Phase | Artifact | Date | Status |
|-------|----------|------|--------|
| Explore | `openspec/changes/archive/2026-08-07-create-team-rulebook/exploration.md` | 2026-08-07 | ✅ |
| Propose | `openspec/changes/archive/2026-08-07-create-team-rulebook/proposal.md` | 2026-08-07 | ✅ |
| Spec | `openspec/changes/archive/2026-08-07-create-team-rulebook/specs/` (2 delta files: `create-team`, `roster-table`) | 2026-08-07 | ✅ |
| Design | `openspec/changes/archive/2026-08-07-create-team-rulebook/design.md` | 2026-08-07 | ✅ |
| Tasks | `openspec/changes/archive/2026-08-07-create-team-rulebook/tasks.md` | 2026-08-07 | ✅ 18/18 |
| Apply | `openspec/changes/archive/2026-08-07-create-team-rulebook/apply-progress.md` | 2026-08-07 | ✅ |
| Verify | `openspec/changes/archive/2026-08-07-create-team-rulebook/verify-report.md` | 2026-08-07 | ✅ PASS |
| Archive | `openspec/changes/archive/2026-08-07-create-team-rulebook/archive-report.md` (this file) | 2026-08-07 | ✅ |

---

## 3. Artifacts Inventory

### Filesystem (openspec/)

| Artifact | Path | Status |
|----------|------|--------|
| Exploration | `openspec/changes/archive/2026-08-07-create-team-rulebook/exploration.md` | ✅ |
| Proposal | `openspec/changes/archive/2026-08-07-create-team-rulebook/proposal.md` | ✅ |
| Spec delta — create-team | `openspec/changes/archive/2026-08-07-create-team-rulebook/specs/create-team/spec.md` | ✅ |
| Spec delta — roster-table | `openspec/changes/archive/2026-08-07-create-team-rulebook/specs/roster-table/spec.md` | ✅ |
| Design | `openspec/changes/archive/2026-08-07-create-team-rulebook/design.md` | ✅ |
| Tasks | `openspec/changes/archive/2026-08-07-create-team-rulebook/tasks.md` | ✅ |
| Apply progress | `openspec/changes/archive/2026-08-07-create-team-rulebook/apply-progress.md` | ✅ |
| Verify report | `openspec/changes/archive/2026-08-07-create-team-rulebook/verify-report.md` | ✅ |
| Archive report | `openspec/changes/archive/2026-08-07-create-team-rulebook/archive-report.md` | ✅ (this file) |

Note: this change folder ships `exploration.md` and `apply-progress.md` in addition to the standard proposal/specs/design/tasks/verify-report (the change includes an explore phase and a rework whose apply-progress was persisted to the filesystem).

### Main Specs Synced

| Spec | Path | Action |
|------|------|--------|
| create-team | `openspec/specs/create-team/spec.md` | **Created** — new capability; the delta spec IS the full spec (7 requirements / 17 scenarios) |
| roster-table | `openspec/specs/roster-table/spec.md` | **Updated** — 6 MODIFIED/ADDED requirement blocks applied; 6 requirements preserved |

---

## 4. Spec Sync Details

### create-team → `openspec/specs/create-team/spec.md` (NEW)

Main spec did not exist. Per OpenSpec convention, the delta spec (which is a full spec with no ADDED/MODIFIED/REMOVED sections) was copied verbatim as the source of truth. Contents (7 requirements / 17 scenarios):

- **Two-Step Wizard Navigation** — Step 1 light panel "Paso 1 · Datos del equipo" + navy "Siguiente →"; validation blocks advance; "Editar nombre/raza" returns to step 1 with state preserved.
- **Step 2 Plantilla Section** — editable `RosterTable` at top + budget bar with `formatGold` strings; empty roster shows "No players in roster yet."
- **Jugadores Disponibles Availability Table** — "Jugadores disponibles" with 9 rulebook headers (POSICIÓN | COSTE | MV | FU | AG | PS | AR | HABILIDADES Y RASGOS | DISP.); row subtext "{positional.name} · ({race.name}, {roleEs})"; `{n}/{max}` counter in DISP.; row disappears at max; over-budget Add disabled but row stays visible.
- **Default Player Naming** — new players default to "Player N" (incrementing), name input editable.
- **Editable POSICIÓN Subtext** — editable subtext "{positional.name} · ({race.name}, {roleEs})"; read-only unchanged.
- **Coaching Staff English Labels** — English labels (Rerolls, Dedicated Fans, Assistant Coaches, Cheerleaders, Apothecary, League type), light styling, `{X}k gc`, region `aria-label="Coaching Staff"`.
- **Submit Team** — navy "Create Team" submit; reuses validation (name, ≥3 players, budget); clears form on success; blocked over budget with "Roster exceeds the 1,000,000 gc budget".

### roster-table → `openspec/specs/roster-table/spec.md`

Applied the delta requirement blocks to the existing main spec in place, carrying each delta's `(Previously: ...)` parenthetical:

- **Rulebook Column Set and Order** — (MODIFIED) editable mode now renders **11 columns** (10 rulebook headers + blank trailing `th`) omitting `CANT.` entirely (was 12-column `CANT.` set). Read-only stays 10 columns.
- **Qty Derivation** — (MODIFIED) no Qty column in either mode; `min`/`max` only drive the availability-table counters.
- **Editable POSICIÓN Subtext** — (ADDED, NEW) editable subtext "{positional.name} · ({race.name}, {roleEs})"; read-only unchanged.
- **Scrollable Roster Table** — (ADDED, NEW) max-height + internal scroll + sticky header.
- **Rulebook Footer** — (MODIFIED) footer colSpans now sum to 11 editable (4 + 6 + 1 blank) / 10 read-only (4 + 6) (was 12 / 10).
- **Totals Row** — (MODIFIED) editable colSpans sum to 11 (label 9 + cost 1 + budget 1) (was 12); read-only stays 10 (label 7 + cost 1 + empty 2).

**Preserved unchanged**: Light Theme Isolation, Position Cell with Spanish Role Subtitle, Spanish Skill Names with English Fallback, Access Column Rendering, Cost Format, Banner, Accessibility and Consumer Contract Preservation.

---

## 5. Task Completion Gate

All 18 implementation tasks (Phases 1–7, tasks 1.1–7.2) were checked `[x]` in the persisted `tasks.md` with **0 unchecked** implementation boxes at archive time. No exceptional stale-checkbox reconciliation was required. The archived `tasks.md` reflects the final completed state.

---

## 6. Final Harness Results

Source: `verify-report.md` (the change's persisted verification artifact) corroborated by the orchestrator's launch-prompt final-state handoff (highest-ranked account of the final shipped state). The final Verify verdict is **PASS** with **0 blockers** — the entire report is a clean pass snapshot (verify was run against the final Config-4 wizard at commit `ba156c1`, working tree clean; no verify warnings existed that needed later fixes).

- **Unit**: `pnpm test` → 408 passed (19 files), 0 failed, 0 skipped (exit 0)
- **E2E**: 14/14 passed (`e2e/create-team.spec.ts`, wizard rewrite)
- **Type-check**: `npx tsc --noEmit` → exit 0, empty output
- **Lint**: `pnpm lint` → exit 0
- **Requirements**: 13/13 compliant
- **Scenarios**: 28/28 compliant

---

## 7. Final-State Facts & Snapshot Reconciliation

`verify-report.md` IS a final-state snapshot here: it records **PASS** with 0 blockers, 0 CRITICAL, 0 WARNING (single non-blocking SUGGESTION only). No later fixes were required after verification was persisted, so the final state matches the verify snapshot without reconciliation. Launch-prompt final-state facts match verify exactly (13/13 req, 28/28 scenarios, 408 unit + 14 e2e green, tsc/lint clean, 0 blockers).

**Non-blocking SUGGESTION** (carried into the archive, not resolved — no code change needed): `RosterTable.test.tsx` asserts Tailwind class strings (`max-h-[55vh]`, `overflow-auto`, `sticky top-0 z-10`) as the covering proxy for the height-cap/sticky-header scenario (jsdom lacks geometry). Live geometry is additionally covered by the 14-test Playwright e2e run. This is a WARNING-category strict-tdd note but explicitly non-blocking and not a defect.

**Documented merge interpretation**: the delta spec adds a new `Editable POSICIÓN Subtext` requirement to roster-table (mirroring the create-team spec) without MODIFYING/REMOVING the existing `Position Cell with Spanish Role Subtitle`. All scenarios of `Position Cell with Spanish Role Subtitle` remain valid (read-only subtext, editable rename `aria-label="Player name for X"`, unknown-role `Otro` fallback). The new `Editable POSICIÓN Subtext` requirement is the authoritative editable-mode subtext contract (positional-name prefix required). Any future change touching editable POSICIÓN rendering should treat `Editable POSICIÓN Subtext` as superseding the editable-mode subtext clause of `Position Cell with Spanish Role Subtitle`. **No conflicting-final-state contradiction requires recording.**

---

## 8. Commit History

| SHA | Subject | Notes |
|-----|---------|-------|
| (PR branch) | prior table-first + positional-default-naming implementation | superseded by the Config-4 wizard rework on this branch |
| `ba156c1` | Config-4 wizard rework | final verified implementation (HEAD at verify time) |
| (PR #16 merge) | `Merge pull request #16 (feat/create-team-rulebook) → main` | delivered on main; final wizard verify PASS |

Review workload: single PR (#16) per the tasks `delivery_strategy = exception-ok` forecast — the rework reused the branch's existing PR and superseded the prior implementation; 400-line budget risk Medium.

---

## 9. Delivery Notes

- Implementation delivered to `main` via PR #16. The final state on main reflects the user-approved Config 4 wizard.
- **Implementation scope shipped** (from design.md + verify correctness evidence):
  - `useCreateTeamForm.ts` — reverted `addPlayer` default to `Player ${players.length + 1}`; added `step`, `nextStep` (validates name+race → step 2), `backStep` (preserves state), `goToStep`, `errors.race`.
  - `CreateTeamForm.tsx` — 2-step wizard: Step 1 light book panel + navy "Siguiente →"; Step 2 navy hero + Plantilla (`RosterTable` top + budget bar) + Jugadores disponibles (`PlayerAvailabilityTable`) + Coaching Staff (EN labels) + Create Team submit.
  - `PlayerAvailabilityTable.tsx` (NEW) — availability table; rows `return null` at `count >= max`; Add disabled when over budget or at `MAX_PLAYERS` (row stays visible).
  - `RosterTable.tsx` — editable subtext `{positional.name} · ({race.name}, {roleEs})`; read-only unchanged; 11 editable / 10 read-only columns (no `CANT.`); scroll container (`max-h-[55vh] overflow-auto`) + sticky header.
  - `features/teams/create/` tests, `app/teams/create/page.test.tsx`, `e2e/create-team.spec.ts` rewritten for the wizard flow.
- No new npm dependencies added.
- Rollback: `git revert` of the PR #16 merge (UI-only rework; no migration/data impact).

---

## 10. Non-Blocking Notes & Risks

- New **source-of-truth spec**: `openspec/specs/create-team/spec.md` (capability `CreateTeamForm` 2-step wizard). This is the baseline for any future create-team change.
- The roster-table spec now reflects the 11-editable/10-read-only (no `CANT.`) + scroll-container + sticky-header contract. Any future `RosterTable` change must consult both `Rulebook Column Set and Order`/`Qty Derivation` (this change) and the preserved `Position Cell with Spanish Role Subtitle` (earlier `table-design-rulebook`), with `Editable POSICIÓN Subtext` authoritative for editable-mode subtext (see §7).
- No open cosmetic deviations, no unresolved verify warnings, no risks blocking future SDD cycles.
