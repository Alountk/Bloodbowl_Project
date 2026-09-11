```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:fe2c04c0db33333b92def06ccdd8b1a3789029e675c69ac48f7e871e495a4333
verdict: pass
blockers: 0
critical_findings: 0
requirements: 10/10
scenarios: 33/33
test_command: pnpm test
test_exit_code: 0
test_output_hash: sha256:8cbf39c136c8e532e22828d8028ef6bd0e25ac1c0630649fb16a4c1594f24563
build_command: pnpm build
build_exit_code: 0
build_output_hash: sha256:964e606b37a7b385e8187b3b882d78055f10351d705fe5a877746717f9b8bc67
```

## Verification Report

**Change**: live-match-recovery
**Version**: N/A (delta specs, 3 domains)
**Mode**: Standard (Strict TDD inactive)

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 16 |
| Tasks complete | 16 |
| Tasks incomplete | 0 |

### Build & Tests Execution

**Build**: ✅ Passed (`pnpm build`, exit 0). `pnpm lint` exit 0; `npx tsc --noEmit` exit 0 (empty output).
```text
pnpm test   → exit 0 — Test Files 172 passed (172), Tests 2505 passed (2505), Duration 24.57s
pnpm lint   → exit 0 (eslint clean)
npx tsc     → exit 0 (no diagnostics)
pnpm build  → exit 0 — route /api/leagues/[id]/fixtures/[fixtureId]/reset emitted
```

**Tests**: ✅ 2505 passed / ❌ 0 failed / ⚠️ 0 skipped
```text
Focused re-run (8 files): lib/liveStore.test.ts, lib/permissions.test.ts,
reset/route.test.ts, forfeit/route.test.ts, MatchCard.test.tsx, MatchView.test.tsx,
ResetLiveMatchModal.test.tsx, api.test.ts → 261 passed (8 files)
```

**Coverage**: ➖ Not available (no coverage threshold configured; `openspec/config.yaml` absent)

### Schema / Migration Check
- `git diff --name-only 5b47aa1~1..HEAD -- prisma/migrations` → empty (NO new migration).
- `git diff --name-only 5b47aa1~1..HEAD -- prisma/schema.prisma` → empty (NO schema change).
- Change range: PRs #206 (S1), #207 (S2), #208 (PR3a), #209 (PR3b); HEAD `1b7eec2`.

