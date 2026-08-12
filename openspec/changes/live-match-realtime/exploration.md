# Exploration: live-match-realtime — Real-Time Live Match Mode

## Summary

The roadmap's largest feature: replace the inert live shells (MV-5, PRs #57–#60) with
real-time synchronization between the two fixture coaches — turns, half, clock,
scoreboard, and a chronological event feed — ending in a state the existing result
flow can consume. This change CANNOT avoid a Prisma migration (unlike the MVP's
MV-6 lock) and introduces the app's first realtime channel. It also lifts MVP's
out-of-scope lock (MV-6).

## Current State

### The inert shells and their seam

`features/leagues/MatchView.tsx` renders the live shells as no-ops:

```tsx
function LiveTurnBar({ live }: { live: null }) { void live; return null; }
function LiveClock({ live }: { live: null }) { void live; return null; }
function LiveEventFeed({ live }: { live: null }) { void live; return null; }
// ...
const live: null = null;
```

They are rendered AFTER the summary body, always, but receive `live: null` → render
nothing. The seam to feed them is narrow: replace `live: null` with a real live
state object typed as `{ turn, half, clocks, scoreboard, events }`, and fill the three
shell bodies from that object. The shells cannot render visible placeholders (MV-5/MV-6
guarantee — the e2e `match-view.spec.ts` asserts absence of `turno|minuto|½` and their
test `MatchView.test.tsx` asserts no feed for static states). Any realtime change MUST
keep those assertions green for played/scheduled/pending states (live only when the
match is actually live).

`MatchView` client-fetches via `useMatchDetail` → `getMatchDetail` (GET
`/api/leagues/[id]/fixtures/[fixtureId]`), which returns
`{ fixture, result|null, homeTeam, awayTeam }`. The fixture GET is read-only.

### The result flow seam (post-live handoff)

`POST /api/leagues/[id]/fixtures/[fixtureId]/result` (`features/leagues/api.ts`
`ResultPayload`; route `ResultPlayload` in `result/route.ts`) expects the FULL report:
per-team `{ score, ballHeld, players: ResultPlayerAction[] (tds/casualties/...),
mvp.nominations[6], casualties[] }` plus `weather`. It validates
`scoresMatchReportedTotals` (per-player TDs must sum to score), rolls server dice (FF,
MVP 1D6, injury 1D16), persists the `MatchResult` snapshot (`scores`, `winnings`,
`mvp`), and mutates treasury + FF + PE + injuries in one `$transaction`.

The LIVE event feed (TD/casualty/foul) is NOT the post-match action report. A live TD
event has a scorer but the report needs per-player TD credits and 6 MJP nominations —
so live events can PRE-FILL a draft report (scores already sum, list of players who
scored) but the report's MJP nominations and the exact `ResultPlayerAction` detail
(casualty counts, interceptions, etc.) are user input the coaches still enter through
the existing `ResultModal`. **Recommendation: a "match finished" live state flags the
result modal as pre-fillable, but the handoff still runs through the existing POST —
do NOT invent a parallel result path.** A live snapshot's scores can drive
`scoresMatchReportedTotals` (pre-fill per-scorer TDs), but MVP and other actions stay
server-validated via the existing route.

### Persistence: nothing stores in-progress state

`prisma/schema.prisma` has `Fixture` (scores/winner only, set at result time), `MatchResult`
(snapshot, created only when a result loads), `MatchResultCorrection`, `Player`,
`Team`, `League`, `User`, `ScheduleProposal`. There is NO live/in-progress table. MV-6
explicitly froze the schema; this change is the first to lift it.

## Deployment Topology — Transport Options

### Facts from the repo

- `next: 16.3.0`, `output: "standalone"` (`next.config.ts`). Container runs `node
  server.js` (`Dockerfile` runner stage + `CMD`).
- **Single web instance**: `docker-compose.yml` defines ONE `web` service
  (`ghcr.io/alountk/bloodbowl_project:latest`) + one `postgres`. Arcane deploys that
  compose as described in `docs/auth.md`. No Redis/queue service exists.
- **No WebSocket dependency** in `package.json` (deps: next, next-auth, prisma, react,
  react-dom, react-easy-crop, sharp, aws-sdk). No `ws`/`socket.io`/`pusher`/`ably`.
