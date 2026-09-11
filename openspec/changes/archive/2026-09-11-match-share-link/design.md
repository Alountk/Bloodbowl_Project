# Design: match-share-link (RAU-7)

## Technical Approach

Add a fixed, per-fixture public read-only link (`/watch/[token]`) exposing score, clock, and event timeline only. A nullable `Fixture.shareToken` is generated lazily and idempotently on first share; expiry is **derived** from fixture state (no timestamps). Two dedicated token-gated API surfaces (`GET /api/watch/[token]`, `.../live` SSE) serve a **whitelist-reduced** DTO so no private field can leak, while the member fixture GET and `resolveLiveAccess` stay byte-for-byte untouched. A lean `WatchMatchView` renders the guest page with `viewerSide:null`.

## Architecture Decisions

| Decision | Option | Tradeoff | Chosen |
|---|---|---|---|
| Token storage | `Fixture.shareToken String? @unique` / `MatchShareToken` table / `LiveMatch` column | Fixture survives LiveMatch reset & has no revocation/audit overhead; table = revocation but overkill; LiveMatch deleted on reset | `Fixture.shareToken` |
| Generation | `randomBytes(24).toString("base64url")` / `createId()` | crypto = 192-bit URL-safe, no dots (proxy-safe); `createId` falls back to `Math.random` (insecure) | `randomBytes` |
| Expiry | Derived `isShareLinkActive(fixture)` / timestamped | Derived covers pending/ready/live/finished-unresolved; timestamp needs extra column + clock drift | Derived |
| Read route | Dedicated `GET /api/watch/[token]` / `?token=` on member GET | Dedicated can't weaken pinned auth route, no leagueId enum, minimal `select`; `?token=` risks regressions + leaks | Dedicated |
| SSE | Dedicated `.../live` + `reduceWatchFrame` / `?token=` on member SSE | Member SSE publishes FULL view (leak); dedicated reduces every frame | Dedicated |
| Reduction | Whitelist pick / blacklist spread | Whitelist drops new private fields by default (anti-drift); blacklist leaks on future fields | Whitelist |
| Guest UI | New `WatchMatchView` / `readOnly` prop on `MatchView` | New view reuses presentational pieces, zero blast radius on 2300-line `MatchView.test.tsx`; prop threads flags through consent/resolve/dock | New view |

## Data Flow

```
MatchView "Compartir" ──POST──▶ /api/leagues/[id]/fixtures/[fixtureId]/share ──ensureShareToken──▶ Fixture.shareToken
                                       │ (participants/owner/live.manage)
Guest ──GET /watch/[token]──▶ /api/watch/[token] ──isShareLinkActive?──▶ WatchMatchDto (reduced)
Guest ──SSE /watch/[token]/live──▶ liveHub.subscribe(coachId:null) ──reduceWatchFrame──▶ reduced frames
                                       ▲
                          hub.publish(full toLiveViewState)  (member transitions/ticker)
```

## File Changes

| File | Action | Description |
|---|---|---|
| `prisma/schema.prisma` + new migration | Modify | Add `shareToken String? @unique` to `Fixture` |
| `lib/watchAccess.ts` | Create | `isShareLinkActive`, `ensureShareToken`, `reduceWatchFrame`, `reduceWatchMatch`, `WatchMatchDto`/`WatchLiveView` types |
| `app/api/leagues/[id]/fixtures/[fixtureId]/share/route.ts` | Create | `POST` share: RBAC (home/away owner, league owner, `live.manage`) → idempotent `{token}` |
| `app/api/watch/[token]/route.ts` | Create | `GET`: token→fixture, expiry check, generic 404, reduced DTO |
| `app/api/watch/[token]/live/route.ts` | Create | `GET` SSE: token gate, `subscribe({coachId:null, activeCoachId:null})`, reduce every frame, ticker |
| `lib/auth-mode.ts` | Modify | Add `/watch` public prefix to `resolveAuthGate` |
| `app/providers/SessionAppProvider.tsx` | Modify | Exempt `/watch` from `AppShell` (like `/`) |
| `app/watch/[token]/page.tsx` | Create | Server page → `WatchMatchView` |
| `features/leagues/WatchMatchView.tsx` | Create | Lean guest view (reuse `LiveEventCards`, `MatchTimelineBar`, `useLiveClock`) |
| `features/leagues/useWatchLive.ts` | Create | `EventSource` hook for `/api/watch/[token]/live` |
| `features/leagues/api.ts` | Modify | `WatchMatchDto` types, `fetchWatchMatch`, `createShareLink` |
| `features/leagues/MatchView.tsx` | Modify | "Compartir" button (mirrors `canResetLive`), copy + "Copiado" |
| `lib/i18n/dictionaries.ts` | Modify | `match.share`, `match.shareCopied`, `watch.closed` es/en |