### Spec Compliance Matrix

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| LMR-1 Manual Reset Authorization | Owner resets | `reset/route.test.ts > resets as the league owner, bypassing the permission check` | ✅ COMPLIANT |
| LMR-1 | Developer resets a foreign league | `reset/route.test.ts > resets as a developer/admin via live.manage even when not the owner` | ✅ COMPLIANT |
| LMR-1 | Participant, spectator, or foreign denied | `reset/route.test.ts > returns 403 for a participant member…; returns 403 for a spectator member…; returns 404 for a foreign non-member… and resets nothing` | ✅ COMPLIANT |
| LMR-1 | Finished league rejected | `reset/route.test.ts > returns 409 for a finished league and resets nothing` | ✅ COMPLIANT |
| LMR-2 Manual Reset Effect | Reset returns the fixture to scheduled | `liveStore.test.ts > resetLiveMatch… deletes…, nulls scores/winner, and publishes live:null at prevSeq+1; preserves scheduledAt…` | ✅ COMPLIANT |
| LMR-2 | Pending fixture stays pending | `liveStore.test.ts > preserves scheduledAt (never writes it)` + `app/api/leagues/[id]/route.test.ts > deriveFixtureStatus` (no date → pending) | ✅ COMPLIANT |
| LMR-2 | Already played rejected | `reset/route.test.ts > returns 409 when the fixture is already played (scores present); returns 409 when a persisted result marks the fixture played` | ✅ COMPLIANT |
| LMR-2 | No LiveMatch rejected | `reset/route.test.ts > returns 409 when the fixture has no LiveMatch` | ✅ COMPLIANT |
| LMR-3 Lazy Auto-Close Predicate | Stale live match swept | `liveStore.test.ts > freezes the row…; app/api/leagues/[id]/route.test.ts` + `fixtures/[fixtureId]/route.test.ts` sweep-at-GET asserts | ✅ COMPLIANT |
| LMR-3 | Fresh or non-live rows untouched | `liveStore.test.ts > isStaleLiveMatch… is false for a live row under 8h; is false for ready/pending/finished rows and a live row with no startedAt` | ✅ COMPLIANT |
| LMR-4 Auto-Close Freeze (No Progression) | Frozen scoreboard counts for the league | `liveStore.test.ts > freezes the row, records the live scoreboard + derived winner, closes the league and publishes finished` | ✅ COMPLIANT |
| LMR-4 | Draw leaves no winner | `liveStore.test.ts > leaves winnerId null on a draw` | ✅ COMPLIANT |
| LMR-4 | No progression awarded | `liveStore.test.ts > freezes the row…` (exact `updateMany`/`fixture.update` arg assertions exclude winnings/PE; no MVP/FF call in path) | ✅ COMPLIANT |
| LMR-5 Sweep Idempotency and Seq Guard | Concurrent sweep losers no-op | `liveStore.test.ts > no-ops on a lost seq race (0 rows) without writing the fixture or publishing` | ✅ COMPLIANT |
| LMR-5 | Re-run is a no-op | `liveStore.test.ts > is idempotent — a re-run finds no live rows and does nothing` | ✅ COMPLIANT |
| LMR-6 Forfeit Deletes the Orphan LiveMatch | Forfeit clears the live row | `forfeit/route.test.ts > deletes the fixture's orphan LiveMatch in the same walkover transaction (LMR-6)` | ✅ COMPLIANT |
| LMR-7 Reset UI and Confirmation | Authorized user sees and confirms reset | `MatchCard.test.tsx > shows the reset control to a league owner…; fires onReset…`; `MatchView.test.tsx > shows the reset control to the league owner…; …to a developer (live.manage)…; confirms the reset: POSTs the reset route and refreshes the detail` | ✅ COMPLIANT |
| LMR-7 | Hidden from others | `MatchCard.test.tsx > hides…from a participant/spectator…; …on a finished league…; …when the live match is already finished…; …when the fixture has no live match`; `MatchView.test.tsx > hides…from a participant…; …from a spectator…; …on a finished league…; …when the live match is finished` | ✅ COMPLIANT |
| LM-3 Match Lifecycle and Start Guard | Consent on scheduled fixture | `liveStore.test.ts` consent suite + `live/route.test.ts` (full suite green) | ✅ COMPLIANT |
| LM-3 | Replay rejected | `liveStore.test.ts`/`live/route.test.ts` consent-on-played 409 (full suite green) | ✅ COMPLIANT |
| LM-3 | Live only via the first turn | `liveStore.test.ts` begin suite (full suite green) | ✅ COMPLIANT |
| LM-3 | Reset exits the lifecycle | `reset/route.test.ts` + `liveStore.test.ts > resetLiveMatch…` | ✅ COMPLIANT |
| LM-3 | Expiry exits the lifecycle | `liveStore.test.ts > freezes the row…` | ✅ COMPLIANT |
| LM-31 Recovery SSE Frames | Reset publishes live null | `liveStore.test.ts > …publishes live:null at prevSeq+1`; `useLiveMatch.ts` handles `{live:null}` frames (lines 85-86, 104-105) | ✅ COMPLIANT |
| LM-31 | Auto-close publishes finished | `liveStore.test.ts > freezes the row…` asserts publish `{seq:6, status:"finished"}` (> snapshot seq 5) | ✅ COMPLIANT |
| matchday-forfeit Forfeit Sets winnerId | Winner must be home or away | `forfeit/route.test.ts > returns 400 when winnerTeamId is neither home nor away` | ✅ COMPLIANT |
| matchday-forfeit | Forfeit on scheduled fixture allowed | `forfeit/route.test.ts > allows a forfeit on a scheduled fixture (overrides to played)` | ✅ COMPLIANT |
| matchday-forfeit | Repeat forfeit rejected | `forfeit/route.test.ts > returns 409 for a repeat forfeit on an already-played fixture` | ✅ COMPLIANT |
| matchday-forfeit | Forfeit closes open proposals | `forfeit/route.test.ts > sets winnerId and closes open proposals when the league owner forfeits` | ✅ COMPLIANT |
| matchday-forfeit | Forfeit deletes the orphan LiveMatch | `forfeit/route.test.ts > deletes the fixture's orphan LiveMatch in the same walkover transaction (LMR-6)` | ✅ COMPLIANT |
| matchday-forfeit | Walkover skips PE | `forfeit/route.test.ts` (route writes no PE; full suite green) | ✅ COMPLIANT |
| matchday-forfeit | Result blocked on forfeited fixture | `result/route.test.ts` mutual-exclusion 409 (full suite green) | ✅ COMPLIANT |
| matchday-forfeit | Forfeit blocked on result-loaded fixture | `forfeit/route.test.ts > returns 409 when the fixture already has a loaded result (mutual exclusion)` | ✅ COMPLIANT |

