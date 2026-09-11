# Apply Progress: live-match-recovery

## Status: S1 + S2 complete

- **S1** — manual reset foundation: `live.manage` permission, `resetLiveMatch`
  store fn, and the `POST .../fixtures/[fixtureId]/reset` route with RBAC guards.
- **S2** — lazy 8h auto-close: `isStaleLiveMatch` + `expireStaleLiveMatches`,
  swept from both league/fixture GETs. No forfeit change, no UI (S3 untouched).

## Tasks

### S1 / Phase 1 — all [x]

- [x] 1.1 `live.manage` in `PERMISSIONS` + `developer`/`admin` (LMR-1)
- [x] 1.2 `StoreTx.liveMatch.deleteMany` + `resetLiveMatch` (LMR-2, LM-31)
- [x] 1.3 `reset/route.ts` guard chain (LMR-1, LMR-2)
- [x] 1.4 store RED→GREEN tests
- [x] 1.5 route RED→GREEN tests

### S2 / Phase 2 — all [x]

- [x] 2.1 `STALE_LIVE_MS` + `isStaleLiveMatch` + `expireStaleLiveMatches` (LMR-3/4/5, LM-31)
- [x] 2.2 sweep at top of `GET /api/leagues/[id]` (scope `leagueId`) (LMR-3)
- [x] 2.3 sweep at top of `GET .../fixtures/[fixtureId]` (scope `fixtureId`) (LMR-3)
- [x] 2.4 store RED→GREEN tests: freeze/winner/draw/scope/race/idempotent/defensive (LMR-4/5)

## Commits (work units)

| Commit | Slice | Work unit |
|--------|-------|-----------|
| `5b47aa1` | S1 | `feat(live): grant live.manage permission to developer and admin` |
| `a3d8a8c` | S1 | `feat(live): add resetLiveMatch store fn (delete row, clear fixture)` |
| `9bb3081` | S1 | `feat(live): add fixture reset route with RBAC guards` |
| `e4201f0` | S2 | `feat(live): add stale-live predicate and lazy 8h auto-close sweep` |
| `2862e05` | S2 | `feat(live): run lazy stale sweep from league and fixture GETs` |

## Files changed

| File | Action | What |
|------|--------|------|
| `lib/permissions.ts` | Modify (S1) | `live.manage` in `PERMISSIONS` + dev/admin |
| `lib/permissions.test.ts` | Modify (S1) | dev/admin grant + user/null denial |
| `lib/liveStore.ts` | Modify (S1+S2) | `deleteMany`/`resetLiveMatch`; `STALE_LIVE_MS`, `isStaleLiveMatch`, `expireStaleLiveMatches`; `StoreDeps.prisma.liveMatch.findMany`; widened `fixture.findUnique` select (`leagueId`) |
| `lib/liveStore.test.ts` | Modify (S1+S2) | reset + 9 stale-sweep tests; `makeDeps` gains `findMany` |
| `lib/liveStore.{resolve,journeymen,wizard}.test.ts` | Modify (S2) | `StoreDeps` helpers gain `findMany` |
| `app/api/leagues/[id]/fixtures/[fixtureId]/reset/route.ts` + `.test.ts` | Create (S1) | reset endpoint + 13 route tests |
| `app/api/leagues/[id]/route.ts` + `.test.ts` | Modify (S2) | sweep at GET top (`leagueId`) + route test |
| `app/api/leagues/[id]/fixtures/[fixtureId]/route.ts` + `.test.ts` | Modify (S2) | sweep at GET top (`fixtureId`) + route test |

## Behavior (S2)

