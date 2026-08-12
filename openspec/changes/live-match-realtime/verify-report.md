```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:a6e32a878db5ee8d4fb0a8af18df58920bbf7c5428c1f7269530cb6a6dc1faac
verdict: fail
blockers: 1
critical_findings: 1
requirements: 13/14
scenarios: 36/37
test_command: pnpm test
test_exit_code: 0
test_output_hash: sha256:8ea9a35e68ed30da92478b817fc38e7b78a6bc357ac1325f7461debe9cb097c8
build_command: npx tsc --noEmit
build_exit_code: 0
build_output_hash: sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

# Verification Report — live-match-realtime

**Change**: live-match-realtime
**Version**: N/A (first shipped change)
**Mode**: Strict TDD
**Date**: 2026-08-12
**Verdict**: **FAIL** — the authoritative auth e2e suite is red (`live-match.spec.ts`), so the change is not verified clean despite the full unit/lint/tsc/local-e2e gates being green.

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 22 |
| Tasks complete | 22 (`[x]` verified) |
| Tasks incomplete | 0 |
| PRs merged to main | 6 (#61–#66) |

`tasks.md` contains exactly 22 `[x]` task markers and 0 `[ ]` (verified by count).

## Build & Tests Execution

**Build / type-check**: ✅ `npx tsc --noEmit` → exit 0, no output.
**Lint**: ✅ `pnpm lint` → clean (no errors/warnings).
**Tests (unit)**: ✅ focused 148/148; full `pnpm test` = 1066/1066 on the canonical run (see WARNING below on a 1-of-5 flake).

```text
Focused: 14 files, 148/148 passed (liveAccess 13, liveHub 10, liveMatch 14,
liveStore 8, leagues route 11, live route 15, fixture route 9, useLiveMatch 7,
MatchView 11, liveEventLabels 8, resultPrefill 5, ResultModal 16, LeagueDetail 14,
CreateLeagueModal 7).
Full: pnpm test → Test Files 92 passed (92); Tests 1066 passed (1066).
```

**Local E2E**: ✅ `AUTH_MODE=local pnpm exec playwright test` → 21/21 passed (12.6s). `--list` shows 21 tests; `live-match.spec.ts` is in the local `testIgnore`.

**Auth E2E (authoritative)**: ❌ **`pnpm run test:e2e:auth` → 26/27, 1 FAILED** (~2.2m). 26 passed including all pre-existing suites; `e2e/live-match.spec.ts:197` failed.

**Coverage**: ➖ Not available — no `@vitest/coverage` provider configured. Stats import only; per-file/line coverage not measured.

## Spec Compliance Matrix

### live-match-realtime (LM-1 … LM-10)

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| LM-1 SSE Transport | Coach subscribes | `live/route.test.ts` GET snapshot | ✅ COMPLIANT |
| LM-1 | Control POST mutates and fans out | `live/route.test.ts` POST 200 + publish-after-commit | ✅ COMPLIANT |
| LM-2 Auth Gates | Unauthenticated rejected | `liveAccess.test.ts` + `live/route.test.ts` 401 | ✅ COMPLIANT |
| LM-2 | Owner and member subscribe | `liveAccess.test.ts` STARTED owners/members | ✅ COMPLIANT |
| LM-2 | Foreign user hidden | `liveAccess.test.ts` 404 no leak | ✅ COMPLIANT |
| LM-2 | Spectator control denied | `live/route.test.ts` POST 403 no mutation | ✅ COMPLIANT |
| LM-2 | Local mode 401 parity | `liveAccess.test.ts` authEnabled=false 401 | ✅ COMPLIANT |
| LM-3 Lifecycle | Start from scheduled fixture | `liveMatch.test.ts` startMatch + `liveStore` P2002 | ✅ COMPLIANT |
| LM-3 | Replay rejected | `liveMatch.test.ts` canStart on played/result | ✅ COMPLIANT |
| LM-4 Turn Model | Turn alternation enforced | `liveMatch.test.ts` out-of-turn throws | ✅ COMPLIANT |
| LM-4 | Turn end flips side | `liveMatch.test.ts` endTurn flips + turn event | ✅ COMPLIANT |
| LM-4 | Eight-turn half flip | `liveMatch.test.ts` half-1-8 → half 2 away | ✅ COMPLIANT |
| LM-5 Clocks | League creation accepts option | `app/api/leagues/route.test.ts` default/persist/400 | ✅ COMPLIANT |
| LM-5 | Duration comes from league config | `liveMatch.test.ts` 360 from League row | ✅ COMPLIANT |
| LM-5 | Clocks disabled league | `liveMatch.test.ts` fields inert + `liveHub.test.ts` no tick | ✅ COMPLIANT |
| LM-5 | Active clock runs, other pauses | `liveMatch.test.ts` toLiveViewState | ✅ COMPLIANT |
| LM-5 | Restart recompute | `liveStore.test.ts` persisted timestamps | ✅ COMPLIANT |
| LM-6 Events | Event recorded with sequence | `liveStore.test.ts` seq bump + event rows | ✅ COMPLIANT |
| LM-6 | Catch-up returns missing events only | `live/route.test.ts` gap replay + dedup | ✅ COMPLIANT |
| LM-7 Disconnect | Grace pause after disconnect | `liveHub.test.ts` 10s + `liveStore` pause | ✅ COMPLIANT |
| LM-7 | Resume on reconnect | `liveHub.test.ts` + `liveStore` resume | ✅ COMPLIANT |
| LM-8 Recovery | Snapshot-first subscribe | `live/route.test.ts` + `useLiveMatch.test.tsx` | ✅ COMPLIANT (unit) |
| LM-8 | Reconnect catch-up Last-Event-ID | `useLiveMatch.test.tsx` reconnect | ✅ COMPLIANT (unit) |
| LM-8 | Control restored on new device | `useLiveMatch.test.tsx` + auth e2e (passed portion) | ✅ COMPLIANT (unit; e2e partial) |
| LM-9 Result Handoff | Prefill from live state | `resultPrefill.test.ts` 5/5 + `ResultModal.test.tsx` 16/16 + `LeagueDetail.test.tsx` — **auth e2e integration FAILED** | ❌ **FAILING (e2e)** |
| LM-9 | POST validation still authoritative | `ResultModal.test.tsx` POST assembly + existing route | ✅ COMPLIANT |
| LM-10 Persistence | Events persist from day one | `liveStore.test.ts` + MatchView timeline (unit) | ✅ COMPLIANT |
| LM-10 | Rulebook-light audit | lint clean, `liveEventLabels.ts` Spanish, no new deps (package.json) | ✅ COMPLIANT |
| LM-10 | E2E runs in auth suite only | `playwright.config.auth.ts` match + `playwright.config.ts` ignore, local `--list` 21 | ✅ COMPLIANT |

### leagues delta (turn-clock creation option)

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| League Model | Turn-clock option persisted | `app/api/leagues/route.test.ts` | ✅ COMPLIANT |
| League User-Scoped API | Creation accepts the clock option | `CreateLeagueModal.test.tsx` + route test | ✅ COMPLIANT |
| League User-Scoped API | Invalid duration rejected | `app/api/leagues/route.test.ts` 3600→400, no league | ✅ COMPLIANT |
| League User-Scoped API | Option immutable after creation | No update path on `app/api/leagues` POST; route test | ✅ COMPLIANT |

### match-view delta (MV-5 / MV-6)

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| MV-5 Inert Live Shells | Live fixture shows live UI | `MatchView.test.tsx` live render | ✅ COMPLIANT |
| MV-5 | No live UI for static states | `MatchView.test.tsx` `not.toMatch(/turno\|tiempo\|evento\|minuto\|½/i)` | ✅ COMPLIANT |
| MV-6 Out-of-Scope Lock | Timeline shown for live and played | `MatchView.test.tsx` FinishedLiveTimeline + route live DTO | ✅ COMPLIANT |
| MV-6 | Replay and public viewing stay out | No replay/public routes; DTO/route audit | ✅ COMPLIANT |

**Compliance summary**: 36/37 scenarios compliant at unit/route/component level; **LM-9 “Prefill from live state” is NOT verified at the integration/e2e layer because the authoritative auth e2e failed on exactly that prefill assertion** (and the failure is a real, ~50%-reproducible test defect described below).

## Acceptance Criteria Traceability

| AC | Covered by | Status |
|----|------------|--------|
| AC-1 | liveAccess role matrix + route GET/POST | ✅ green |
| AC-2 | POST control gates + transition 409s | ✅ green |
| AC-3 | pure invariants (alternation/double/8-turn/half) | ✅ green |
| AC-4 | snapshot + seq gap replay/dedup + optimistic seq 409 | ✅ green |
| AC-5 | MatchView static-state guard | ✅ green |
| AC-6 | prefill scores+ΣTD; POST authoritative | ⚠️ unit green, e2e red |
| AC-7 | tokens/Spanish/no icons | ✅ green |
| AC-8 | snapshot-first + new-device | ✅ unit green; e2e partial |
| AC-9 | hub grace/pause/resume | ✅ green |
| AC-10 | league option persisted at creation | ✅ green |

## TDD Compliance (Strict TDD)

| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | apply-progress has a TDD Cycle Evidence table per PR |
| All tasks have tests | ✅ | 22/22; structural tasks (1.4/1.5/1.7) verified via db:generate/tsc/migration |
| RED confirmed (tests exist) | ✅ | 22/22 test files verified present + passing |
| GREEN confirmed (tests pass) | ✅ | focused 148/148; full 1066/1066 canonical |
| Triangulation adequate | ✅ | 14 liveMatch, 10 hub, 5 prefill, 7 hook — multi-case |
| Safety Net for modified files | ✅ | 6/6, 4/4, 16/16, 18/18, 14/14, 13/13, 7/7, 21/21, 12/12 reported |

**TDD Compliance**: 6/6 checks passed.

## Test Layer Distribution

| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit (pure / injected / route) | ~86 | 9 | vitest, zero-mock pure fns + `vi.hoisted` mocks |
| Integration (components/hooks) | ~62 | 6 | @testing-library/react, fake EventSource + fetch stubs |
| E2E (auth suite) | 1 | 1 | Playwright (browser contexts) |
| **Total** | **~148 focused** | **16** | |

## Changed File Coverage

**Coverage analysis skipped — no coverage tool detected** (`@vitest/coverage` not installed). Not a failure.

## Assertion Quality

✅ All assertions in the inspected new tests (`resultPrefill.test.ts`, `liveMatch.test.ts`, `liveAccess.test.ts`, `liveHub.test.ts`, `liveStore.test.ts`, `MatchView.test.tsx`, `useLiveMatch.test.tsx`, `liveEventLabels.test.ts`) verify real behavior — specific value assertions with companion non-empty/positive-checks; no tautologies, no ghost loops, no type-only-alone assertions, no smoke-only renders.

## Quality Metrics

**Linter**: ✅ No errors/warnings on changed files (whole-project `pnpm lint` clean).
**Type Checker**: ✅ `npx tsc --noEmit` exit 0, no errors in changed files.

## Coherence (Design D1–D13)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| D1 SSE route + HTTP POST, JWT cookie | ✅ | `live/route.ts` GET streams; POST dispatch |
| D2 DB authoritative + in-memory hub | ✅ | `LiveMatch`/`LiveEvent` rows authoritative; `liveHub` fan-out |
| D3 Hub 1s ticker, server-derived clocks | ✅ | ticker gated on `turnClockEnabled` |
| **D4 Clock-0 auto-ends turn** | ⚠️ **NOT implemented** | Documented in `liveMatch.ts` comment only; no code path bridges hub tick at 0 to `applyEndTurn`. Not a spec scenario → WARNING |
| D5 Auto-finish triggers + explicit endMatch | ✅ | half-2-8 / TD-in-half-2-8 finish; `applyEndMatch` |
| D6 10s active-coach grace, clocks-enabled only | ✅ | `liveHub` grace keyed to active coach; store pause/resume |
| D7 Catch-up: snapshot-first + seq gap replay | ✅ | GET snapshot-first, gap by `seq > snapshot.seq`, dedup |
| D8 Extend fixture GET with `live` DTO | ✅ | `fixtures/[fixtureId]/route.ts` returns `live` |
| D9 Control 403/404 split | ✅ | `resolveLiveAccess` spectator→403, foreign→404 |
| D10 Casualty band coach-reported, immutable | ✅ | `recordCasualty` band in payload; result POST authoritative |
| D11 TD ends turn / half-2-8 TD finishes | ✅ | `applyTD` |
| D12 e2e helpers local to spec | ✅ | helpers local to `live-match.spec.ts` |
| D13 Clock config source = League row | ✅ | `FixtureContext.league.turnClock*`; DTO carries only `turnClockEnabled` |

## Issues Found

**CRITICAL**

1. **Authoritative auth e2e is RED — `e2e/live-match.spec.ts:197` fails.** `pnpm run test:e2e:auth` → **26/27, 1 failed**. The failing assertion (`Goles {adminTeam}` expected "0", received "1") is a **false assumption in the test, not a production bug**: the test hard-codes that the league-owner (admin) is the fixture's HOME team, but `buildRoundRobin` **shuffles** team ids (Fisher-Yates, `lib/roundRobin.ts`) before pairing. When admin lands on the AWAY side of the fixture (~50% of runs), the away TD correctly pre-fills the admin section with "1" and `expect(...).toHaveValue("0")` fails. The apply-progress PR 6 claim of "27/27 passed" was a home-flip run — non-reproducible. The production prefill logic is correct; the **e2e test must derive home/away from the actual fixture** (e.g. `fixtureAndScorers` already returns home/away), not assume admin=home. This blocks archive-ready verification.

**WARNING**

2. **Flaky unit test.** Full `pnpm test` failed once (1/1066) in the first of 5 runs — the stack pointed at `features/leagues/useLiveMatch.test.tsx` `applyState` (timing race under full-suite parallel load). 4 subsequent runs were green 1066/1066. Low-frequency flake in the fake-EventSource integration test — should be made deterministic (e.g. await snapshot apply before asserting).

3. **Design D4 “clock reaching 0 auto-ends the turn” is documented but NOT implemented.** The hub ticker decrements the active clock each second but never triggers `applyEndTurn` when a clock reaches 0, and `liveMatch.ts` has no clock-expiry transition. No spec scenario requires clock-0 auto-end (LM-4/LM-5 don't), so this is a design deviation, not a spec break. If the house rule needs it, implement + test; otherwise drop the D4 claim from the design.

4. **Dev-mode ops constraint (documented, accepted).** The in-memory `liveHub` singleton is re-instantiated per request under `next dev` (Turbopack module isolation), so live SSE fan-out between two co-tested browser contexts is not observable in the e2e; the e2e correctly relies on the DB-backed snapshot-first convergence. This is correctly documented in apply-progress PR 6. **Deploy MUST run a single `next start` process** for the fan-out contract — worth a runbook note.

**SUGGESTION**

5. **`foul`/`casualty` events do not flip the turn or enforce the active side** — they are append-record-only transitions (no alternation check). This matches D9/LM-9 intent (result POST stays authoritative) but should be a deliberate, tested decision rather than implicit.

## Verdict

**FAIL** — the authoritative auth e2e suite is red (`live-match.spec.ts:197` prefill assertion fails nondeterministically because the test assumes admin=home while round-robin shuffles team sides). All unit/route/component tests, lint, tsc, and the local e2e are green; the production implementation matches the specs and design (except D4 clock-0 auto-end, a non-spec design gap). The single verified covering test for LM-9's integration path failed, so the change does not pass independent runtime verification. Clean up the e2e assumption (and the flaky hook test) and re-verify before archive.