## Interfaces / Contracts

```ts
export function isShareLinkActive(fixture: {
  homeScore: number | null; awayScore: number | null;
  winnerId: string | null; result: unknown;
}): boolean; // all four null → active

export async function ensureShareToken(
  fixtureId: string,
  deps: { prisma: { fixture: { findUnique; update } }; randomBytes: (n: number) => Buffer },
): Promise<string>; // lazy, idempotent (read-then-conditional-update)

export interface WatchTeam { id: string; name: string; raceId: string; emblem: string | null; }
export interface WatchEvent { seq: number; kind: string; side: "home"|"away"|null;
  playerRosterId: string | null; half: number; turnNumber: number;
  payload: Record<string, unknown>; at: number; }
export interface WatchLiveView { seq: number; status: LiveMatchStatus; half: number;
  turnNumber: number; activeSide: TeamSide; homeScore: number; awayScore: number;
  startedAt: number | null; finishedAt: number | null; elapsed: number;
  homeTurnMs: number; awayTurnMs: number; paused: boolean; viewerSide: null; events: WatchEvent[]; }
export interface WatchMatchDto { fixture: { id; round; status; scheduledAt; homeScore; awayScore; winnerId };
  homeTeam: WatchTeam; awayTeam: WatchTeam; live: WatchLiveView | null;
  summary: { homeScore: number; awayScore: number; winnerSide: "home"|"away"|null } | null; }
```

`reduceWatchFrame(frame)` whitelist-picks the `WatchLiveView` fields, forces `viewerSide:null`, and filters `events` through `isDisplayEvent`. `summary` is derived from `live` when `live.status==="finished" && result==null` (never from `result`). `reduceWatchMatch` maps the route's minimal Prisma select → `WatchMatchDto`.

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit | `isShareLinkActive`, `ensureShareToken` idempotency, `reduceWatchFrame`/`reduceWatchMatch` drop private fields | `lib/watchAccess.test.ts` (no mocks) |
| Unit | Guest `subscribe({coachId:null})` never arms pause, null `activeCoachId`/absent `onGraceExpired` never overwrite | `lib/liveHub.test.ts` |
| Route | Share RBAC (200/401/403/404); watch GET/SSe generic 404 (unknown==played); DTO has no private keys | new route tests |
| Component | `WatchMatchView` no chrome/no controls; `MatchView` share button visibility + copy | `WatchMatchView.test.tsx`, `MatchView.test.tsx` (green) |
| E2E | Guest opens link, sees score/clock/timeline; played → 404 | `e2e/watch.spec.ts` |
| Regression | `auth.config.test.ts`, `resolveLiveAccess` 401-anon, fixture GET DTO unchanged | existing suites stay green |

## Threat Matrix

N/A — no shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. (HTTP route protection is covered by the auth-gate tests above, not this matrix.)

## Migration / Rollout

Additive `shareToken` migration; no backfill, no data migration. Feature is inert until the share UI ships. Rollback = revert chained PRs.

## Slices (<400 lines each, chained PRs)

1. **S1**: schema+migration, `lib/watchAccess` (predicate+reducers), share route, `/watch` prefix in `resolveAuthGate`, `lib/watchAccess.test.ts`, `auth.config.test.ts` green.
2. **S2**: `GET /api/watch/[token]` reduced DTO + route tests.
3. **S3**: `GET /api/watch/[token]/live` SSE + `useWatchLive` + `liveHub` grace test.
4. **S4**: `/watch/[token]` page + `WatchMatchView` + `SessionAppProvider` exemption + i18n + `e2e/watch.spec.ts`.
5. **S5**: `MatchView` share button + `createShareLink` + tests.

## Open Questions

None blocking — product decisions fixed in proposal/spec; all codebase surfaces verified with line evidence.
