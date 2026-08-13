```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:bf3ade898caa44451b377c33b16554203b1601ae46126c5f568ff3686f48cd8a
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 14/14
scenarios: 60/60
test_command: pnpm test
test_exit_code: 0
test_output_hash: sha256:ad927435a3d87dba7bdeb67bdf56bcf5849d7d266881260081bae9929de82cd5
build_command: npx tsc --noEmit
build_exit_code: 0
build_output_hash: sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

## Verification Report

**Change**: live-match-flow
**Version**: delta specs (live-match-realtime, matchday-negotiation, match-result, leagues)
**Mode**: Strict TDD (test runner: `pnpm test` — vitest run)

**Status**: 5 chained PRs (#71-#75) merged to `main` (clean working tree, branch `main`).
All 22/22 tasks in `tasks.md` are `[x]`. The orchestrator brief cited "26 tasks" but the actual
task-list in `tasks.md` contains **22** actionable `- [x]` bullets (1a: 8, 1b: 4, 2: 4, 3: 3, 4: 3);
0 remain unchecked, so full verification was authorized and run.

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 22 |
| Tasks complete | 22 |
| Tasks incomplete | 0 |

### Build & Tests Execution
**Build / type-check**: ✅ Passed (`npx tsc --noEmit`, exit 0, clean)
**Lint**: ✅ Passed (`pnpm lint`, exit 0, clean)
**Full unit+integration**: ✅ 1124/1124 passed (93 files) — `pnpm test`
**Focused units**: ✅ 237/237 passed (16 work-unit files)
**Coverage**: ➖ Not configured/collected this run (no coverage threshold in project vitest config); Static inspection + full-suite green used as the runtime evidence gate.

**Local e2e**: ✅ 21/21 passed (`AUTH_MODE=local pnpm exec playwright test`; stale :3000 none; live-match begin-step correctly excluded from the local anonymous suite)
**Auth e2e (authoritative)**: ✅ 31/31 passed — **run twice** (both green, deterministic)

```text
Run 1: 31 passed (2.5m) — incl. live-match begin-step, rejornar, admin-correction,
       participant-correction, full-league-flow captain flip
