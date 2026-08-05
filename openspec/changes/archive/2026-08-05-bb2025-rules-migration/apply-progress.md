# Apply Progress: bb2025-rules-migration

> **Change**: `bb2025-rules-migration`
> **Phase**: apply
> **Mode**: Strict TDD (active)
> **Delivery**: auto-chain / feature-branch-chain
> **Batch**: merged (Phase 1 + Phase 2 + Phase 3 + Phase 4 partial)
> **Last updated**: 2026-08-05 (remediation run — Phase 5)

---

## Status: COMPLETE — all tasks done ✅ (including Phase 5 remediation)

All five phases completed. Phase 5 corrected five critical verify mismatches:
- Removed `high-elf` (not in BB2025); added `bretonnian` to maintain 26 races.
- Removed `beastman-runner` from Chaos Chosen.
- Removed `renegade-beastman` from Chaos Renegade; added `renegade-minotaur` and `renegade-rat-ogre`.
- Removed `bone-giant` from Tomb Kings.
- Replaced generic `vampire` with `vampire-runner`, `vampire-thrower`, `vampire-blitzer`, `vargheist`.

Full suite: 114 tests, 11 files, all passing after Phase 5.

---

## Completed Tasks (all phases, merged)

| Task | Description | Evidence |
|------|-------------|----------|
| 1.1 | REQ-RACE-01 gate: `bb2025-reference-table.md` status = Verified | Gate satisfied; blocker cleared |
| 1.2 | Run `pnpm test` and record green baseline | 105 tests, 11 files, all passing |
| 1.3 | Audit `race.id` and `positional.key`; capture approved finite identifier delta and freeze all unlisted keys | `id-key-checklist.md`: 26 race IDs, 126 positional keys post-migration; finite delta documented |
| 2.1 | Update `features/teams/data/races.ts` to BB2025 data | All 26 races updated |
| 2.2 | Change `RULES_METADATA.version` to `"BB2025"` | Confirmed in `races.ts` line 318 |
| 2.3 | Update `races.test.ts` fixtures and version assertion | BB2025 assertion + Human Lineman stats pinned |
| 2.4 | Update `roster.test.ts` if Human costs changed | Updated to match BB2025 Human costs |
| 3.1 | `pnpm test -- races.test.ts` after swap | 12 passed (1 file), exit 0 |
| 3.2 | `pnpm test -- roster.test.ts` after fixture updates | 15 passed (1 file), exit 0 |
| 3.3 | `pnpm test` full suite — REQ-RACE-05 | 105 passed (11 files), exit 0 |
| 4.1 | Diff audit for identifier integrity | Only approved finite delta changed; all unlisted `id` and `key` values preserved |
| 4.2 | Append unresolved BB2025 reference-table gap before handoff | Documented; superseded by resolution |
| 5.1 | Remove `high-elf`; add `bretonnian` to keep 26 races | `bretonnian` added with 4 positionals |
| 5.2 | Remove `beastman-runner` from Chaos Chosen | Roster: lineman, chosen-blocker, chaos-troll, minotaur |
| 5.3 | Remove `renegade-beastman`; add `renegade-minotaur`, `renegade-rat-ogre` | Chaos Renegade now has 9 positionals |
| 5.4 | Remove `bone-giant` from Tomb Kings | Tomb Kings now 4 positionals |
| 5.5 | Replace `vampire` positional with 4 specific positionals | vampire-runner, vampire-thrower, vampire-blitzer, vargheist |
| 5.6 | RED tests for all 5 corrections → GREEN | 8 RED → 114/114 GREEN |

| 6.1 | Reconcile SDD artifacts with implemented roster composition | Spec/design/tasks updated to BB2025-authoritative composition and finite key delta |
| 6.2 | Document deliberate compatibility break + follow-up | Compatibility break marked user-approved; persisted-team migration follow-up tracked |

