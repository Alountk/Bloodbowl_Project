# Proposal: match-share-link (RAU-7)

## Intent

Every route is auth-gated and no share/token infrastructure exists, so coaches cannot show a match to non-members. Add a fixed per-fixture public read-only link (score, clock, timeline), no private data.

## Scope

### In Scope
- `Fixture.shareToken` + idempotent share endpoint (participants/owner/admin).
- Reduced DTO + SSE at `GET /api/watch/[token]` and `.../live`.
- `/watch/[token]` guest page, public prefix, AppShell exemption.
- Share button/copy in `MatchView`; i18n; tests.

### Out of Scope
- Link per league; rotation/revocation/audit.
- Expired vs unknown token distinction (both generic 404).
- Rosters, treasury, PE, signings, proposals, MVP/resolution/inducements.
- Touching `resolveLiveAccess`/fixture GET; MatchCard share (follow-up).

## Capabilities

### New Capabilities
- `match-share-link`: token lifecycle, reduced read DTO, reduced guest SSE, guest watch page, share UI.

### Modified Capabilities
- `user-auth`, `app-shell`, `live-match-realtime` (LM-2), `match-view`: `/watch` public + AppShell exemption + token guest read + share affordance; member gates unchanged.

## Approach

- **Token**: `randomBytes(24).toString("base64url")` (192-bit, URL-safe, no dots), lazy on first share, never rotated.
- **Expiry (derived)**: valid iff `homeScore`/`awayScore`/`winnerId`/`result` all null; else generic 404.
- **DTO includes**: fixture `{id, round, status, scheduledAt, homeScore, awayScore, winnerId}`, teams `{id, name, raceId, emblem}`, reduced `live` `{seq, status, half, turnNumber, activeSide, homeScore, awayScore, startedAt, finishedAt, elapsed, homeTurnMs, awayTurnMs, paused, viewerSide:null, events}`.
- **DTO excludes**: `result`, team `user`, `roster`, `coaching`, player `pe/skills/injuries/valueBonus/missNextMatch`, `mvpNominations`, `resolutionState`, `inducements`, `inducementBudget`, `pendingCasualty`, `concedeProposedBy`, `journeymen`, `mvpGrantees`, `liveWinnings`, `homeConsented/awayConsented`.
- **SSE**: `liveHub.subscribe({coachId:null, activeCoachId:null, onGraceExpired:undefined})` + ticker; `reduceWatchFrame` reduces every frame.
- **UI**: lean `WatchMatchView`; `viewerSide:null` hides controls.

## Affected Areas

New: `lib/watchAccess.ts`, `app/api/.../fixtures/[fixtureId]/share/route.ts`, `app/api/watch/[token]/{route.ts,live/route.ts}`, `app/watch/[token]/page.tsx`, `features/leagues/{WatchMatchView.tsx,useWatchLive.ts}`.
Modified: `prisma/schema.prisma` (+migration), `proxy.ts`/`lib/auth-mode.ts`, `app/providers/SessionAppProvider.tsx`, `features/leagues/{MatchView.tsx,api.ts}`, i18n.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Hub frame leaks private fields | High | Reduce every frame; route tests |
| Spectator unsubscribe re-arms grace | Med | No grace handler; liveHub test |
| Guest page renders in AppShell | Med | Provider exemption + test |

## Rollback Plan

Revert the chained PRs; nullable `shareToken` needs no data migration and the feature is inert without the share UI.

## Success Criteria

- [ ] Valid link shows score/clock/timeline only; no private fields.
- [ ] Played fixture or invalid token → same 404.
- [ ] Participants/owner/admin generate one stable link; others cannot.

## Forecast (400-line budget)

| Slice | Content |
|-------|---------|
| S1 | Schema + migration + `lib/watchAccess` + share route + `/watch` prefix + tests |
| S2 | `GET /api/watch/[token]` reduced DTO + tests |
| S3 | `.../live` SSE + `useWatchLive` + tests |
| S4 | `/watch/[token]` page + `WatchMatchView` + AppShell exemption + i18n + e2e |
| S5 | Share button + `createShareLink` + tests |

5 chained PRs (<400 each).
