# Proposal: live-match-recovery

## Intent
A `LiveMatch` row has no delete path, so a match stuck in `live` blocks its fixture forever (`canLoadResult` needs `scheduled && !liveActive`) and the league cannot advance. Add recovery: manual reset + lazy auto-close.

## Scope

### In Scope
- Manual reset: league owner OR developer/admin deletes the LiveMatch (events cascade); fixture returns to `scheduled` (or `pending` with no `scheduledAt`); no winner; replayable.
- Lazy auto-close: `live` rows >8h wall-clock from `startedAt` freeze to `finished` with the current scoreboard; fixture closed as played; `maybeCloseLeague` runs.
- Forfeit deletes the orphan LiveMatch in the same transaction.
- SSE frames on reset (`live: null`) and auto-close (finished), both `seq > snapshotSeq`.
- Authorized reset control in card/view + i18n.

### Out of Scope
- Automatic progression (Option B): auto-close awards NO PE/winnings/MVP/FF — deferred to the resolution wizard. If nobody returns, progression is permanently lost while the league advances. Accepted; MUST be documented.
- Reset history/audit trail; auto-close of `ready`/`pending`; reset of `finished`; any cron.

## Capabilities

### New Capabilities
- `live-match-recovery`: reset command + RBAC, lazy 8h auto-close, forfeit cleanup, SSE frames, reset UI.

### Modified Capabilities
- `live-match-realtime`: reset/expiry lifecycle transitions + SSE frames.
- `matchday-forfeit`: forfeit deletes the fixture LiveMatch.

## Approach
- Reset: new `.../fixtures/[fixtureId]/reset/route.ts` mirroring forfeit; owner checked first, else new `live.manage` permission (developer/admin) via `can()`/`requirePermission`; one tx `deleteMany({fixtureId})`, null scores/winner, publish `live: null`.
- Auto-close: `expireStaleLiveMatches` in `lib/liveStore.ts`, called lazily at the top of `GET /api/leagues/[id]` and `GET .../fixtures/[fixtureId]`; seq-guarded, idempotent finish + fixture close + `maybeCloseLeague`; MatchResult left to the wizard.
- Forfeit: `tx.liveMatch.deleteMany` inside the existing tx.
- Client: `resetLiveMatch` + `ResetLiveMatchModal.tsx` + i18n.

## Affected Areas
| Area | Impact | Description |
|------|--------|-------------|
| `lib/liveStore.ts`, `lib/liveMatch.ts` | Modified | `abandonLiveMatch`, `expireStaleLiveMatches`, 8h predicate |
| `lib/permissions.ts` | Modified | `live.manage` → developer/admin |
| `.../fixtures/[fixtureId]/reset/route.ts` | New | reset endpoint |
| `.../forfeit/route.ts` | Modified | delete orphan LiveMatch |
| `app/api/leagues/[id]/route.ts`, `.../fixtures/[fixtureId]/route.ts` | Modified | lazy sweep |
| `features/leagues/` (`api.ts`, `MatchCard`, `MatchView`, `ResetLiveMatchModal`) | Modified/New | reset client, control, modal, i18n |

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Mutation-in-GET races | Med | seq guard, idempotent; loser no-ops |
| Progression lost after auto-close | High | Documented (Option A); wizard reachable |
| Reset RBAC all-or-nothing | Low | Owner check first, then permission |
| Forfeit test mock lacks `liveMatch` | Med | Update `stubTransaction` |

## Delivery Forecast
Chained PRs recommended (<400 lines/slice):
- S1: forfeit cleanup + `live.manage` + reset route + `abandonLiveMatch`.
- S2: expiry predicate + lazy hooks in both GETs + SSE frames.
- S3: reset UI + modal + i18n + tests.

`Decision needed before apply: Yes` · `Chained PRs recommended: Yes` · `400-line budget risk: Medium`.

## Rollback Plan
Revert the PR. Reset is additive; disabling the UI removes exposure. Reverting the sweep stops writes; already-finished rows are valid. No schema migration.

## Dependencies
- RBAC DB-role read (`lib/devGuard.ts`); SSE hub (`lib/liveHub.ts`).

## Success Criteria
- [ ] Owner/dev/admin resets `pending|ready|live`; fixture returns to `scheduled`/`pending`, no winner, replayable.
- [ ] `live` >8h frozen with its scoreboard, counts for the league, no PE/MVP.
- [ ] Forfeit leaves no EN VIVO badge.
- [ ] Reset/auto-close idempotent under concurrent reads; SSE drops the live view.
- [ ] `pnpm test`, `pnpm lint`, `tsc --noEmit`, auth e2e green.