- Dockerfile copies `.next/standalone` + prisma + node_modules `.pnpm`/`@prisma`/`prisma`
  explicitly into the runner — a custom server would need new bundling/tracing handling.
- `vitest` env is jsdom; `proxy.ts` (Next 16 convention, not middleware) gates routes.

### Transport analysis

| Option | Feasibility in this stack | Pros | Cons | Effort |
|--------|---------------------------|------|------|--------|
| **SSE (recommended)** | Route handler returns a `ReadableStream`/`Response` with `text/event-stream`. No deps, no custom server. | Native Next; no extra container; JWT cookie works (`EventSource` sends cookies same-origin); single-direction push is exactly the live-view need; server can close/reconnect cheaply; trivial to test with mocked fetch/ReadableStream. | Server→client only (clients POST control actions over regular HTTP and SSE pushes the new state back — actually an app-idiomatic split). No auto-reconnect in `EventSource` (browsers DO auto-reconnect on drop — good). Long-lived connection must be connection-scoped (DB-flush channel on each POST, or a tiny in-memory hub). | Medium |
| **WebSocket** | Next 16 standalone CANNOT host a WS server without a custom Node server or an external gateway; package.json has no ws lib. Adding a custom server breaks the standalone output contract and needs Dockerfile/entrypoint changes. | True bidirectional; lowest latency. | New dep + custom server + Dockerfile churn + auth handshake complexity. Overkill for 2 coaches pushing state rarely. | High |
| **Polling (last-event API)** | Trivial: client polls `GET .../live?since=<seq>` every N seconds; merge state server-side. | Dead simple, zero deps, zero long-held connections; auth identical to existing GET. | Not real-time (latency = interval); wasteful; reintroduces the "inert shell" feel if too slow. | Low |
| **External realtime (Pusher/Ably)** | Viable but adds an external service + SDK + credentials, contradicting the rulebook-light "no new deps" ethos and adding ops surface. | Scales to many viewers, ops-managed. | External dependency + a second transport with its own auth; production now depends on a third-party channel. | Medium-High |

### Topology conclusion

**Single-instance today** — in-memory pub/sub (a module-level `Map<fixtureId, Set<Connection>>`)
is feasible and correct for the ONE Arcane web container. It loses all in-flight live
state on a restart (acceptable: a crash mid-match abandons the live session; coaches
can still resolve via the existing result flow). If multi-instance scaling ever lands,
the same design must swap the hub to a DB/Redis-backed fan-out (the state is already
DB-baselined per mutation, so a `last-event-get` catch-up covers missed events). Design
the hub behind a narrow interface so the swap is local.

## Realtime Authentication — both AUTH_MODE pairs

Critical finding: **the live-match feature cannot meaningfully exist in `AUTH_MODE=local`.**

- Route handlers always call `auth()` from `@/auth`. Without a session, the fixture GET
  returns 401 — and there ARE no leagues/fixtures in local mode (leagues live only in
  Postgres/Prisma; the anonymous local store is teams-only).
- `AUTH_MODE=local` is the anonymous/dev/test store. `AUTH_MODE=auth` is production
  (`docs/auth.md`: "Production MUST set auth", compose defaults `AUTH_MODE=auth`).

So the realtime channel authenticates via the SAME `auth()` session as every other
route:
- **Auth mode**: `EventSource` against `GET /api/leagues/[id]/fixtures/[fixtureId]/live`
  sends the Auth.js JWT cookie same-origin (default `credentials: same-origin` →
  cookies ARE included); the SSE handler runs `auth()`, 401 without a session, and applies
  the SAME visibility gate as the fixture GET (owner or any member; start-match for the
  result-style participant/admin gate).
- **Local mode**: fixtures don't exist, so the realtime route simply 401s — consistent.
  The "identical in both modes" guarantee of MV-1 means "same 401 path when no session",
  not that live matches work in local mode.

**No separate token/session handling needed for SSE.** The one caveat: `EventSource`
readies are HTTP GETs through the Next route handler, so the existing JWT cookie path
applies unchanged. For control (start/pause/end match, push an event) use regular HTTP
POSTs to a control route (`.../live` with POST = mutate + fan-out), which already follow
the session-auth + participant-gate pattern of the result route.