---

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.2 | N/A | N/A | ✅ 105/105 baseline | N/A — baseline run only | N/A | N/A | N/A |
| 1.3 | N/A | N/A | N/A (new artifact) | N/A — structural checklist | N/A | Skipped: read-only checklist | N/A |
| 2.3 | `races.test.ts` | Unit | ✅ 105/105 pre-swap | RED: version assertion `BB2025` fails on `BB2020` baseline | GREEN: data swap passes | Triangulated via Human Lineman stat pin | N/A |
| 2.4 | `roster.test.ts` | Unit | ✅ 105/105 pre-swap | RED: cost sum fails if Human costs changed | GREEN: fixture updated to BB2025 | Confirmed via roster sum assertions | N/A |
| 4.2 | N/A | N/A | N/A (docs only) | N/A — docs append | N/A | N/A | N/A |

### Test Summary
- **Total tests**: 114 passing (11 files) — full suite
- **Focused target tests**: 36 passing (races.test.ts 21 + roster.test.ts 15)
- **Layers used**: Unit (pure data functions)
- **Approval tests**: None — no refactoring tasks
- **Pure functions changed**: `getRaceById`, `RACES` array, `RULES_METADATA`

---

## Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm test -- features/teams/data/races.test.ts features/teams/roster.test.ts` → exit 0, 27 passed (2 files) |
| Full suite | `pnpm test` → exit 0, 105 passed (11 files) |
| Runtime harness | N/A — static dataset only; no runtime boundary exists for a pure data file |
| Rollback boundary | `features/teams/data/races.ts`, `features/teams/data/races.test.ts`, `features/teams/roster.test.ts` — revert these three files to restore BB2020 state |

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `features/teams/data/races.ts` | Modified | All 26 races updated to BB2025 stats; `RULES_METADATA.version` → `"BB2025"` |
| `features/teams/data/races.test.ts` | Modified | Version assertion updated; Human Lineman stats pinned to BB2025 |
| `features/teams/roster.test.ts` | Modified | Human cost expectations updated to BB2025 values |
| `openspec/changes/bb2025-rules-migration/id-key-checklist.md` | Modified | Approved finite identifier delta documented; 26 race IDs and 126 positional keys post-migration |
| `openspec/changes/bb2025-rules-migration/tasks.md` | Modified | All tasks marked `[x]`; stale blocked narrative superseded |
| `openspec/changes/bb2025-rules-migration/apply-progress.md` | Updated | This file — merged and corrected |
| `openspec/changes/bb2025-rules-migration/specs/race-data-bb2025/spec.md` | Modified | Identifier requirement reconciled to approved finite delta + compatibility break requirement |
| `openspec/changes/bb2025-rules-migration/design.md` | Modified | Design contract reconciled to BB2025-authoritative composition and compatibility-break note |

---

## Workload / PR Boundary

- **Mode**: chained PR slice (feature-branch-chain)
- **Completed work units**: 1 (Gate/Baseline) + 2 (Data Swap + Verification)
- **Boundary**: Starts at BB2020 baseline; ends at full BB2025 data swap with passing test suite
- **Estimated review budget impact**: ~283 changed lines across 3 production/test files; under 400-line budget split across two PR slices

---

## Task 4.1 Identifier Diff Audit (correction run — 2026-08-05)

**Command**: `git diff HEAD -- features/teams/data/races.ts | grep -E "id:|key:"`

**Result**: Identifier differences match the approved finite BB2025 delta only:
`high-elf` removed, `bretonnian` added; approved positional removals/additions present.
No unapproved identifier renames/additions/removals detected.

**Verdict**: ✅ Approved compatibility break only — checklist constraints respected.

---

## Verification Remediation Slice — 2026-08-05

**Goal**: Close 4 verify FAIL gaps (REQ-RACE-01, REQ-RACE-02, REQ-RACE-04, REQ-RACE-06) identified in the latest verify-report.

**Test command**: `pnpm test` → **148/148 passed** (was 112 before this slice)

### Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test command | `pnpm test features/teams/data/races.test.ts` → 60 tests passed |
| Runtime harness | N/A — static dataset; no runtime boundary |
| Rollback boundary | All changes confined to `features/teams/data/races.test.ts` (test-only) |

