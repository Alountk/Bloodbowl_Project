```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:da2184ca2b314f4a0aace5e1d896a1a440aa6e9dde5c2a793246a4a17cfe53e2
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 23/23
scenarios: 63/63
test_command: pnpm test
test_exit_code: 0
test_output_hash: sha256:00f1386191b1dec4e4776179c1181f65eb49ce52b15171a03712bab4e0311b27
build_command: npx tsc --noEmit
build_exit_code: 0
build_output_hash: sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

# Verification Report (S5: e2e + Polish — FINAL, closes match-report)

**Change**: match-report
**Branch**: feat/match-report-s5 (commits 8c1c374, f4aa168, 690dd0a, ed1c6c2, efd4ec0 — stacked on main after S4 #53 merged). Working tree clean except untracked `openspec/changes/match-report/`.
**Runtime attempt token**: sha256:c0d52ceaa14db8c053215edc1b4d95539a5062f5f743148ffb4901a83f893247 (supplied by orchestrator).
**Mode**: Strict TDD (runner `pnpm test`; strict-tdd-verify.md loaded).
**Slice scope**: S5 (final slice) — owner-team progression page wiring, real-DB e2e journeys, two latent bug fixes (result-route `ballHeld`; improve-route `[teamId]`→`[id]` boot clash), ROADMAP/archive prep. **This is the FINAL full-change verification** — the whole change must show green, so the rollup counts all 6 specs.
**Artifacts read**: all 6 change specs (`bb2025-rules`, `player-progression`, `match-result`, `league-season`, `matchday-forfeit`, `race-data-bb2025` — AUTHORITATIVE), design.md (fork 6A), tasks.md (ALL tasks 1.1–7.1 `[x]`), apply-progress (engram topic `sdd/match-report/apply-progress`, #304 cumulative through S5), prior verify-report.md (S3 #305, S4 baseline file).
**Delivery strategy**: ask-on-risk → resolved: chained PRs, stacked-to-main; S5 accepted as size-exception by maintainer.

---

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 25 (1.1–6.3) + 7.1 chain-strategy = 26 |
| Tasks complete | 26 |
| Tasks incomplete | 0 |

All implementation tasks (1.1–1.13, 2.1–2.3, 3.1–3.8, 4.1–4.4, 5.1–5.4, 6.1–6.3) and the chain-strategy task 7.1 are checked `[x]` in tasks.md; apply-progress #304 confirms S5 (6.1–6.3) execution. No task is pending, so full verification is authorized.

## Build & Tests Execution

**Build (types)**: ✅ Passed — `npx tsc --noEmit` exit 0 (empty output, hash `e3b0...855`).
**Lint**: ✅ Passed — `pnpm lint` exit 0 (hash `85b3...639`).
**Tests (full)**: ✅ 926 passed (81 files), 0 failed — `pnpm test` exit 0 (output hash `00f1...1b27`). Matches apply-progress S5 baseline 914 → 926 (S5 net +12).
**Focused (S5)**: ✅ 57 passed across 5 files — exit 0 (direct evidence below).
**Local e2e**: ✅ 21 passed — `AUTH_MODE=local pnpm exec playwright test` exit 0 (match-report spec correctly excluded from local runs).
**Auth e2e (match-report)**: ✅ 2 passed — `AUTH_MODE=auth pnpm exec playwright test --config playwright.config.auth.ts match-report` exit 0. Real-DB result→score→Jornada completa, PE→élite spend, and admin-correction journeys all green. No cold-start race observed this run.
**Coverage**: ➖ Not available — no coverage tool configured (informational, non-blocking).

Focused S5 command output:
```
$ pnpm exec vitest run "app/api/teams/[id]/progression/route.test.ts" "features/teams/api.test.ts" "app/teams/[teamId]/page.test.tsx" "app/api/leagues/[id]/fixtures/[fixtureId]/result/route.test.ts" "app/api/teams/[id]/players/[playerId]/improve/route.test.ts"
 ✓ features/teams/api.test.ts (4 tests)
 ✓ app/api/teams/[id]/progression/route.test.ts (5 tests)
 ✓ app/api/teams/[id]/players/[playerId]/improve/route.test.ts (17 tests)
 ✓ app/api/leagues/[id]/fixtures/[fixtureId]/result/route.test.ts (21 tests)
 ✓ app/teams/[teamId]/page.test.tsx (10 tests)
 Test Files  5 passed (5)   Tests  57 passed (57)