## Data Model — Live Match State

### What the shells expect (seam)

Replace `const live: null = null` with a typed object. Proposed shape (feeds the three
shells):

```ts
interface LiveTurnState {
  activeSide: TeamSide;          // "home" | "away" whose turn it is
  half: 1 | 2;
  turnNumber: number;            // 1..8 per half, rulebook BB2025
  homeClock: number;             // seconds remaining (per-clock)
  awayClock: number;
  homeScore: number;             // live TDs
  awayScore: number;
  events: LiveEvent[];           // chronological feed
}
interface LiveEvent {
  id: string;                    // seq for `since` catch-up
  kind: "kickoff" | "td" | "casualty" | "foul" | "turn" | "endHalf" | "endMatch";
  side?: TeamSide;
  playerRosterId?: string;       // for td/casualty/foul
  minute: number;                // for feed display
  at: string;                    // ISO timestamp
  label: string;                 // server-rendered Spanish label
}
```

### New persistence (migration required — the MVP avoided it)

Candidate models (shape only, NOT full schema — design.md owns naming):

- `LiveMatch` (1:1 fixture): `id, fixtureId @unique, status (pending|live|finished),
  half Int @default(1), turnNumber Int @default(1), activeSide TeamSide,
  homeClock Int @default(TURN_CLOCK), awayClock Int @default(TURN_CLOCK),
  homeScore Int @default(0), awayScore Int @default(0), startedAt?, finishedAt?,
  created/updatedAt`. Index `[fixtureId]`. Rough size: ~12 columns.
- `LiveEvent` (1:many LiveMatch): `id, liveMatchId, seq Int @default(auto), kind String,
  side TeamSide?, playerRosterId String?, minute Int, at DateTime, meta Json?`.
  Index `[liveMatchId, seq]`. Each event is append-only, chronological `seq` = the SSE
  `since` cursor for catch-up. Rough size: ~7 columns + Json.
- Optional `LiveMatchClock`? No — two `Int` clock columns on `LiveMatch` suffice; no third
  table.

No in-progress state exists today → all of the above is net-new. The snapshot write at
the end is the EXISTING `MatchResult` POST (no change); a finished `LiveMatch` merely
flags the result modal as pre-fillable with `homeScore/awayScore` + `LiveEvent`-derived
per-scorer TDs.

## Business Rules & Auth

### Who controls a live match

Existing gate precedent (result route): league owner OR either fixture captain
(home/away team owner) may POST; foreign → 404. The fixture GET (MV-1, D6) gates READ:
STARTED → owner or any member; OPEN → any authenticated (defensive; no fixtures while open).

**Recommendation**: the realtime channel must preserve this matrix.
- READ (SSE subscribe): identical to fixture GET — owner/member in started, any-auth in open.
- WRITE (start/pause/end match, push control events like turn/kickoff): **participant +
  admin only** (captain of home OR away team, or the league owner) — same as the result
  POST gate. A mere member/viewer watches read-only (matches how negotiation treats the
  non-participant).

### Turn/clock ownership — rulebook invariants

The rulebook model is ALTERNATING turns, ONE active controller per match (the coach whose
turn it is). Server-enforced invariants:

- Turn alternation: only `activeSide` may submit turn actions; a turn-end flips
  `activeSide`.
- No double-action: after commit, that coach is locked out until the other completes.
- Per-team clock: only the active coach's clock runs; the other pauses.
- Half limits: BB2025 = 8 turns per half per team; `turnNumber` resets at half flip and
  caps at 8; ending turn 8's clock → half ends; away goes first in the 2nd half.
- Server owns the canonical state: every control POST validates the transition against
  the current `LiveMatch` row and rejects invalid turns with 409/400 (never trust client
  state).

These map naturally to PURE transition functions (precedent `lib/result.ts`):
`beginMatch`, `endTurn(state)`, `advanceHalf(state)`, `recordTd(state, scorer)`,
`recordCasualty(state, victim)`, `endMatch(state)` — each `(state, input) => { state',
event }`, unit-testable without IO.

### Anti-abuse