`expireStaleLiveMatches(deps, scope, now?)` finds in-scope `live` rows with
`startedAt < now-8h`, then PER ROW a minimal seq-guarded tx (NOT
`persistAndPublish`): `updateMany({id, seq, status:"live"})` → 0 rows = lost race
(no-op); on win `status:"finished"`, `finishedAt:now`, `seq+1`, freeze the LIVE
`homeScore`/`awayScore` onto the fixture, `winner = deriveWinnerId(...)` (null on
draw), `maybeCloseLeague`. Publishes a `finished` frame with `events: []` and
`seq = prevSeq+1`. **Option A**: no PE/winnings/MVP/FF and no `endMatch` event.
Both GETs call it (after the 401 check, before reading) inside a defensive
try/catch so a sweep failure never breaks the read.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `lib/permissions.test.ts` | Unit | ✅ 6/6 | ✅ Written | ✅ 7/7 | ✅ dev/admin true, user/null false | ➖ None needed |
| 1.2/1.4 | `lib/liveStore.test.ts` | Unit | ✅ 54/54 | ✅ Written | ✅ 56/56 | ✅ prevSeq 5→6 & 0→1; `scheduledAt` untouched | ➖ None needed |
| 1.3/1.5 | `reset/route.test.ts` | Integration (route) | N/A (new) | ✅ Written | ✅ 13/13 | ✅ 13 guard scenarios | ➖ None needed |
| 2.1/2.4 | `lib/liveStore.test.ts` | Unit | ✅ 56/56 | ✅ Written (9 fail first) | ✅ 65/65 | ✅ predicate (4) + freeze/draw/scope/race/idempotent/defensive (6) | ✅ Clean |
| 2.2 | `app/api/leagues/[id]/route.test.ts` | Integration (route) | ✅ 23/23 | ✅ Written | ✅ 24/24 | ✅ scope `leagueId` + 401 skips sweep | ➖ None needed |
| 2.3 | `.../fixtures/[fixtureId]/route.test.ts` | Integration (route) | ✅ 29/29 | ✅ Written | ✅ 30/30 | ✅ scope `fixtureId` | ➖ None needed |

### Test Summary

- **Total tests written (S1+S2)**: 28 (2 permissions + 11 store + 15 route)
- **Total passing**: 2485 (171 files, full suite) — was 2474 at S1
- **Layers used**: Unit (11 store), Integration (15 route)
- **Approval tests** (refactoring): None — no refactoring tasks
- **Pure functions created**: `isStaleLiveMatch` (S2)

## Work Unit Evidence (S2)

| Evidence | Value |
|----------|-------|
| Focused test command and result | `pnpm exec vitest run lib/liveStore.test.ts lib/liveStore.{resolve,journeymen,wizard,inducements}.test.ts` → **139 passed**; `pnpm exec vitest run "app/api/leagues/[id]/route.test.ts" "app/api/leagues/[id]/fixtures/[fixtureId]/route.test.ts"` → **54 passed** |
| Runtime harness | N/A — the sweep is server-only store code with no HTTP/browser boundary of its own; the real sweep is unit-tested and the GET wiring is route-integration-tested. e2e not applicable to S2 (no UI; ports busy per tasks forecast). |
| Rollback boundary | Revert `e4201f0` + `2862e05`: removes `isStaleLiveMatch`/`expireStaleLiveMatches`, `StoreDeps.prisma.liveMatch.findMany`, the widened `fixture.findUnique` select and the two GET sweep calls. Already-finished rows stay valid; no schema migration; S1 reset + S3 UI untouched. |

## Verification

- `pnpm test` → **2485 passed** (171 files)
- `pnpm lint` → **exit 0**
- `npx tsc --noEmit` → **exit 0**
- Pre-commit hooks re-ran the full suite on both S2 commits → 2485 passed.

## Deviations / notes

- Widened the shared `StoreTx.fixture.findUnique` select to include `leagueId`
  (plus the 5 call sites) rather than adding a separate league read — the sweep
  needs the fixture's league for `maybeCloseLeague`; the existing comment already
  mandates the "FULL select" for both callers.
- The sweep is placed after the 401 auth check (top of the handler body) and
  wrapped in a defensive try/catch so a sweep failure never breaks the read.
- `expireStaleLiveMatches` uses a dedicated minimal tx (not `persistAndPublish`)
  to avoid the forbidden winnings/consent/seq/`maybeCloseLeague` coupling.
- `openspec/changes/live-match-recovery/` is intentionally left uncommitted.

## Next

`apply` S3 (forfeit cleanup + reset UI + i18n): `tx.liveMatch.deleteMany` in the
forfeit tx, `resetLiveMatch` client + `ResetLiveMatchModal`, `canResetLive`
wiring, `reset.*` i18n keys, and component/e2e tests.
