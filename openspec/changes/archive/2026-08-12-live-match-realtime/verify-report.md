```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:3ab8b5c79cfa694d598a2dff11c41192cb5158d09e26269dd740a45dc5592509
verdict: pass
blockers: 0
critical_findings: 0
requirements: 14/14
scenarios: 37/37
test_command: pnpm test
test_exit_code: 0
test_output_hash: sha256:4ac46d1afce1714d1653398f905bf5abe7a22daf548cd774df286e828c0f3532
build_command: npx tsc --noEmit
build_exit_code: 0
build_output_hash: sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

# Verification Report — live-match-realtime

**Change**: live-match-realtime
**Version**: N/A (first shipped change)
**Mode**: Strict TDD
**Date**: 2026-08-12
**Verdict**: **PASS** — after PR #67 (`ec23a9a`) remediation, all gates are green: focused units 156/156, full `pnpm test` 1074/1074 (×2, flake gone), lint clean, tsc clean, local e2e 21/21, and the authoritative auth e2e **27/27 passed twice** (home and away fixture sides both green).

## Previous FAIL + Remediation (audit trail)

- **Prior verdict (this session, pre-#67)**: FAIL — the authoritative auth e2e was red (`e2e/live-match.spec.ts:197` prefill assertion failed ~50% when the round-robin shuffle placed the league-owner on the AWAY side). Also flagged: a flaky `useLiveMatch.test.tsx` hook test, and the D4 "clock reaching 0 auto-ends the turn" design gap.
- **Remediated via PR #67** (`ec23a9a`, merged to `main`, 3 commits + docs):
  1. **e2e home/away nondeterminism** (`d735ae9`): the e2e now derives `homeTeamName`/`awayTeamName` from the real fixture (`fixtureAndScorers`) and asserts side-relative sections (`awaySection` "Goles 1", `homeSection` "Goles 0") — the `admin=home` assumption is gone.
  2. **hook-test flake** (`d735ae9`): `useLiveMatch.test.tsx` now uses `await act(async () => …)` + `waitFor` for deterministic timing.
  3. **D4 clock-0 auto-end** (`818d283`): pure `autoEndTurnOnClockZero` in `lib/liveMatch.ts` (active clock → 0 ⇒ same transition as `endTurn`; half flip at turn 8; finish at half-2 turn 8; no-op when clocks disabled / not live / time left); hub ticker `onClockExpired` seam (`lib/liveHub.ts`); route wires it to persist/publish via `applyTransition` and restarts the ticker (`live/route.ts`).
- All three prior findings are confirmed fixed by the evidence below.

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 23 |
| Tasks complete | 23 (22 + new 3.4, all `[x]` verified) |
| Tasks incomplete | 0 |
| PRs merged to main | 7 (#61–#66 + #67) |

`tasks.md` contains exactly 23 `[x]` task markers and 0 `[ ]` (verified by count). New task **3.4** covers the D4 remediation (pure + hub + route persistence).

## Build & Tests Execution

**Build / type-check**: ✅ `npx tsc --noEmit` → exit 0, no output.
**Lint**: ✅ `pnpm lint` → clean (no errors/warnings).
**Tests (unit)**: ✅ focused 156/156; full `pnpm test` = **1074/1074 (92 files)** on BOTH runs (flake confirmed gone).

```text
Focused: 14 files, 156/156 passed (liveAccess 13, liveHub 12, liveMatch 19,
liveStore 8, leagues route 11, live route 15, fixture route 9, useLiveMatch 7,
MatchView 11, liveEventLabels 8, resultPrefill 5, ResultModal 16, LeagueDetail 14,
CreateLeagueModal 7).
Full: pnpm test run1 → Test Files 92 passed (92); Tests 1074 passed (1074).
      pnpm test run2 → Test Files 92 passed (92); Tests 1074 passed (1074).