```

## Spec Compliance Matrix — FULL-CHANGE ROLLUP (all 6 specs)

Authoritative totals across the six change specs: **23 requirements, 63 scenarios**. Slice ownership: S1a/S1b/S2/S2b/S3/S4 previously verified and regression-green here (full suite 926/926); S5 (this slice) adds/e2e-proves the owner page wiring, the two bug-fix regressions, and the real-DB journeys. Every requirement/scenario is backed by a passing runtime test in the current full suite or the auth e2e.

| Requirement | Scenarios | Covering evidence | Result |
|-------------|-----------|-------------------|--------|
| bb2025-rules: PE Awards by Action | 2 (TD 3 PE; MJP 1D6 4 PE) | `lib/rules/pe.test.ts` (4 tests) — pins TD3·MJP4·Int2·CAS2·Comp1·TTM1·LS1 | ✅ COMPLIANT (S1a) |
| bb2025-rules: Improvement Cost Table | 2 (1ª primary 6; 6ª attribute 38) | `lib/rules/improvements.test.ts` (14) — 6×4 cost table rows pinned | ✅ COMPLIANT (S1a) |
| bb2025-rules: Random Skill Roll | 3 (two-roll pick; duplicate; owned re-roll) | `lib/rules/skills.test.ts` (11) — 6-col A/F/G/M/P/T table, 2D6, mandatory not élite | ✅ COMPLIANT (S1a) |
| bb2025-rules: Winnings and Fan Factor | 3 (formula; FF win cap 7; FF loss floor 1) | `lib/rules/improvements.test.ts` + winnings/fanFactor coverage — (7+3)/2, TDs ×10k, FF 1D6 | ✅ COMPLIANT (S1a) |
| bb2025-rules: Injury Table | 3 (Apaleado; permanent −MV + LMC + 2PE; death) | `lib/rules/injuries.test.ts` (14) + `lib/result.test.ts` | ✅ COMPLIANT (S1a/S2) |
| bb2025-rules: Weather Table | 2 (heat; blizzard) | `lib/rules/weather.test.ts` — 2D6 full effects | ✅ COMPLIANT (S1a) |
| bb2025-rules: Server-Side Only, Values Pinned | 1 (tests pin validated values) | Full `pnpm test` run — all table values asserted | ✅ COMPLIANT (S1a) |
| player-progression: Player Entity Reconciliation | 2 (backfill by roster id; unknown skipped) | `lib/players.test.ts` (4) — idempotent, skipUnknown | ✅ COMPLIANT (S1a/S2) |
| player-progression: PE Spending | 3 (primary bought; dead 409; insufficient 400) | `improve/route.test.ts` (17) — purchase, alive guard, PE guard | ✅ COMPLIANT (S4) |
| player-progression: Random Skill Roll | 1 (roll then choose) | `improve/route.test.ts` — random-roll 2-candidate + random-pick dedupe/ownership re-roll | ✅ COMPLIANT (S4) |
| player-progression: Élite Marking + Value Recalc | 2 (normal +10k; élite +20k + `$` badge) | `lib/value.test.ts` + `ProgressionPanel.test.tsx` (élite badge/tooltip, 20k) | ✅ COMPLIANT (S4) |
| player-progression: Injury Persistence + Alive Guard | 1 (death persisted) | `result/route.test.ts` persistCasualtyOutcomes (alive:false, injuries[]) | ✅ COMPLIANT (S2b) |
| match-result: Result Authorization | 4 (captain ok; foreign 404; unauth 401; captain correct 403) | `result/route.test.ts` (21) — 401/404/403/409 semantics | ✅ COMPLIANT (S2) |
| match-result: Score Validation | 2 (valid accepted; ΣTD≠score 400) | `result/route.test.ts` — scoresMatchReportedTotals, winner derived | ✅ COMPLIANT (S2) |
| match-result: Atomic Result Transaction | 2 (all rewards; petty cash TV diff) | `result/route.test.ts` — one `$transaction`, computePettyCash | ✅ COMPLIANT (S2) |
| match-result: Already-Played Guard + Idempotency | 2 (repeat 409; forfeited 409) | `result/route.test.ts` — played/repeat + forfeit 409 | ✅ COMPLIANT (S2) |
| match-result: Admin-Only Correction + Audit | 2 (audited; spent PE never revoked) | `result/route.test.ts` — MatchResultCorrection + `max(0,new−old)` | ✅ COMPLIANT (S2) |
| league-season: Matchday Fixture Fields | 4 (lifecycle; cascade; winnerId-alone not played; result marks played) | `lib/roundRobin.test.ts` + `app/api/leagues/[id]/route.test.ts` (+ `e2e/match-report.spec.ts` 2–0 → Jornada completa live) | ✅ COMPLIANT (S1b/S5) |
| league-season: Jornada Round Completion | 3 (complete; incomplete; winnerId-only not complete) | `app/api/leagues/[id]/route.test.ts` — round `complete` boolean | ✅ COMPLIANT (S1b) |
| league-season: Fixture Result Exposure | 2 (MatchCard score; result overrides schedule) | `MatchCard.test.tsx` (21) + `e2e/match-report.spec.ts` (score + Jornada completa live) | ✅ COMPLIANT (S3/S5) |
| matchday-forfeit: Forfeit Sets winnerId | 7 (winner home/away 400; scheduled allowed; repeat 409; closes proposals; walkover skips PE; result-on-forfeit 409; forfeit-on-result 409) | `forfeit/route.test.ts` + `result/route.test.ts` mutual-exclusion 409s | ✅ COMPLIANT (S2) |
| race-data-bb2025: REQ-RACE-07 Positional Qty + Access Data | 7 (subset verified; normalize letters; missing `[]`; canonical order; category mapping; min 0; min defined) | `features/teams/data/races.test.ts` + `race` data — accessPrimary/Secondary, min≤max | ✅ COMPLIANT (S1a) |
| race-data-bb2025: REQ-RACE-08 Catalog Élite Flag | 3 (élite marked; mandatory not élite; unlisted non-élite) | `features/teams/data/skills.test.ts` (12) + `ProgressionPanel.test.tsx` (`$` badge only on élite) | ✅ COMPLIANT (S1a/S4) |

**Compliance summary**: 23/23 requirements, **63/63 scenarios** COMPLIANT — every scenario is covered by a passing runtime test (full unit+route+component suite 926/926, local e2e 21/21, auth e2e match-report 2/2). **This is the final full-change gate: the entire change is green.**

## Correctness (Static + Runtime Evidence — S5-owned items)

| Item | Status | Notes |
|------|--------|-------|
| Owner progression fetch (GET /api/teams/[id]/progression) | ✅ Implemented + runtime-proven | `app/api/teams/[id]/progression/route.ts` — owner-only (`team.findFirst where userId, archivedAt:null`), 404 no-leak for foreign/archived, 401 unauth, empty list when no Player rows. 5 route tests + real-DB e2e (page shows Progresión + `pe-pl1`) |
| Page wiring: owner fetches + onImprove(rosterPlayerId, body) | ✅ Implemented + runtime-proven | `app/teams/[teamId]/page.tsx` — `localTeam` present ⇒ fetchTeamProgression, passes `progression` + `onImprove` that calls improvePlayer then refreshes rows; guests/scouted get `progression: undefined` + `onImprove: undefined` (read-only). 2 new page tests (Progresión renders with pe badge; 404 fallback read-only) |
| TeamDetailView.onImprove signature | ✅ Implementation-adherent | signature `(rosterPlayerId, body)` line 45; each panel binds `(body) => onImprove(panel.rosterPlayerId, body)` line 131 |
| result-route `ballHeld` bug fix + regression | ✅ Fixed + regression-proven | `result/route.ts` line 81 reads `team.ballHeld` with `heldBall` fallback (`typeof team.ballHeld === "boolean" ? team.ballHeld : team.heldBall`) — fixes S3 latent bug (real UI ResultPayload sends `ballHeld`, route previously read `heldBall` → 400 every load). Regression test `accepts the client-contract ballHeld field` (route.test.ts 21/21) |
| improve route `[teamId]`→`[id]` boot fix | ✅ Fixed | `app/api/teams/[id]/players/[playerId]/improve/route.ts` — folder renamed to `[id]` (URL unchanged `/api/teams/[id]`), destructures `{ id: teamId, playerId }`; resolves Next.js dev-server `[id]`/`[teamId]` segment boot clash. `pnpm dev` verified bootable (auth e2e webServer boots dev in auth mode) |
| e2e real-DB journeys | ✅ Runtime-proven (2 passed) | `e2e/match-report.spec.ts` — uniqueEmail pattern, deterministic 2-member league (one 1-jornada fixture), exactly 6 MJP nominations per team, result→score→Jornada completa, PE→Block élite→`$` badge, admin correction→score updates |
| Playwright wiring | ✅ Adherent | `playwright.config.auth.ts` testMatch line 23 includes `**/match-report.spec.ts`; `playwright.config.ts` testIgnore line 26 excludes it from local runs |
| ROADMAP / spec-label polish | ✅ Applied | ROADMAP match report → Completado; player-progression élite label fixed (Apariencia asquerosa NOT élite) — carried to archive merge (spec kept untracked) |

## Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| Owner-team progression fetch under `[id]` + onImprove wiring (design fork 6A) | ✅ Yes | `features/teams/api.ts` fetchTeamProgression + improvePlayer; page passes both; read-only fallback on failure |
| Result payload contract `ballHeld` (design interface line 85) | ✅ Yes (fixed) | Route now reads the design-canonical `ballHeld`; `heldBall` legacy fallback retained |
| Improve route URL stability (`/api/teams/[id]/players/{pid}/improve`) | ✅ Yes | URL unchanged; only the folder segment is renamed `[id]` to satisfy Next segment constraints |
| e2e validates the S2/S3 result contracts end-to-end | ✅ Yes | Real-DB load + correction exercises the actual ResultModal, MatchCard, ProgressionPanel |
| ROADMAP/archive prep (spec delta merge deferred to archive) | ✅ Yes | Spec fix staged for archive phase; spec folder untracked by design |

**Design deviations (carried, non-breaking)**: random-pick sends the skill NAME not a catalog SkillId (user-approved — ~51/72 random skills lack catalog ids); attribute increases are value-neutral (spec only mandates skill value recalc). Both already recorded in S4 and un-changed by S5.

## TDD Compliance (Strict TDD)

| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | apply-progress topic `sdd/match-report/apply-progress` obs #304 (S5 TDD Cycle Evidence table) |
| All S5 tasks have tests | ✅ | 4/4 work items: progression route (5), api client (4), page wiring (10), ballHeld regression (result 21) |
| RED confirmed (test files exist) | ✅ | route.test.ts, api.test.ts, page.test.tsx, result/route.test.ts all present and counted |
| GREEN confirmed (tests pass) | ✅ | All confirmed on execution: 5+4+10+21 = 40 S5-scoped tests pass (plus improve 17 regression) |
| Triangulation adequate | ✅ | progression: owner rows/401/foreign 404/archived 404/empty (5 distinct). api: fetch ok/err, improve ok/err (4). page: progression renders with pe badge + read-only 404 fallback (2 new). ballHeld: accepts `ballHeld` + `heldBall` legacy in same suite |
| Safety Net for modified files | ✅ | page.test.tsx had existing tests (8 pre→10); ballHeld regression appended to existing result route test (20→21); other files new (N/A) |
| REFACTOR | ➖ | Subjective; trusted per protocol |

**TDD Compliance**: 6/6 checks passed

Cumulative full-change TDD: all 26 tasks across slices carry test evidence confirmed by the green 926-test suite + 2 auth e2e journeys.

## Test Layer Distribution (S5 files + full change regression)

| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit (pure rules/helpers) | ~150 | lib/rules/*, lib/*.test | vitest |
| Route (mocked prisma/auth) | 60+ | result (21), improve (17), progression (5), forfeit, leagues | vitest + vitest-mock |
| Component | 100+ | ProgressionPanel, TeamDetailView, MatchCard, LeagueDetail, page.test | vitest + @testing-library/react |
| E2E (real browser + Postgres, auth) | 2 (+ ~19 other auth suites) | e2e/match-report.spec.ts | Playwright + Auth.js |
| E2E (local anonymous) | 21 | all local specs (match-report excluded) | Playwright |

## Changed File Coverage

Coverage analysis skipped — no coverage tool configured (informational, non-blocking).

## Assertion Quality

Scanned the S5 test files (progression route test, features/teams/api.test, the two new page-wiring tests, the ballHeld regression). No tautologies, no ghost loops, no type-only-alone assertions, no smoke-only tests, no CSS-class/implementation trivials. Assertions verify real behavior with concrete values: exact HTTP status codes (200/401/404), exact `toEqual` PlayerProgressionCore shapes, exact fetch URL + method (`/api/teams/t1/progression`, POST with content-type), mutation absence (`findMany not called`), PE badge text `"6"`, and the `ballHeld` case asserting 200 + one transaction. Mock usage is paired with concrete assertions (not mock-heavy).

**Assertion quality**: ✅ All assertions verify real behavior.

## Quality Metrics

**Linter**: ✅ No errors — `pnpm lint` exit 0.
**Type Checker**: ✅ No errors — `npx tsc --noEmit` exit 0.
**Coverage**: ➖ Not available — no coverage tool detected. Informational.

## Scope / No-Drift Check (S5)

- ✅ `git diff main...HEAD --stat` (15 files, +820/−12 ≈ 832 authored lines, matching apply-progress): progression route + route.test (new), features/teams/api.ts + api.test (new), app/teams/[teamId]/page.tsx + page.test (wiring), TeamDetailView.tsx (onImprove signature), result/route.ts + route.test (ballHeld fix), improve/route.ts + route.test (folder rename `[id]`), e2e/match-report.spec.ts (new), playwright.config.ts + playwright.config.auth.ts (wiring), ROADMAP.md. Exactly the S5 scope from design/tasks 6.1–6.3 and apply-progress. **No scope creep.**
- ✅ No schema/migration delta (PlayerPendingRoll already existed from S1a).
- ✅ No other scripts/pages touched outside the listed S5 files.
- ⚠️ S5 ~832 authored lines exceeds the 400-line review budget — explicitly accepted as size-exception by maintainer (stacked chain, PR6/6 final), driven by the 322-line e2e spec + two bug fixes. Recorded for transparency, not a defect.

## Issues Found

**CRITICAL**: None

**WARNING**:
1. **S5 exceeds 400 changed lines (~832 authored)** — accepted as size-exception by maintainer on the stacked-to-main chain (final PR 6/6). e2e spec alone is 322 lines (2 heavy real-DB journeys). Recorded for transparency.
2. **Carried (apply-progress #2)**: random-pick sends the skill NAME, not a catalog SkillId — user-approved deviation (~51/72 random-table skills lack catalog entries); validated strictly against the two pending candidates.
3. **Carried (S4)**: Attribute increases are value-neutral (spec mandates skill value recalc only); not a spec failure.
4. **Pre-existing auth-suite flake (apply-progress #4)**: the full `test:e2e:auth` suite can flake once on `league-matchday adminAsBye` (negotiation retry) — passes on re-run, unrelated to this slice. The match-report spec itself is stable (2/2). Full-auth run not re-executed this session beyond the scoped match-report suite (documented).

**SUGGESTION**:
1. After archive, PR refs in ROADMAP should be finalized to the merged slice numbers (S4 #53 already merged; S5 PR pending).
2. The progression page makes a second progression fetch after `improvePlayer` completes; an `onImprove` that returned the fresh row would save one round-trip. Minor, non-blocking.
3. Detail/creation/leagues UI copy is Spanish but the `block` catalog skill lacks an es translation (renders "Block"); the e2e asserts "Block" deliberately. Adding "Placar" as a catalog es label would match the league-section localization pattern.

## Verdict

**PASS WITH WARNINGS**

The final slice S5 is implemented, runtime-green, and the FULL CHANGE closes green: all 26 tasks complete, 23/23 requirements and 63/63 scenarios across the 6 specs COMPLIANT, backed by the full unit+route+component suite (81 files / 926 passed, exit 0), `pnpm lint` clean, `npx tsc --noEmit` clean, local e2e 21/21, and the two real-DB auth e2e journeys 2/2 (result→score→Jornada completa, PE→Block élite→`$` badge, admin correction→score update). The S3 latent `ballHeld` bug is fixed with a regression test; the S4 improve-route `[teamId]→[id]` boot clash is resolved so `pnpm dev`/auth e2e boots. Owner-team progression wiring fetches live and binds `onImprove(rosterPlayerId, body)` with a read-only guest/rival fallback. No scope drift (exactly 15 S5 files). The 4 WARNINGs are size/deviation/transparency items (all carried, non-spec-failing, non-blocking). Strict TDD 6/6. No CRITICAL findings, no blockers.

**Next phase**: archive — merge the delta specs (incl. the fixed player-progression élite label) into `openspec/specs/`, finalize ROADMAP PR refs, and close the change.

## Key Learnings

1. The S3 result route read `heldBall` while the client ResultPayload contract sends `ballHeld`, so every real UI result load returned 400; only real-DB e2e surfaced it, and the S5 fix reads `ballHeld` with a `heldBall` legacy fallback plus a regression test.
2. Next.js forbids mixing `[id]` and `[teamId]` at the same route segment under `app/api/teams`, so the S4 improve route folder was renamed to `[id]` (URL unchanged) to restore `pnpm dev` boot.
3. The full-change rollup across match-report's six specs is 23 requirements and 63 scenarios; every scenario is covered by a passing runtime test in the 926-test suite or the 2 real-DB auth e2e journeys.
4. Real-DB e2e uses a sequential-article 2-member league yielding exactly one fixture, six different MJP nominations per team (the route requires exactly six), and unique email/name suffixes so the persisted Postgres never collides across runs.
5. Local playwright config excludes `match-report.spec.ts` via `testIgnore` while the auth config includes it via `testMatch`, so real-DB journeys run only behind `AUTH_MODE=auth` + Postgres.