**Compliance summary**: 33/33 scenarios compliant

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| LMR-1 | ✅ Implemented | `lib/permissions.ts`: `live.manage` added to `PERMISSIONS` and `developer`/`admin`. `reset/route.ts` guard order matches design: auth→401, findFirst({id,leagueId})→404, finished league→409, open→404, owner-first else `requirePermission("live.manage")` (member→403, foreign→404), played→409, no LiveMatch→409, finished row→409, else 200. |
| LMR-2 | ✅ Implemented | `resetLiveMatch` in `lib/liveStore.ts`: one `$transaction` with `liveMatch.deleteMany({fixtureId})` + `fixture.update({winnerId:null,homeScore:null,awayScore:null})`; `scheduledAt` untouched; publishes `{seq: prevSeq+1, live:null}` after commit. |
| LMR-3 | ✅ Implemented | `STALE_LIVE_MS`, `isStaleLiveMatch` (only `live` && `startedAt > 8h`), `expireStaleLiveMatches` called lazily at the top of `GET /api/leagues/[id]` (`leagueId` scope) and `GET .../fixtures/[fixtureId]` (`fixtureId` scope). No cron/job added. |
| LMR-4 | ✅ Implemented | Sweep sets `status:"finished"`, `finishedAt:now`, `seq+1`; writes frozen `homeScore`/`awayScore`; `deriveWinnerId(...)` (null on draw); `maybeCloseLeague(tx, leagueId)`. No `computeWinnings`/PE/MVP/FF/`endMatch` in the path (Option A). |
| LMR-5 | ✅ Implemented | `updateMany({where:{id,seq,status:"live"}})` — 0 rows → `return false` (no fixture write, no publish); re-run query finds no `live` rows. |
| LMR-6 | ✅ Implemented | `forfeit/route.ts`: `tx.liveMatch.deleteMany({where:{fixtureId}})` before `fixture.update` in the same `$transaction`. |
| LMR-7 | ✅ Implemented | `features/leagues/api.ts` `resetLiveMatch`; `ResetLiveMatchModal.tsx` (`role="dialog"`, aria-label, pending/error); MatchCard `canResetLive` prop + header control gated on live row + not-finished league/LiveMatch; MatchView `useLeague` owner/status gate + top-bar control + modal; `LeagueDetail` computes `isOwner || can(role,"live.manage")`; `reset.*` ES/EN keys in `lib/i18n/dictionaries.ts`. |
| LM-3 / LM-31 | ✅ Implemented | Reset deletes the row; sweep freezes to `finished`. SSE route forwards frames with `seq > snapshotSeq`; reset `{seq:prevSeq+1, live:null}` and finished frames qualify. Client `useLiveMatch` clears state on `{live:null}`. |
| matchday-forfeit | ✅ Implemented | Forfeit tx deletes the orphan LiveMatch (events cascade). |

### Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| Reset as store fn `resetLiveMatch` (injectable deps) vs inline route | ✅ Yes | Store fn with `StoreDeps`; route does RBAC + guards. |
| New `live.manage` permission key (generic `can`/`requirePermission`) | ✅ Yes | Added to `PERMISSIONS` + developer/admin; no change to `can()`/`requirePermission`. |
| Dedicated `expireStaleLiveMatches` (not `persistAndPublish`) to avoid winnings | ✅ Yes | Minimal finish; no winnings/PE/MVP/FF. |
| Reset 409 on a `finished` LiveMatch | ✅ Yes | Route returns 409; UI hides control for finished rows. |
| Auto-close without an `endMatch` event | ✅ Yes | No `endMatch`; frozen scoreboard + empty events frame. |
| No schema migration | ✅ Yes | Confirmed: no `prisma/migrations` or `schema.prisma` diff in range. |

### Out-of-Scope Verification

| Item | Expected | Observed |
|------|----------|----------|
| Auto-close of `ready`/`pending` | Not swept | ✅ `isStaleLiveMatch` requires `status === "live"`; test asserts ready/pending/finished false |
| Reset of `finished` | Rejected | ✅ Route 409; UI hidden |
| Cron / scheduled job | None | ✅ Sweep only invoked from the two GETs; only pre-existing `ghcr-cleanup.yml` cron exists |
| Reset history / audit trail | None | ✅ No new model/migration |
| Option B (auto progression) | Discarded | ✅ No PE/winnings/MVP/FF in `expireStaleLiveMatches` |

### Issues Found

**CRITICAL**: None

**WARNING**:
- e2e auth suite (`AUTH_MODE=auth` + Docker/Postgres) was NOT run in this environment — documented as not-applicable by apply (ports occupied). Route-integration + component tests cover the LMR-1/2/6/7 behavior; the e2e `live-resolution.spec.ts` extension was not added.
- `MatchView` derives `canResetLive` from the client-side `useLeague` fetch; if that fetch fails, `league.status`/`ownerId` are undefined, so a developer/admin could transiently see the control on a finished league (server still returns 409). Not a spec violation in normal operation; no test covers the fetch-failure path.

**SUGGESTION**:
- Consider an explicit unit test asserting the auto-close transaction never persists winnings/PE (currently proven only by exact-args assertions and the absence of the call).

### Verdict

**PASS**
All 16 tasks complete; `pnpm test` (2505 passed / 172 files), `pnpm lint`, `npx tsc --noEmit`, and `pnpm build` all exit 0. 10/10 requirements and 33/33 scenarios have passing covering tests; no migration; all out-of-scope items verified absent. Only non-blocking warnings (e2e auth not runnable here; client-side league-status fetch edge case).