Clock is server-authoritative (countdown derived from `startedAt`/persisted remaining,
not client timers), so a coach can't cheat their own clock. Match start requires the
fixture to be `scheduled` and no `winnerId`/result yet (rejects replaying/finished).

## Testing Approach

### Vitest route / state-machine pattern (existing precedent)

`app/api/leagues/[id]/fixtures/[fixtureId]/route.test.ts` shows the repo's exact pattern:
`vi.hoisted()` for `auth`+`prisma` mocks, `vi.mock("@/auth")` + `vi.mock("@/lib/prisma")`,
`Request`/`next` context builders, scalar assertions. A live control route test would
mirror this: mock `auth` + `prisma`, assert 401/404/409/200 per the participant/admin gate,
assert turn-alternation and clock invariants reject invalid transitions, assert the
`LiveEvent` rows written. The pure `lib` functions get their own `lib/liveMatch.test.ts`
(the `lib/result.test.ts` precedent: pure, zero mocks).

### Playwright: two-browser sync is PROVEN

`e2e/league-matchday.spec.ts` already drives THREE independent browser contexts in one
spec (`browser.newContext()` ×3, each with its own signup session), swaps pages by team,
polls APIs for committed state, and awaits both sides. A realtime live-match spec would
reuse `setupStartedLeague`-style helpers: member B opens the match page (SSE subscribe),
member C (the other coach) opens it too; B presses "Dar el turno" → both pages update the
turn bar (assert cross-context with `await expect(...).toHaveText(...)` after an SSE
round-trip). `playwright.config.auth.ts` routes new live specs into the auth run only;
`playwright.config.ts` `testIgnore` keeps them out of the local run (the MVP precedent —
`match-view.spec.ts`). Note: `EventSource` auto-reconnect is fine in Playwright; assert
via `expect.poll` or explicit waits, as the existing specs already do for async commits.

### State-machine design enables

Pure transition functions give the entire turn/clock/event model unit coverage without
the network (the strongest precedent is `lib/result.ts` + `lib/rules/*`: PE, casualty,
FF, winnings all pure, exhaustively unit-tested). The realtime route then only tests auth
gating + persistence + hub fan-out — a thin slice.

## Scope Guidance (for slicing — informs design.md/tasks.md)

### Minimal first slice that delivers visible realtime value