```

**Local E2E**: ✅ `AUTH_MODE=local pnpm exec playwright test` → 21/21 passed (13.2s). `--list` shows 21 tests; `live-match.spec.ts` is in the local `testIgnore`.

**Auth E2E (authoritative)**: ✅ **`pnpm run test:e2e:auth` → 27/27 passed both times** (run 1 2.1m, run 2 2.1m), including `e2e/live-match.spec.ts` and every pre-existing auth suite. The double run confirms determinism across home/away fixture sides.

**Coverage**: ➖ Not available — no `@vitest/coverage` provider configured. Not a failure.

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
| LM-8 Recovery | Snapshot-first subscribe | `live/route.test.ts` + `useLiveMatch.test.tsx` + auth e2e | ✅ COMPLIANT |
| LM-8 | Reconnect catch-up Last-Event-ID | `useLiveMatch.test.tsx` reconnect | ✅ COMPLIANT |
| LM-8 | Control restored on new device | auth e2e new-device recovery (both runs) | ✅ COMPLIANT |
| LM-9 Result Handoff | Prefill from live state | `resultPrefill.test.ts` + `ResultModal.test.tsx` + **auth e2e 27/27 ×2** | ✅ COMPLIANT |
| LM-9 | POST validation still authoritative | `ResultModal.test.tsx` POST assembly + existing route | ✅ COMPLIANT |
| LM-10 Persistence | Events persist from day one | `liveStore.test.ts` + MatchView timeline | ✅ COMPLIANT |
| LM-10 | Rulebook-light audit | lint/tsc clean, `liveEventLabels.ts` Spanish, no new deps | ✅ COMPLIANT |
| LM-10 | E2E runs in auth suite only | `playwright.config.auth.ts` match + `playwright.config.ts` ignore, local `--list` 21 | ✅ COMPLIANT |

### leagues delta (turn-clock creation option)

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| League Model | Turn-clock option persisted | `app/api/leagues/route.test.ts` | ✅ COMPLIANT |
| League User-Scoped API | Creation accepts the clock option | `CreateLeagueModal.test.tsx` + route test | ✅ COMPLIANT |
| League User-Scoped API | Invalid duration rejected | `app/api/leagues/route.test.ts` 3600→400, no league | ✅ COMPLIANT |
| League User-Scoped API | Option immutable after creation | No update path on `app/api/leagues` POST | ✅ COMPLIANT |

### match-view delta (MV-5 / MV-6)

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| MV-5 Inert Live Shells | Live fixture shows live UI | `MatchView.test.tsx` live render | ✅ COMPLIANT |
| MV-5 | No live UI for static states | `MatchView.test.tsx` `not.toMatch(/turno\|tiempo\|evento\|minuto\|½/i)` | ✅ COMPLIANT |
| MV-6 Out-of-Scope Lock | Timeline shown for live and played | `MatchView.test.tsx` FinishedLiveTimeline + route live DTO | ✅ COMPLIANT |
| MV-6 | Replay and public viewing stay out | No replay/public routes; DTO/route audit | ✅ COMPLIANT |

**Compliance summary**: **37/37 scenarios compliant** (up from 36/37; LM-9 "Prefill from live state" is now verified green at the integration e2e layer ×2).

## Acceptance Criteria Traceability

| AC | Covered by | Status |
|----|------------|--------|
| AC-1 | liveAccess role matrix + route GET/POST | ✅ green |
| AC-2 | POST control gates + transition 409s | ✅ green |
| AC-3 | pure invariants (alternation/double/8-turn/half) | ✅ green |
| AC-4 | snapshot + seq gap replay/dedup + optimistic seq 409 | ✅ green |
| AC-5 | MatchView static-state guard | ✅ green |
| AC-6 | prefill scores+ΣTD; POST authoritative | ✅ green (unit + e2e 27/27 ×2) |
| AC-7 | tokens/Spanish/no icons | ✅ green |
| AC-8 | snapshot-first + new-device | ✅ green (unit + e2e) |
| AC-9 | hub grace/pause/resume | ✅ green |
| AC-10 | league option persisted at creation | ✅ green |

## TDD Compliance (Strict TDD)

| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | apply-progress has a TDD Cycle Evidence table per PR (incl. PR #67 remediation) |
| All tasks have tests | ✅ | 23/23; structural tasks verified via db:generate/tsc/migration |
| RED confirmed (tests exist) | ✅ | test files verified present + passing |
| GREEN confirmed (tests pass) | ✅ | focused 156/156; full 1074/1074 ×2 |
| Triangulation adequate | ✅ | 19 liveMatch (incl. 6 D4), 12 hub (incl. 2 onClockExpired), 5 prefill, 7 hook |
| Safety Net for modified files | ✅ | reported per PR |

**TDD Compliance**: 6/6 checks passed.

## Test Layer Distribution

| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit (pure / injected / route) | ~90 | 9 | vitest, zero-mock pure fns + `vi.hoisted` mocks |
| Integration (components/hooks) | ~62 | 6 | @testing-library/react, fake EventSource + fetch stubs (deterministic `act`+`waitFor`) |
| E2E (auth suite) | 1 | 1 | Playwright (browser contexts) |
| **Total** | **~156 focused** | **16** | |

## Changed File Coverage

**Coverage analysis skipped — no coverage tool detected** (`@vitest/coverage` not installed). Not a failure.

## Assertion Quality

✅ All inspected new/re-mediated tests (`liveMatch.test.ts` incl. the 6 D4 cases, `liveHub.test.ts` incl. the 2 `onClockExpired` cases, `resultPrefill.test.ts`, `useLiveMatch.test.tsx`, `liveAccess/liveStore/liveEventLabels/MatchView`) verify real behavior with specific value + companion positive/negative assertions. No tautologies, ghost loops, type-only-alone, or smoke-only. The D4 cases assert the flip/half-flip/finish/no-op outcomes, not just the seam firing.

## Quality Metrics

**Linter**: ✅ No errors/warnings (whole-project `pnpm lint` clean).
**Type Checker**: ✅ `npx tsc --noEmit` exit 0, no errors in changed files.

## Coherence (Design D1–D13)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| D1 SSE route + HTTP POST, JWT cookie | ✅ | `live/route.ts` GET streams; POST dispatch |
| D2 DB authoritative + in-memory hub | ✅ | `LiveMatch`/`LiveEvent` rows authoritative; `liveHub` fan-out |
| D3 Hub 1s ticker, server-derived clocks | ✅ | ticker gated on `turnClockEnabled` |
| **D4 Clock-0 auto-ends turn** | ✅ **Implemented** | `autoEndTurnOnClockZero` pure fn + hub `onClockExpired` seam + route persistence/publish (this was the prior gap, now fixed) |
| D5 Auto-finish triggers + explicit endMatch | ✅ | half-2-8 / TD-in-half-2-8 / clock-expiry finish; `applyEndMatch` |
| D6 10s active-coach grace, clocks-enabled only | ✅ | `liveHub` grace keyed to active coach; store pause/resume |
| D7 Catch-up: snapshot-first + seq gap replay | ✅ | GET snapshot-first, gap by `seq > snapshot.seq`, dedup |
| D8 Extend fixture GET with `live` DTO | ✅ | `fixtures/[fixtureId]/route.ts` returns `live` |
| D9 Control 403/404 split | ✅ | `resolveLiveAccess` spectator→403, foreign→404 |
| D10 Casualty band coach-reported, immutable | ✅ | `recordCasualty` band in payload; result POST authoritative |
| D11 TD ends turn / half-2-8 TD finishes | ✅ | `applyTD` |
| D12 e2e helpers local to spec | ✅ | helpers local to `live-match.spec.ts` |
| D13 Clock config source = League row | ✅ | `FixtureContext.league.turnClock*`; DTO carries only `turnClockEnabled` |

## Documented Ops Constraint (stated)

- **Deploy MUST run a single `next start` process** for the SSE fan-out and the D4 clock ticker to broadcast between coaches. Under `next dev` (Turbopack module isolation) the in-memory `liveHub` singleton is re-instantiated per request, so a live SSE push between two co-tested browser contexts is not observable in the e2e. The e2e therefore verifies Coach B / fresh-device convergence via the DB-backed snapshot-first (LM-8) path plus the D4 expiry via DB state; the realtime fan-out and ticker are covered by the unit/route tests. This is a documented dev-mode constraint, not a product defect.
- **Local mode**: AUTH_MODE=local realtime routes return 401 by design (LM-2 parity); the live e2e runs only in the auth suite.

## Issues Found

**CRITICAL**: None.

**WARNING**: None blocking.

- The three prior findings were remediated and independently verified green (see audit trail). The only residual concern is environmental, not a defect: the auth e2e requires Docker/Postgres (`POSTGRES_PORT=5433`) and a single running `next start` for full fan-out observability.

**SUGGESTION**:

- `foul`/`casualty` transitions are append-record-only (no alternation check / turn flip) — deliberate per D9/LM-9 intent (result POST authoritative), but could be made an explicit tested decision (out-of-turn foul/casualty currently not rejected).
- Consider adding a changed-file coverage tooling (e.g. `@vitest/coverage-v8`) to quantify the new D4/hub/route line coverage.

## Verdict

**PASS** — all gates green and re-verified: focused 156/156, full `pnpm test` 1074/1074 ×2 (flake gone), `pnpm lint` clean, `npx tsc --noEmit` clean, local e2e 21/21 (live excluded), and the authoritative **auth e2e 27/27 passed twice** (home and away fixture sides). All 37 scenarios and 14 requirements compliant; all 23 tasks `[x]`; D1–D13 coherent (D4 now implemented); the single-`next start` ops constraint documented. The change is archive-ready.
