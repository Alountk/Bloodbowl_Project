# Design: live-match-recovery

## Technical Approach

Recover a `LiveMatch` that strands its fixture: a **manual reset** (owner or `live.manage` dev/admin) deletes the row + cascades events, returning the fixture to `scheduled`/`pending`; a **lazy 8h auto-close** freezes an abandoned `live` match as `finished` with its scoreboard (no PE/winnings/MVP/FF — wizard-only, Option A); **forfeit** clears its orphan LiveMatch. All three publish SSE frames with `seq > snapshotSeq`. Maps LMR-1..7, LM-3/LM-31, forfeit delta.

## Architecture Decisions

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Reset as store fn `resetLiveMatch` vs inline route | Store fn = injectable `StoreDeps` unit tests | Store fn (mirrors `applyTransition`); route does RBAC + guards, calls it |
| `live.manage` permission key (generic `can`/`requirePermission`) vs special-cased role | Generic = zero change to `can()`/`requirePermission`; all-or-nothing 401/403 preserved | New `"live.manage"` in `PERMISSIONS` + `developer`/`admin` `ROLE_PERMISSIONS` |
| Auto-close reuses `persistAndPublish` vs dedicated freeze | `persistAndPublish` computes winnings (forbidden by LMR-4) | Dedicated `expireStaleLiveMatches`; minimal finish (no winnings, no `endMatch` event) |
| Reset 409 on `finished` LiveMatch | Finished rows are wizard/resolve territory (unresolved `endMatch`) | Reject `finished` with 409 — reset only `pending|ready|live` |
| Auto-close `endMatch` event | Extra event/seq bookkeeping, not required | No `endMatch`; frozen scoreboard only |

## Data Flow

```
GET league/fixture ──top──> expireStaleLiveMatches ──(tx: seq-guarded finish + fixture scores/winner + maybeCloseLeague)──> hub.publish(finished)
POST .../reset ──RBAC──> resetLiveMatch ──(tx: deleteMany LiveMatch + null scores/winner)──> hub.publish({seq:prevSeq+1, live:null})
                                                                      │
                                              SSE subscribers (notify: seq>snapshotSeq) ──> useLiveMatch (setLive(null) | applyFrame)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `lib/permissions.ts` | Modify | add `"live.manage"` to `PERMISSIONS` + `developer`/`admin` roles |
| `lib/liveStore.ts` | Modify | `StoreTx.liveMatch.deleteMany`; `resetLiveMatch`; `STALE_LIVE_MS`, `isStaleLiveMatch`, `expireStaleLiveMatches` |
| `app/api/leagues/[id]/fixtures/[fixtureId]/reset/route.ts` | Create | reset endpoint (no body) |
| `app/api/leagues/[id]/route.ts` | Modify | sweep at top of GET (scoped `leagueId`) |
| `app/api/leagues/[id]/fixtures/[fixtureId]/route.ts` | Modify | sweep at top of GET (scoped `fixtureId`) |
| `app/api/leagues/[id]/fixtures/[fixtureId]/forfeit/route.ts` | Modify | `tx.liveMatch.deleteMany({where:{fixtureId}})` |
| `features/leagues/api.ts` | Modify | `resetLiveMatch` client fn |
| `features/leagues/MatchCard.tsx` / `MatchView.tsx` / `LeagueDetail.tsx` | Modify | `canResetLive` prop/flag + reset control |
| `features/leagues/ResetLiveMatchModal.tsx` | Create | confirmation modal |
| `lib/i18n/dictionaries.ts` | Modify | `reset.*` ES/EN keys |
| Tests (`liveStore.*.test.ts`, `reset/route.test.ts`, `forfeit/route.test.ts`, `MatchCard.test.tsx`, `MatchView.test.tsx`, e2e) | Modify/Create | RED/GREEN per slice |

## Interfaces / Contracts

```ts
// lib/liveStore.ts
export const STALE_LIVE_MS = 8 * 60 * 60 * 1000;
export function isStaleLiveMatch(r: { status: string; startedAt: Date | null }, now: number): boolean {
  return r.status === "live" && r.startedAt != null && now - r.startedAt.getTime() > STALE_LIVE_MS;
}
export async function resetLiveMatch(
  input: { fixtureId: string; prevSeq: number }, deps: StoreDeps,
): Promise<void>; // tx: liveMatch.deleteMany({fixtureId}) + fixture.update({winnerId:null,homeScore:null,awayScore:null}); publish {seq:prevSeq+1,live:null}
export async function expireStaleLiveMatches(
  deps: { prisma: Prisma; hub: LiveHub }, scope: { leagueId?: string; fixtureId?: string }, now?: number,
): Promise<number>; // findMany({status:"live", startedAt:{lt:now-8h}, fixture:{leagueId}|fixtureId}); per-row freeze; publish toLiveViewState(finished,seq+1)
```

**Reset route guards (order)**: `auth()`→401 · `findFirst({id,leagueId})`→404 · finished league→409 · open league→404 · owner-first `ownerId===userId` else `requirePermission("live.manage")` (dev/admin ok; member→403, foreign non-member→404) · played (scores/winnerId/result)→409 · no LiveMatch→409 · `liveMatch.status==="finished"`→409 · `200 {ok:true}`.

**Forfeit tx**: `await tx.liveMatch.deleteMany({ where: { fixtureId } })` before `fixture.update`.

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | `isStaleLiveMatch` predicate; `resetLiveMatch` (deleteMany + null scores + `live:null` publish) | mock `StoreDeps`; assert publish seq `prevSeq+1` |
| Unit | `expireStaleLiveMatches` freeze/winner/draw/idempotency/seq-loser | mock prisma `$transaction`+`findMany`; two-race → loser no-op; re-run no-op |
| Route | reset 401/403/404/409/200 (all LMR-1/LMR-2 scenarios) | mock `@/auth`,`@/lib/prisma`,`@/lib/liveStore` |
| Route | forfeit deletes LiveMatch (LMR-6) | extend `forfeit/route.test.ts` `prismaMock`/`stubTransaction` with `liveMatch.deleteMany` |
| Component | reset control visibility + modal confirm (LMR-7) | `MatchCard`/`MatchView` tests; `canResetLive` prop |
| E2E | reset + auto-close drop live view | extend `live-resolution.spec.ts` |

## Threat Matrix

N/A — no routing/shell/subprocess/VCS/PR automation/executable-file-classification/process-integration boundary. New HTTP route + lazy idempotent sweep only.

## Migration / Rollout

No schema migration (additive columns absent — uses existing `finishedAt`/`scheduledAt`). Rollback = revert PR; disabling UI removes reset exposure; stopping the sweep stops writes (already-finished rows are valid).

## Open Questions

- Reset leaves `ScheduleProposal` rows untouched (out of scope, `scheduledAt` preserved) — confirm no proposal reopen needed.
- Auto-close publishes a `finished` state frame with empty events delta (no `endMatch` event) — confirm the finished timeline renders without one.