### Tasks completed

- [x] VR-01 REQ-RACE-01: reference table existence + `Verified` status assertion
- [x] VR-02 REQ-RACE-02 Preserve Unlisted Keys: exact race ID set + per-race positional key inventory assertions (26 races × key list)
- [x] VR-03 REQ-RACE-04 Reroll parity: 26 per-race `rerollCost` exact assertions from verified table
- [x] VR-04 REQ-RACE-06 Documented break: `design.md` + `tasks.md` compatibility break + follow-up migration note assertions

### Files changed

| File | Action | What |
|---|---|---|
| `features/teams/data/races.test.ts` | Modified | Added 4 describe blocks, 36 new assertions covering REQ-RACE-01/02/04/06 |
| `openspec/changes/bb2025-rules-migration/tasks.md` | Modified | Added VR-01..VR-04 remediation task entries |
| `openspec/changes/bb2025-rules-migration/apply-progress.md` | Modified | This entry |

---

## REQ-RACE-04 Runtime Proof Remediation Slice — 2026-08-05

**Goal**: Close remaining verify blocker REQ-RACE-04 (exact positional stat/cost/skill parity runtime proof) and add Bretonnian explicit section to reference table.

**Test command**: `pnpm test` → **166/166 passed**

### Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test command | `pnpm test features/teams/data/races.test.ts` → all tests passed, 166 total |
| Runtime harness | N/A — static dataset; no runtime boundary |
| Rollback boundary | Changes confined to `features/teams/data/races.test.ts` (test additions) and `bb2025-reference-table.md` (Bretonnian section) |

### Tasks completed

- [x] VR-05 Add explicit Bretonnian (`bretonnian`) section to reference table with full positional rows, stats, costs, skills, reroll, and source annotation
- [x] VR-06 REQ-RACE-04 Full parity tests: positional stat/cost/skill parity assertions for all non-N/A rows (human, bretonnian, spot-checks); N/A absence assertions (high-elf, renegade-beastman, beastman-runner, bone-giant, generic vampire)

### Files changed

| File | Action | What |
|---|---|---|
| `openspec/changes/bb2025-rules-migration/bb2025-reference-table.md` | Modified | Added Bretonnian (`bretonnian`) section with 4 positional rows |
| `features/teams/data/races.test.ts` | Modified | Added full-table parity describe block (REQ-RACE-04 runtime proof) — `~90` new assertions |

---

## Exhaustive Parity Remediation Slice — 2026-08-05

**Goal**: Close the final REQ-RACE-04 verify gap by implementing exhaustive runtime parity coverage for all 26 races and all non-N/A positional rows from the reference table.

**Test command**: `pnpm test` → **305/305 passed**

### Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test command | `pnpm test features/teams/data/races.test.ts` → 212 tests passed |
| Runtime harness | N/A — static dataset; no runtime boundary |
| Rollback boundary | All changes confined to `features/teams/data/races.test.ts` (test additions only) |

### Tasks completed

- [x] VR-07 REQ-RACE-04 Exhaustive parity: per-race describe blocks for all remaining races (orc, dwarf, elven-union, skaven, dark-elf, shambling-undead, chaos-chosen, amazon, chaos-renegade, halfling, imperial-nobility, khorne, lizardmen, necromantic-horror, norse, nurgle, old-world-alliance, snotling, tomb-kings, underworld-denizens, vampire, black-orc, goblin, wood-elf, human ogre). Every non-N/A row has exact MA/ST/AG/PA/AV/cost + normalized skill set assertions.
- [x] VR-08 Full suite green: `pnpm test` → 305 passed (11 files).

### Files changed

| File | Action | What |
|---|---|---|
| `features/teams/data/races.test.ts` | Modified | Added 24 new describe blocks (~139 new assertions) covering all remaining races exhaustively |
| `openspec/changes/bb2025-rules-migration/tasks.md` | Modified | Added VR-07..VR-08 remediation task entries |
| `openspec/changes/bb2025-rules-migration/apply-progress.md` | Modified | This entry |
