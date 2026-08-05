# Tasks: BB2025 Rules Migration

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 420-520 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 gate/baseline → PR 2 atomic data swap |
| Delivery strategy | auto-chain |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Confirm REQ-RACE-01, baseline tests, and approved identifier-delta checklist | PR 1 | `pnpm test -- features/teams/data/races.test.ts features/teams/roster.test.ts` | N/A — static dataset only | `openspec/changes/bb2025-rules-migration/tasks.md` and planning notes only |
| 2 | Apply the atomic BB2025 data+fixture swap in the agreed files | PR 2 | `pnpm test -- features/teams/data/races.test.ts features/teams/roster.test.ts` | N/A — static dataset only | `features/teams/data/races.ts`, `features/teams/data/races.test.ts`, `features/teams/roster.test.ts` |

## Phase 1: Gate / Baseline

- [x] 1.1 REQ-RACE-01: verify an approved BB2025 reference table exists and stop apply if sign-off is missing.
  Mark this task complete only when `openspec/changes/bb2025-rules-migration/bb2025-reference-table.md` has `Verification status (Draft/Verified)` set to `Verified`.
  <!-- RESOLVED: bb2025-reference-table.md Verification status = Verified. REQ-RACE-01 gate satisfied. 2026-08-05. -->
- [x] 1.2 Run `pnpm test` at repo root and record a green baseline before editing `features/teams/data/races.ts`, `features/teams/data/races.test.ts`, or `features/teams/roster.test.ts`.
  <!-- BASELINE: 105 tests, 11 test files, all passing. Recorded 2026-08-05. -->
- [x] 1.3 Audit every `race.id` and `positional.key` in `features/teams/data/races.ts`; document the approved finite BB2025 identifier delta and preserve all unlisted keys.
  <!-- ARTIFACT: openspec/changes/bb2025-rules-migration/id-key-checklist.md — approved delta (high-elf out, bretonnian in, finite positional removals/additions), all other keys frozen. -->

## Phase 2: Data Swap

- [x] 2.1 Update `features/teams/data/races.ts` race-by-race to verified BB2025 stats, costs, skills, and reroll costs while preserving all 26 races.
- [x] 2.2 Change `RULES_METADATA.version` in `features/teams/data/races.ts` from `"BB2020"` to `"BB2025"` only in the same work unit as the final data swap.
- [x] 2.3 Update `features/teams/data/races.test.ts` to assert `BB2025`, rename BB2020 wording, and pin Human Lineman stats to verified BB2025 values.
- [x] 2.4 Update `features/teams/roster.test.ts` expected sums only if Human Lineman, Blitzer, or Thrower costs differ in the verified table.

## Phase 3: Verification

- [x] 3.1 Run `pnpm test -- features/teams/data/races.test.ts` after the swap and fix only verified-reference mismatches in agreed files.
- [x] 3.2 Run `pnpm test -- features/teams/roster.test.ts` after fixture updates and reconcile Human cost deltas without touching `features/teams/roster.ts`.
- [x] 3.3 Run `pnpm test` to satisfy REQ-RACE-05 and confirm no downstream regression from the dataset update.

## Phase 4: Handoff / Cleanup

- [x] 4.1 Re-check diffs for only `features/teams/data/races.ts`, `features/teams/data/races.test.ts`, and `features/teams/roster.test.ts`; confirm no identifier renames slipped in.
  <!-- COMPLETED 2026-08-05 correction run: git diff audit confirmed no id/key renames — all values preserved as context-only lines. -->
- [x] 4.2 If apply is still blocked, append the unresolved BB2025 reference-table gap to `openspec/changes/bb2025-rules-migration/tasks.md` before handoff.
  <!-- SUPERSEDED 2026-08-05: REQ-RACE-01 was resolved (bb2025-reference-table.md Verification status = Verified). The gap below is retained as audit trail only. -->

## Phase 5: Critical Verify Remediation (2026-08-05)

