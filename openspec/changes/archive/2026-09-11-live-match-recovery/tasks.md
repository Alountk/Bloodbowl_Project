# Tasks: live-match-recovery

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | S1 ≈240 · S2 ≈200 · S3 ≈285 · total ≈725 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (S1) → PR 2 (S2) → PR 3 (S3) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| S1 | reset route + `live.manage` | PR 1 | `pnpm exec vitest run lib/liveStore.*.test.ts app/api/leagues/[id]/fixtures/[fixtureId]/reset/route.test.ts` | `AUTH_MODE=auth pnpm exec playwright test` — N/A (ports busy) | revert `reset/route.ts` + `resetLiveMatch`; fixture untouched |
| S2 | lazy 8h auto-close | PR 2 | `pnpm exec vitest run lib/liveStore.*.test.ts` | sweep is mutation-in-GET; `AUTH_MODE=local pnpm exec playwright test e2e/live-resolution.spec.ts` — N/A (ports busy) | revert `expireStaleLiveMatches` + sweep calls; finished rows valid |
| S3 | forfeit cleanup + reset UI | PR 3 | `pnpm exec vitest run app/api/leagues/[id]/fixtures/[fixtureId]/forfeit/route.test.ts features/leagues/MatchCard.test.tsx features/leagues/MatchView.test.tsx` | `AUTH_MODE=local pnpm exec playwright test e2e/live-resolution.spec.ts` — N/A (ports busy) | revert modal + control + `deleteMany`; forfeit still works |

## Phase 1 (S1): Reset — permission + store + route

- [x] 1.1 Add `"live.manage"` to `PERMISSIONS` and to `developer`/`admin` in `ROLE_PERMISSIONS` (`lib/permissions.ts`); assert `can(role,"live.manage")` true for dev/admin (LMR-1).
- [x] 1.2 Add `deleteMany` to `StoreTx.liveMatch` and export `resetLiveMatch({fixtureId,prevSeq},deps)` in `lib/liveStore.ts`: tx `liveMatch.deleteMany({fixtureId})` + `fixture.update({winnerId:null,homeScore:null,awayScore:null})`; publish `{seq:prevSeq+1,live:null}` (LMR-2, LM-31).
- [x] 1.3 Create `app/api/leagues/[id]/fixtures/[fixtureId]/reset/route.ts` with guards in order: auth→401, findFirst→404, finished league→409, open league→404, owner-first `ownerId===userId` else `requirePermission("live.manage")`, played→409, no LiveMatch→409, `finished` row→409, else 200 `{ok:true}` (LMR-1, LMR-2).
- [x] 1.4 RED then GREEN `lib/liveStore.*.test.ts`: `resetLiveMatch` deleteMany + null scores + `live:null` publish seq `prevSeq+1`.
- [x] 1.5 RED then GREEN `app/api/leagues/[id]/fixtures/[fixtureId]/reset/route.test.ts`: 401/403/404/409/200 (all LMR-1/LMR-2 scenarios).

## Phase 2 (S2): Lazy 8h auto-close

- [x] 2.1 Add `STALE_LIVE_MS`, `isStaleLiveMatch`, `expireStaleLiveMatches(deps,scope,now?)` in `lib/liveStore.ts`: find `live` rows with `startedAt < now-8h`; per-row seq-guarded finish (`status:"finished"`, `finishedAt:now`); write fixture scores + winner via `deriveWinnerId` (`lib/result.ts`); `maybeCloseLeague`; publish finished frame `seq+1` (LMR-3, LMR-4, LMR-5, LM-31).
- [x] 2.2 Call `expireStaleLiveMatches` at top of GET in `app/api/leagues/[id]/route.ts` (scope `leagueId`) (LMR-3).
- [x] 2.3 Call `expireStaleLiveMatches` at top of GET in `app/api/leagues/[id]/fixtures/[fixtureId]/route.ts` (scope `fixtureId`) (LMR-3).
- [x] 2.4 RED then GREEN `lib/liveStore.*.test.ts`: freeze/winner/draw/no-progression/idempotency/seq-loser race (LMR-4, LMR-5).

## Phase 3 (S3): Forfeit cleanup + reset UI + i18n

- [x] 3.1 Add `tx.liveMatch.deleteMany({where:{fixtureId}})` in `app/api/leagues/[id]/fixtures/[fixtureId]/forfeit/route.ts` tx before `fixture.update` (LMR-6).
- [x] 3.2 RED then GREEN: extend `app/api/leagues/[id]/fixtures/[fixtureId]/forfeit/route.test.ts` mock/`stubTransaction` with `liveMatch.deleteMany`; assert orphan cleared (LMR-6).
- [x] 3.3 Add `resetLiveMatch(leagueId,fixtureId)` to `features/leagues/api.ts` (+ `api.test.ts`) (LMR-7).
- [x] 3.4 Create `features/leagues/ResetLiveMatchModal.tsx` confirmation dialog mirroring `ForfeitModal` (`role="dialog"`, aria-label) (LMR-7).
- [x] 3.5 Wire `canResetLive` control into `features/leagues/MatchCard.tsx` / `MatchView.tsx` / `LeagueDetail.tsx` (owner or dev/admin only; hidden for participants/spectators/finished league) (LMR-7).
- [x] 3.6 Add `reset.*` ES/EN keys to `lib/i18n/dictionaries.ts` (LMR-7).
- [x] 3.7 RED then GREEN `MatchCard.test.tsx` + `MatchView.test.tsx` visibility/confirm; extend `e2e/live-resolution.spec.ts` (LMR-7, LM-31).

Threat matrix: N/A — no RED tasks.
