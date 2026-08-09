```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:8287889b2e92a03f879f3e9b06be0b0019818b55cc26721639014aacc2d1ad2b
verdict: fail
blockers: 1
critical_findings: 0
requirements: 1/1
scenarios: 4/5
test_command: pnpm test
test_exit_code: 0
test_output_hash: sha256:22460946af4032c415f098dd0c81e8abe3c0c4b14f2c03807270ccd47cafbac4
build_command: npx tsc --noEmit
build_exit_code: 0
build_output_hash: sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

## Verification Report

**Change**: table-design-rulebook — PR1 (data foundation)
**Version**: race-data-bb2025 delta (REQ-RACE-07) — v1 (stale model)
**Mode**: Strict TDD
**Branch**: feat/table-rulebook-data (2 commits from main: fbb91cf data, b60945f docs)
**Scope**: PR1 only (types + data + races-access tests + audit). UI (PR2) out of scope.

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total (PR1 Phase 1) | 6 (1.1–1.6) |
| Tasks complete | 6/6 |
| Tasks incomplete | 0 (PR1) — Phases 2/3/4 remain for PR2 |
| ActionContext mode | standard change (not workspace-planning) |

### Build & Tests Execution

**Build/Type-check**: ✅ Passed
```text
npx tsc --noEmit  →  exit 0, no output (hash e3b0c442…) — every consumer compiles with the new required accessPrimary/accessSecondary fields; no drift from design interface.
```

**Tests (unit)**: ✅ 370 passed (17 files), 0 failed, 0 skipped
```text
pnpm test  →  exit 0 (hash 22460946…)
Includes: features/teams/data/races-access.test.ts — 9/9 passed.
Existing consumers stay green: RosterTable.test.tsx (13), CreateTeamForm.test.tsx (19), TeamDetailView.test.tsx (7), races.test.ts (217), skills.test.ts (5), roster.test.ts (22), etc.
```

**Coverage**: ➖ Not available (no coverage tool configured); informational only per strict module.

**Lint**: ✅ Clean (exit 0)

**E2E**: ✅ 14/14 passed (UI untouched — PR1 is data-only)
```text
pnpm test:e2e  →  playwright, 14 tests passed (create-team.spec.ts), exit 0
```

### Spec Compliance Matrix (race-data-bb2025 / REQ-RACE-07)

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| REQ-RACE-07: Positional Qty Minimum and Skill Access Data | High-confidence subset (Human p180 / Orc p189 / Dwarf p175) verified first | `races-access.test.ts` > "Human access (OCR page 180…)"/"Orc access…"/"Dwarf access…" | ✅ COMPLIANT (exact arrays match OCR tokens; verified page-by-page) |
| REQ-RACE-07 | Out-of-set OCR letters normalized or flagged | `races-access.test.ts` > "restricts every access letter to {G,A,P,S,M,F}" + "keeps free of duplicates" + "orders canonically G→A→P→S→M→F" | ✅ COMPLIANT (all 144 positionals ⊆ {G,A,P,S,M,F}; E/T/6 discards per audit; verified 0 out-of-set letters programmatically) — note: valid set is {F} not spec's stale {T} |
| REQ-RACE-07 | Missing access data → `[]` | `races-access.test.ts` > "declares both access arrays on every positional" | ✅ COMPLIANT (high-elf ×4, bretonnian ×3, gnome woodland-fox, etc. = `[]`; audit logs them) |
| REQ-RACE-07 | Min defaults to zero | `races-access.test.ts` > "treats an absent min as 0…" | ✅ COMPLIANT (all 144 have no `min` → 0; audit confirms all OCR counts 0-N) |
| REQ-RACE-07 | Min defined explicitly (`{min}-{max}` render) | `races-access.test.ts` > "never lets min exceed max when min is present" | ⚠️ PARTIAL — invariant min≤max tested, but no non-zero `min` exists in data (correct: OCR counts all 0-N) and the `{min}-{max}` Qty render is PR2 UI; scope-deferred |

**Compliance summary**: 4/5 scenarios compliant (+1 PARTIAL, scope-deferred); 1/1 requirement satisfied by implementation.

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| Positional gains `min?`, `accessPrimary`, `accessSecondary` | ✅ Implemented | `types.ts:14-19`; exact match to design interface incl. comments |
| All 30 races / 144 positionals have both arrays | ✅ Implemented | Programmatic scan: 30 races, 144 positionals, both arrays present |
| Letters ⊆ {G,A,P,S,M,F} | ✅ Implemented | Programmatic scan: 0 out-of-set letter strings; tests lock it |
| Canonical order G→A→P→S→M→F | ✅ Implemented | Test "orders canonically" passes; spot-checked Human/Orc/Dwarf arrays |
| `min` ≤ `max` and `min` defaults 0 | ✅ Implemented | No `min` > 0 in data (all 0-N per OCR); invariant tests pass |
| Human/Orc/Dwarf reference subset matches OCR | ✅ Implemented | Verified Human(p180), Orc(p189), Dwarf(p175) token-by-token; e.g. Human lineman `G | A,FT → [G]/[A,F]` |

### Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| Two access arrays `accessPrimary`/`accessSecondary` (not single `access`) | ✅ Yes | types.ts, races.ts, tests all two-array; design is authority |
| Valid letters ⊆ {G,A,P,S,M,F}; F=Fitness kept (OC-noise assumption REVOKED) | ✅ Yes | F used (e.g. Ogre/Deathroller/Troll primaries); E,T dropped |
| Canonical order G→A→P→S→M→F per column | ✅ Yes | Test-enforced |
| Empty array → `[]` (renders "—" in PR2) | ✅ Yes (data) | High-elf, bretonnian, etc. use `[]` |
| `min` where ≠0; all 0 here | ✅ Yes | No `min` fields shipped (audit: all OCR counts 0-N) |
| Audit log: Access normalization log + `[]`/noise rows | ⚠️ Partial | Rows tabled; **2 omitted** (below) |
| Spec delta REQ-RACE-07 must cover both arrays ⊆{G,A,P,S,M,F} | ❌ No | Spec still single `access`/{…,T} — stale (task 4.1, Phase 4 pending) |

### Issues Found

**CRITICAL**: None (no product-code defect, no failing test, no out-of-set letter, no min>max — all verified).

**BLOCKER (structural, not a code defect)**: The overall change is **incomplete** — this verification covers only PR1 (data foundation). Phase 2/3 (RosterTable + consumers + UI tests) and Phase 4 (spec-delta reconciliation REQ-RACE-07, audit finalization) remain unchecked in `tasks.md`. Within PR1 scope, ALL PR1 deliverables pass (types, 30/144 data, invariants, reference-subset tests, audit). The single partial spec scenario (REQ-RACE-07 "Min defined explicitly" → `{min}-{max}` render) is not runtime-testable until PR2 renders the Qty cell. Verdict `fail` therefore reflects **change-incompleteness, not a defect in verified PR1 code**.

**WARNING**:
1. **REQ-RACE-07 spec delta is stale** (`openspec/changes/table-design-rulebook/specs/race-data-bb2025/spec.md:10-12`): still declares a single `access: string[]` with valid set `{G,A,P,S,M,T}`. The authoritative `design.md` and the verified implementation use `accessPrimary`/`accessSecondary` with set `{G,A,P,S,M,F}` (F=Fitness). This is a spec-documentation reconciliation item already tracked as **task 4.1 (Phase 4, unchecked)**. **Not a code defect** — implementation matches design; **not a PR1 blocker** — PR1 is the data-not-applied-and-verified slice and the spec delta is not yet archive-ready by design. **Required before archive**: apply the two-array/`{…F}` correction via task 4.1.
2. **Audit log omits two discarded-token `[]` rows**: Dwarf `troll-slayer` secondary and `deathroller` secondary are `[]` because OCR page-175 second tokens were noise (`T`, `6`), but these are NOT tabled in the audit's per-row "rows with []" list (lines 174–191). Their values ARE locked by the exact Dwarf tests and the general discard rule (E,T,6) is documented at line 162, so this is a documentation-completeness gap, not a data error. Recommend adding both rows to the audit table in Phase 4.2.
3. **Apply-progress lacks the formal TDD Cycle Evidence column-table** (RED/GREEN/TRIANGULATE/SAFETY NET). It reports per-task RED/GREEN in prose. All substantive evidence was independently re-verified by this phase (test file exists, 9 tests genuinely pass, value assertions derive from OCR). Format variance, not an execution gap.

**SUGGESTION**:
- Scenario "Min defined explicitly" will only be runtime-verifiable once PR2 renders the Qty cell; add a data+render test with a synthetic non-zero `min` in PR2.
- Confirm canonical order G→A→P→S→M→F (design Open Question, unresolved) before archive — current data assumes it.

### TDD Compliance

| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ⚠️ Partial | In apply-progress (Engram #135) in prose; no formal column table |
| All tasks have tests | ✅ 6/6 | PR1 tasks produce/are covered by races-access.test.ts |
| RED confirmed (tests exist) | ✅ | races-access.test.ts created in fbb91cf |
| GREEN confirmed (tests pass) | ✅ 9/9 | Rerun: 9/9 passed |
| Triangulation adequate | ✅ | 6 invariant + 3 exact-reference tests across 30 races/144 positionals — not single-case |
| Safety Net for modified files | ✅ | RosterTable.test.tsx fixture-only additive change; full suite green |
| Assertion quality | ✅ | Value assertions (exact arrays), no tautologies/ghost loops/orphan empties; OCR-derived |

**TDD Compliance**: 5.5/6 checks passed (1 format variance in reporting)

### Assertion Quality

**Assertion quality**: ✅ All assertions verify real behavior — `races-access.test.ts` asserts exact OCR-derived arrays (e.g. Human lineman `["G"]`/`["A","F"]` matching page-180 `G | A,FT`); empty-collection expectations are violation-accumulator checks with companion non-empty value assertions elsewhere; loops iterate real 144-positional data.

### Test Layer Distribution

| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | 370 | 17 | vitest (jsdom) |
| Integration | included in RosterTable/CreateTeamForm/TeamDetailView unit-jsdom suites | 3 | @testing-library/react |
| E2E | 14 | 1 | @playwright/test |
| **Total** | **384 (370 unit + 14 e2e)** | **18** | |

### Quality Metrics

**Linter**: ✅ No errors
**Type Checker**: ✅ No errors (`tsc --noEmit` clean)

### Verdict

**FAIL** — because the *change* is incomplete, not because PR1 code is defective. PR1 (data foundation) is fully verified correct: 370 unit + 14 e2e green, clean type-check and lint, exact OCR-derived Human/Orc/Dwarf subsets confirmed page-by-page, 30 races / 144 positionals with valid letter sets and canonical order. The one partial spec scenario (REQ-RACE-07 "Min defined explicitly") cannot be runtime-covered until PR2 renders the Qty cell; PR2 UI and Phase 4 spec reconciliation (REQ-RACE-07 two-array/`{…F}` model; audit per-row completion) remain outstanding. This result is therefore `fail` on **incomplete evidence** (valid, persistable, not archive-ready). PR1 itself is ready for PR2.

**PR-1 boundary note**: This verifies only the data-foundation slice. The REQ-RACE-07 spec correction and the two missing audit rows are booked for Phase 4 (tasks 4.1/4.2); the Qty-render scenario is PR2. The change is not archive-ready until those plus PR2 land.