**One fixture, two coaches, SSE push of state, no full-history persistence of the
event feed yet.** Concretely:
1. Prisma migration: `LiveMatch` row (state can be DB-resident from slice 1 so restarts
   don't strand coaches; `LiveEvent` optional until the feed-persistence slice).
2. `GET .../live` SSE route gated by the MV-1 matrix; 401 in local mode.
3. `POST .../live` control route: start/end-turn/kickoff/half — participant+admin only,
   alternating-turn invariants, server clock.
4. Fill the three `MatchView` shells from a `useLiveMatch` SSE hook (replacing
   `live: null`), keeping MV-5/MV-6 assertions green for non-live fixtures.
5. `endMatch` flags the fixture for the existing result modal prefill (scores + per-scorer
   TDs from the live session), still posting through the existing result route.

**What demonstrates visible value**: two coaches on two browser contexts see the turn
bar, clock, and score synchronize; the MV-5/MV-6 guarantee holds for played/scheduled/
pending.

### Naturally follows

- Persistent `LiveEvent` feed (chronological timeline + `since` catch-up for late writers).
- Multi-viewer (league members watch read-only; the hub already allows N subscribers).
- Result-modal prefill depth (casualties from live fouls → pre-fill action counts).
- Replay / audit of a finished live match.

### The unavoidable risk

This change **requires a Prisma migration** (first since MVP's MV-6 lock) and **the first
realtime channel** (first long-held connection). Consequences for chained-PR sizing:
- The migration must ship as its own early slice (data-model first), reviewed with schema
  scrutiny; it is additive (new tables, no alteration of existing columns) so it is safe
  to deploy ahead of the live code.
- SSE route + hub + client hook is the bulk of new code and MUST be split into `<400` PRs
  (seed: migration-LiveMatch → SSE subscribe route → control route + pure transitions →
  MatchView shell wiring → e2e). Budget risk is HIGH; the MVP's stacked-to-main chain and
  "ask-on-risk" delivery strategy carry over.
- New long-lived connections are a new operational surface: document close-on-crash and
  the DB-baselined catch-up so a reconnect never shows stale turn/clock.

## Approaches

1. **SSE + in-memory hub + Prisma-backing (recommended)** — described above.
   - Pros: zero new deps; single-instance fits Arcane; MVI auth matrix reused; DB-baselined
     state survives hub loss; result handoff untouched.
   - Cons: in-memory hub means state loss on restart (mitigated by DB column); no
     multi-instance scaling without a hub swap behind an interface.
   - Effort: Medium-High (migration + SSE + control route + client hook + e2e).
2. **Polling "last event" API** — client polls `GET .../live?since=<n>`.
   - Pros: simplest, no long-lived connections, auth identical to existing GET.
   - Cons: not real-time; poor feel; still needs the same state models/migration.
   - Effort: Low-Medium.
3. **WebSocket / external realtime** — rejected: needs custom server (breaks standalone)
   or third-party deps/ops, both contrary to the no-new-deps ethos and the single-container
   topology.

## Recommendation

**SSE + a narrow in-memory hub (DB-baselined state)**, one fixture, two coaches, and a
result-modal handoff through the existing POST. Slice in stacked PRs (< 400 lines),
migration first. The MV-1 auth matrix is preserved for both read (SSE) and write
(participant+admin). AUTH_MODE=local simply 401s the realtime routes (fixtures don't exist
there); production (`auth`) is the realtime target. This is ready for proposal.

## Affected Areas

- `features/leagues/MatchView.tsx` — replace `live: null` with a real `useLiveMatch` SSE
  hook; fill `LiveTurnBar`/`LiveClock`/`LiveEventFeed`; keep MV-5/MV-6 assertions green
  for non-live states.
- `features/leagues/api.ts` + `useMatchDetail` — add the live SSE hook/type surface.
- `app/api/leagues/[id]/fixtures/[fixtureId]/live/route.ts` (new) — SSE GET + control POST.
- `lib/liveMatch.ts` (new) + test — pure transition functions (turn/clock/half/events).
- `prisma/schema.prisma` + a new migration — `LiveMatch` (+ `LiveEvent` when the feed
  slice lands) models.
- `app/api/leagues/[id]/fixtures/[fixtureId]/result/route.ts` — consumer of a finished
  live state (prefill seam; no new result path).
- `playwright.config.ts` / `.auth.ts` — route the live-match e2e into the auth-only run.
- `e2e/live-match.spec.ts` (new) — two-context sync journey reusing matchday helpers.

## Risks

- **CRITICAL — First Prisma migration**: MVP's MV-6 lock is lifted; the migration must be
  additive and deploy ahead of live code (entrypoint runs `prisma migrate deploy`). Sizing
  and review of the new tables needs its own PR.
- **CRITICAL — AUTH_MODE=local reality**: the fixture GET already 401s in local mode
  (no leagues in the local store), so the realtime routes 401 there too — this must not be
  read as a regression; the "both modes" MV-1 parity means "same 401 when no session".
- **WARNING — First long-lived connection**: SSE is new ops surface. On restart/close,
  the in-memory hub empties; the DB-baselined state + `since` catch-up must be designed in
  so a reconnect never shows stale turn/clock.
- **WARNING — 400-line chained-PR budget**: migration + SSE + control route + client hook
  + e2e is high-risk for the budget; stack tightly (migration → SSE subscribe → control +
  transitions → MatchView wiring → e2e), "ask-on-risk".
- **SUGGESTION — Rulebook-light ethos**: no new runtime dep, no WebSocket custom server,
  no icon lib; tokens/copy stay as MV-7.
- **SUGGESTION — Result modal**: prefill live scores/TDs but keep the existing POST
  validation (MJP nominations + action counts stay user-entered).

## Ready for Proposal

Yes. Recommend the orchestrator proceed to `sdd-propose` for `live-match-realtime` with:
SSE + in-memory hub (DB-backed state), single fixture / two coaches first slice, auth
matrix preserved from MV-1 + result POST front, migration-first stacked PRs. Flag to the
user that this is the first schema migration and first realtime channel in the project.