- [x] 5.1 Remove `high-elf` roster (does not exist in BB2025); add `bretonnian` to keep race count at 26.
- [x] 5.2 Remove `beastman-runner` from Chaos Chosen positionals; roster now: lineman, chosen-blocker, chaos-troll, minotaur.
- [x] 5.3 Remove `renegade-beastman` from Chaos Renegade; add `renegade-minotaur` and `renegade-rat-ogre`.
- [x] 5.4 Remove `bone-giant` from Tomb Kings positionals.
- [x] 5.5 Replace generic `vampire` positional with `vampire-runner`, `vampire-thrower`, `vampire-blitzer`, `vargheist`.
- [x] 5.6 Add RED tests for all 5 corrections; confirm GREEN after implementation (114 tests passing).

## Phase 6: SDD Reconciliation (Docs Consistency)

- [x] 6.1 Reconcile spec/design/tasks to reflect BB2025-authoritative key composition and approved finite identifier delta.
- [x] 6.2 Mark the roster/key delta as a deliberate user-approved compatibility break and add follow-up note for persisted-team migration strategy.

---

## Audit Trail — Former Blocked State (superseded 2026-08-05)

> **Note**: The section below was written when REQ-RACE-01 was unresolved. It is preserved as an
> audit trail. All blockers have since been cleared. Phase 2, 3, and 4 are complete.

### Original Gap Notice (appended per task 4.2 — now superseded)

**Former Blocker**: REQ-RACE-01 — Verified BB2025 stat reference table not provided.

**Resolution**: `bb2025-reference-table.md` was completed and its `Verification status` set to
`Verified`. Task 1.1 was marked `[x]`. Phase 2 data swap proceeded and all tests pass.

**Safe work completed without reference table** (tasks 1.2, 1.3, 4.2 done):
- Baseline recorded: 105/105 tests passing.
- ID/key freeze checklist created: `openspec/changes/bb2025-rules-migration/id-key-checklist.md`

### OCR migration progress (2026-08-05) — historical

- `bb2025-reference-table.md` was updated with OCR-extracted values from `page-168.txt` to `page-196.txt` where readable.
- REQ-RACE-01 was subsequently fully resolved and `Verification status` set to `Verified`.

## Verification Remediation Slice (2026-08-05)

Added executable coverage to close verify FAIL gaps. All tests pass (148/148).

- [x] VR-01 REQ-RACE-01: assert `bb2025-reference-table.md` exists and contains `Verification status (Draft/Verified) | Verified`.
- [x] VR-02 REQ-RACE-02 Preserve Unlisted Keys: assert exact post-migration race ID set equals 26-race expected set; assert exact positional key inventory per race matches approved delta only.
- [x] VR-03 REQ-RACE-04 Exact reroll parity: assert each race `rerollCost` equals the value from the verified reference table (26 per-race assertions).
- [x] VR-04 REQ-RACE-06 Documented break: assert `design.md` and `tasks.md` contain compatibility break marker; assert combined artifacts contain follow-up migration note.
- [x] VR-05 Add explicit `bretonnian` section to `bb2025-reference-table.md` with full positional rows (stats/cost/skills/reroll) and source annotation.
- [x] VR-06 REQ-RACE-04 Full positional stat/cost/skill parity: add runtime proof assertions covering all non-N/A rows and N/A absence assertions in `races.test.ts`.

**File changed**: `features/teams/data/races.test.ts` — 4 new `describe` blocks, 36 new assertions.

## Exhaustive Parity Remediation Slice (2026-08-05)

Closed the final verify gap: exhaustive runtime parity coverage for REQ-RACE-04 across all 26 races and all non-N/A positional rows.

- [x] VR-07 REQ-RACE-04 Exhaustive stat/cost/skill parity: added per-race describe blocks for every race not yet fully covered (orc, dwarf, elven-union, skaven, dark-elf, shambling-undead, chaos-chosen, amazon, chaos-renegade, halfling, imperial-nobility, khorne, lizardmen remaining, necromantic-horror remaining, norse, nurgle, old-world-alliance, snotling, tomb-kings, underworld-denizens, vampire, black-orc, goblin, wood-elf, human ogre). Every non-N/A reference table row has an exact MA/ST/AG/PA/AV/cost assertion plus normalized skill set equality.
- [x] VR-08 Full suite remains green: `pnpm test` → 305 passed (11 files).