Run 2: 31 passed (3.0m) — deterministic across randomized home/away
```

### Spec Compliance Matrix (60/60 scenarios compliant, 14/14 requirements complete)

**live-match-realtime (LM-3/5/7/11/12/13)**

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| LM-11 Consent/Ready | Second consent reaches ready | `lib/liveMatch.test.ts` consentStart + `liveStore.test.ts` | ✅ COMPLIANT |
| LM-11 | Consent waits indefinitely | `lib/liveMatch.test.ts` (pending at one consent, no clock) | ✅ COMPLIANT |
| LM-11 | Consent retracted back to pending | `lib/liveMatch.test.ts` retractConsent + `liveStore.test.ts` | ✅ COMPLIANT |
| LM-11 | Spectator/admin cannot consent | `live/route.test.ts` coach/admin gate 403 | ✅ COMPLIANT |
| LM-11 | Foreign user consent hidden | `live/route.test.ts` loadFixtureGate 404 | ✅ COMPLIANT |
| LM-11 | E2E begin step | `e2e/live-match.spec.ts` (auth, 2 consents → begin) | ✅ COMPLIANT |
| LM-12 Permissions | Active coach records events | `lib/livePhase.test.ts` matrix + `live/route.test.ts` | ✅ COMPLIANT |
| LM-12 | Non-active TD/foul rejected | `live/route.test.ts` side-guard 409 | ✅ COMPLIANT |
| LM-12 | Own-injury exception | `lib/livePhase.test.ts` + `live/route.test.ts` own-casualty 200 | ✅ COMPLIANT |
| LM-12 | Opponent injury denied | `lib/livePhase.test.ts` + `live/route.test.ts` 409 | ✅ COMPLIANT |
| LM-12 | Spectator+foreign denied | `live/route.test.ts` 403/404 | ✅ COMPLIANT |
| LM-12 | Viewer-side DTO | `MatchView.test.tsx` + `fixtures/[fixtureId]/route.test.ts` | ✅ COMPLIANT |
| LM-13 Turn Nudge | Turn-start notice | `live/route.test.ts` + `liveEventLabels.test.ts` ("Tu turno") | ✅ COMPLIANT |
| LM-13 | Nudge persists+notifies | `live/route.test.ts` requestTurn + `liveEventLabels.test.ts` ("Te piden el turno") | ✅ COMPLIANT |
| LM-13 | Nudge never flips turn | `live/route.test.ts` + `lib/liveMatch.test.ts` applyRequestTurn | ✅ COMPLIANT |
| LM-13 | Cooldown absorbs spam (optional) | `live/route.test.ts` 60s cooldown 409 | ✅ COMPLIANT |
| LM-3 Lifecycle | Consent on scheduled fixture | `liveStore.test.ts` consentLiveMatch + `live/route.test.ts` | ✅ COMPLIANT |
| LM-3 | Replay rejected | `liveStore.test.ts` 409 on played/result | ✅ COMPLIANT |
| LM-3 | Live only via first turn | `lib/liveMatch.test.ts` beginMatch + `live/route.test.ts` begin-not-ready 409 | ✅ COMPLIANT |
| LM-5 Unified Clock | Clock starts at kickoff | `lib/liveMatch.test.ts` beginMatch startedAt | ✅ COMPLIANT |
| LM-5 | Active side accumulates | `lib/liveMatch.test.ts` + `lib/liveHub.test.ts` ticker acc | ✅ COMPLIANT |
| LM-5 | Informational, no auto-end | `lib/liveHub.test.ts` (no decrement) + grep audit 0 refs | ✅ COMPLIANT |
| LM-5 | Restart/reconnect recompute | `lib/liveMatch.test.ts` deriveLiveClock + `fixtures/[fixtureId]/route.test.ts` DTO parity | ✅ COMPLIANT |
| LM-7 Disconnect | Grace pauses unified clock | `lib/liveStore.test.ts` pause bumps active acc + `lib/liveHub.test.ts` | ✅ COMPLIANT |
| LM-7 | Resume on reconnect | `lib/liveStore.test.ts` resume restarts segment | ✅ COMPLIANT |

**matchday-negotiation (Rejornar)**

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Rejornar | Re-open before scheduled date | `propose/route.test.ts` scheduled→200 | ✅ COMPLIANT |
| Rejornar | Played fixture locked | `propose/route.test.ts` + `accept/route.test.ts` played→409 | ✅ COMPLIANT |
| Rejornar | Panel gate widened | `NegotiationPanel.test.tsx` pending OR scheduled | ✅ COMPLIANT |
| Rejornar | History keeps old proposals | `NegotiationPanel.test.tsx` + `e2e/league-matchday.spec.ts` rejornar | ✅ COMPLIANT |
| Rejornar | Rejornar e2e | `e2e/league-matchday.spec.ts` (auth) propose+accept updates date | ✅ COMPLIANT |
| One Active Proposal | Counter-propose closes prior | `propose/route.test.ts` | ✅ COMPLIANT |
| One Active Proposal | Concurrent propose keeps one | `propose/route.test.ts` tx re-check | ✅ COMPLIANT |
| One Active Proposal | Propose re-opens on scheduled | `propose/route.test.ts` | ✅ COMPLIANT |
| Accept Sets scheduledAt | Other participant accepts | `accept/route.test.ts` | ✅ COMPLIANT |
| Accept Sets scheduledAt | Creator cannot self-accept | `accept/route.test.ts` 409 | ✅ COMPLIANT |
| Accept Sets scheduledAt | Accept re-schedules already-scheduled | `accept/route.test.ts` scheduledAt update | ✅ COMPLIANT |
| Accept Sets scheduledAt | Accept on closed proposal rejected | `accept/route.test.ts` 409 | ✅ COMPLIANT |
| Status Transition | Accept schedules; played overrides | `accept/route.test.ts` + fixture status | ✅ COMPLIANT |
| Status Transition | Re-scheduled fixture stays scheduled | `accept/route.test.ts` | ✅ COMPLIANT |

**match-result (Result Authorization + Correction with Audit)**

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Result Authorization | Captain loads a result | `result/route.test.ts` isAdmin‖isCaptain 200 | ✅ COMPLIANT |
| Result Authorization | Foreign user hidden | `result/route.test.ts` 404 no-leak | ✅ COMPLIANT |
| Result Authorization | Unauthenticated rejected | `result/route.test.ts` + `e2e/full-league-flow.spec.ts` 401 | ✅ COMPLIANT |
| Result Authorization | Captain correction allowed | `result/route.test.ts` PUT captain 200 (flip) + `e2e/full-league-flow.spec.ts` | ✅ COMPLIANT |
| Correction Audit | Correction audited | `result/route.test.ts` audit row | ✅ COMPLIANT |
| Correction Audit | Forfeit denied to non-admin | `result/route.test.ts`/forfeit route 403 (unchanged) | ✅ COMPLIANT |
| Correction Audit | Spent PE never revoked | `result/route.test.ts` | ✅ COMPLIANT |
| Correction Audit | Participant correction e2e | `e2e/match-report.spec.ts` (auth) #28 | ✅ COMPLIANT |

**leagues (League Model + User-Scoped API)**

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| League Model | League persisted | `leagues/route.test.ts` | ✅ COMPLIANT |
| League Model | Duplicate name rejected | `leagues/route.test.ts` 409 | ✅ COMPLIANT |
| League Model | Deprecated clock columns retained | migration + schema (additive, no drop) | ✅ COMPLIANT |
| League Model | Open league delete clears members | `leagues/[id]/route.test.ts` | ✅ COMPLIANT |
| League Model | Started league delete blocked | `leagues/[id]/route.test.ts` 409 | ✅ COMPLIANT |
| User-Scoped API | Unauthenticated API call | `leagues/route.test.ts` 401 | ✅ COMPLIANT |
| User-Scoped API | List own plus open leagues | `leagues/route.test.ts` | ✅ COMPLIANT |
| User-Scoped API | Creation without clock option | `CreateLeagueModal.test.tsx` + `features/leagues/api.test.ts` | ✅ COMPLIANT |
| User-Scoped API | Legacy turn-clock payload ignored | `leagues/route.test.ts` D15 ignore-not-persisted | ✅ COMPLIANT |
| User-Scoped API | Creation UI drops clock option | `CreateLeagueModal.test.tsx` | ✅ COMPLIANT |
| User-Scoped API | Deprecated fields immutable | `leagues/route.test.ts` (no update path) | ✅ COMPLIANT |
| User-Scoped API | Foreign member started detail allowed | `leagues/[id]/route.test.ts` | ✅ COMPLIANT |
| User-Scoped API | League detail with members | `leagues/[id]/route.test.ts` | ✅ COMPLIANT |

**Compliance summary**: 60/60 scenarios compliant · 14/14 requirements complete

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| LM-11 consent/retract/begin (ready→live only via begin) | ✅ Implemented | `consentStart`/`retractConsent`/`beginMatch` in `lib/liveMatch.ts`; store `consentLiveMatch` (create-on-first-consent, P2002-reread D16), `retractLiveConsent`, `beginLiveMatch` |
| LM-5 unified clock, `deriveLiveClock` shared | ✅ Implemented | pure `deriveLiveClock` used by BOTH `toLiveViewState` and `serializeLive` (fixture GET); DTO-rule asserted in `fixtures/[fixtureId]/route.test.ts` |
| D4 (`autoEndTurnOnClockZero`/`onClockExpired`) removed | ✅ Implemented | grep: `autoEndTurnOnClockZero` 0 refs; `onClockExpired` only in comments + a test title (0 functional seams) |
| LM-7 grace pauses unified clock | ✅ Implemented | pause bumps ACTIVE accumulator by `(now - clockStartedAt)`, segment null; resume restarts (D18) |
| LM-12 side matrix (D14) | ✅ Implemented | `resolveEventPermission` 3-branch matrix: active=any, null=deny, non-active own-casualty only; route maps deny→409/403/404 |
| LM-13 `turnStart` + `requestTurn` + 60s cooldown (D17) | ✅ Implemented | `turnStart` emitted on begin + every flip (`turnTransition`); `applyRequestTurn` + `REQUEST_TURN_COOLDOWN_MS=60_000`; labels "Tu turno"/"Te piden el turno" |
| D19 `viewerSide` in snapshot/POST/GET, hub frames null | ✅ Implemented | `viewerSide()` per session in live route + `serializeLive`; `useLiveMatch` keeps last non-null |
| D15 POST /api/leagues ignore-not-persisted | ✅ Implemented | create injects only `ownerId,name,description`; turn-clock fields unvalidated/never written; columns keep defaults |
| Rejornar propose/accept relaxed | ✅ Implemented | `propose`/`accept` 409 ONLY on `played` (winnerId/scores); `accept` sets `scheduledAt` tx; self-accept 409; state re-check preserves one-active invariant |
| Correction PUT `isAdmin ‖ isCaptain` | ✅ Implemented | `result/route.ts` both load(POST) and correction(PUT) gate admin/captain; foreign→404; forfeit separate admin-only route |
| e2e begin-step side from real owner map | ✅ Implemented | `e2e/live-match.spec.ts` maps created team names to home/away (randomized round-robin); both consents → begin → "Dar el turno" |
| P2002 seq fix in `persistAndPublish` | ✅ Implemented | advance seq past all delta events (begin = start+turnStart ⇒ seq 4 from ready@2); locked in `liveStore.test.ts` |

### Coherence (Design D14–D19)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| D14 admin no-side deny on play surface | ✅ Yes | `resolveEventPermission` returns deny for `callerSide===null`; admin may `endMatch`-type lifecycle only |
| D15 ignore-not-persisted league clock payload | ✅ Yes | validated in `leagues/route.test.ts` + modal/API drop |
| D16 create-on-first-consent + P2002 re-read | ✅ Yes | `createFirstConsent` path in store; P2002 re-read+apply |
| D17 60s nudge cooldown (persisted-at key) | ✅ Yes | `REQUEST_TURN_COOLDOWN_MS`, route query on last `requestTurn` at |
| D18 grace pauses unified clock | ✅ Yes | pause bumps active acc + nulls segment; resume restarts (persisted `paused`) |
| D19 per-viewer `viewerSide` fan-out | ✅ Yes | snapshot/POST/GET set it; hub frames null; `useLiveMatch` keeps last non-null |

### TDD Compliance (Strict TDD active)
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | `apply-progress.md` has TDD Cycle Evidence tables for all 5 PR slices |
| All tasks have tests | ✅ | 22/22 tasks across the cycle tables |
| RED confirmed (tests exist) | ✅ | test files all verified present on disk |
| GREEN confirmed (tests pass) | ✅ | focused 237/237, full 1124/1124, auth e2e 31/31 ×2 |
| Triangulation adequate | ✅ | 6-cell matrix, consent/retract/begin, clock acc + recompute, cooldown, DTO parity all multi-case |
| Safety Net for modified files | ✅ | `✅ 77/77` (PR 1a) and full-suite green for 1b/2/3/4 |

**TDD Compliance**: 6/6 checks passed

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | ~134 | 8 | vitest (zero-mock pure fns) |
| Integration | ~170+ | 8 | vitest + testing-library (routes) |
| Component | ~74 | 4 (MatchView, CreateLeagueModal, NegotiationPanel, MatchCard, labels) | vitest + Testing Library |
| E2E | 21 local + 31 auth (×2) | 1 auth suite | Playwright |
| **Total** | **1124 unit/integration + 21 local + 31 auth** | **93 unit/integration files** | |

### Changed File Coverage
Coverage analysis skipped — no coverage threshold/tool configured in this project's vitest setup; runtime green suite + grep audits used as the evidence gate.

### Assertion Quality Audit (step 5f)
Scanned the changed test files: `lib/liveMatch.test.ts`, `liveStore.test.ts`, `liveHub.test.ts`,
`livePhase.test.ts`, `live/route.test.ts`, `fixtures/[fixtureId]/route.test.ts`,
`leagues/route.test.ts`, `propose/route.test.ts`, `accept/route.test.ts`, `result/route.test.ts`,
`MatchView.test.tsx`, `CreateLeagueModal.test.tsx`, `NegotiationPanel.test.tsx`, `MatchCard.test.tsx`,
`liveEventLabels.test.ts`, `features/leagues/api.test.ts`.
No tautologies, no orphan empty-array checks, no ghost loops, no render-only smoke tests that
skip behavior. Type-only assertions are combined with behavior/value assertions.
**Assertion quality**: ✅ All assertions verify real behavior

### Quality Metrics
**Linter**: ✅ No errors (`pnpm lint`, exit 0)
**Type Checker**: ✅ No errors (`npx tsc --noEmit`, exit 0)

### Issues Found
**CRITICAL**: None
**WARNING**:
1. `propose/route.ts` top-of-file doc comment (lines 20-21) still states a fixture already `scheduled`
   (scheduledAt set) is locked → 409. The code correctly allows scheduled-not-played fixtures
   (rejornar) and only guards played. The comment is stale and contradicts the implemented behavior.
   Cosmetic/doc drift only — no functional impact; routes/tests/e2e green.
**SUGGESTION**: None.

### Verdict
**PASS WITH WARNINGS**
Reason: Full runtime proof across all 14 requirements / 60 scenarios — units 1124/1124, local e2e
21/21, auth e2e 31/31 (deterministic across two runs), lint+tsc clean, D4/D15 grep audits clean.
The single WARNING is a stale code comment in `propose/route.ts` that misdescribes the (correct)
rejornar guard; not a functional gap.

---

## Grep Audits
- `autoEndTurnOnClockZero` → **0 references** (gone).
- `onClockExpired` → **0 functional refs** (only in comments + a test title).
- `turnClockSeconds`/`turnClockEnabled` → **no reads in the live stack or creation UI/API**. Remaining
  hits are deprecated type declarations (`@deprecated` notes, task 1b.2) and doc comments only;
  columns remain untouched (additive migration, no drop).
