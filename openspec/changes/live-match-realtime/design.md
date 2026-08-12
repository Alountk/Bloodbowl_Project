# Design: Live Match Realtime — Interactive 2-Coach Live Mode

## Technical Approach

SSE route handler (`GET .../live`) streams `text/event-stream` over a `ReadableStream` with named events; a module-level in-memory hub (`lib/liveHub.ts`) behind a narrow interface fans out per `fixtureId` and owns the 1s clock ticker + 10s grace timers; the DB stays authoritative (`LiveMatch` + append-only `LiveEvent` with monotonic `seq`). `POST .../live` runs pure transitions (`lib/liveMatch.ts`) through a shared store (`lib/liveStore.ts`) that persists atomically (optimistic `seq` guard, no double-action at the DB level) then fans out. Subscribers get snapshot-first state (LM-8); EventSource auto-reconnects with `Last-Event-ID` (AC-4). MatchView swaps `live: null` for a `useLiveMatch` hook; finished/played matches render the timeline from the match GET's new `live` field (same DTO). Result modal pre-fills scores + per-scorer TDs from that DTO; the existing POST stays authoritative (LM-9). Clocks are a league-level creation option (enabled toggle + 120/240/360s, default 240, immutable after creation — AC-10): the League row is the only source of the duration and leagues with the option off run clockless live matches (no ticking, no grace pause; LM-5/LM-7). No new deps, no WebSockets, no custom server (LM-1); local mode 401s by design (LM-2, AC-1).

## Architecture Decisions

| # | Option | Tradeoff | Decision |
|---|--------|----------|----------|
| D1 | Transport | WS (custom server breaks standalone output) / polling (laggy) / external (deps) | **SSE route handler**, same-origin JWT cookie; control over regular HTTP POST (LM-1) |
| D2 | State authority | Hub-only (lost on restart) vs DB-only (no push) | **DB authoritative + in-memory hub** for fan-out; snapshot + `seq` catch-up covers hub loss (LM-5/6/8) |
| D3 | Clock ticking | Client timers (LM-5 forbids) vs hub ticker | **Hub 1s ticker** recomputes from persisted `clockStartedAt`; values always server-derived. Ticker runs ONLY when the league option is enabled (LM-5 clocks-disabled scenario) |
| D4 | Turn expiry | Stall forever vs auto-flip | **Clock reaching 0 auto-ends the turn** (pure `advanceTurn`, persisted, rulebook-faithful) — only when clocks are enabled; duration from `League.turnClockSeconds` (120/240/360), never a constant |
| D5 | End-of-match trigger (LM-4 deferred) | Hardcoded turn-8 vs rulebook nuance | **Auto-finish when half-2 turn-8 completes AND immediately after a TD scored in that turn**; explicit `endMatch` command (either coach or admin) for concession; no early hardcode |
| D6 | Disconnect grace (LM-7) | Key on either coach vs active only | **Key on the ACTIVE coach's connection only**; 10s hub timer persists `paused=true` + `clockStartedAt=null`; reconnect resumes. Both disconnected ⇒ active absent ⇒ pause. **Grace applies only when clocks are enabled** (LM-7) — clockless leagues never arm it |
| D7 | Catch-up | Last-Event-ID replay vs snapshot-first | **Snapshot-first (LM-8) + post-snapshot gap replay** (events `seq > snapshot.seq`); Last-Event-ID subsumed — monotonic seq guarantees convergence |
| D8 | Timeline seam (MV-6) | New `GET .../live/history` route vs extend match GET | **Extend fixture GET with `live: LiveMatchViewState \| null`** — one gate, one DTO/serializer, serves MatchView + played timeline + prefill |
| D9 | Control 403/404 split (LM-2) | Result-route style (404 all) vs forfeit style | **Member spectator → 403; foreign → 404** (LM-2 explicit; forfeit/PUT precedent) via shared `lib/liveAccess.ts` role resolver |
| D10 | Live casualty band | Server-roll 1D16 live vs record reported | **Coaches record the band (optional) on the event**; result POST still server-rolls (authoritative, LM-9) — no parallel dice path |
| D11 | TD effect | Record-only vs auto turn-end | **TD ends the turn** (rulebook); half-2 turn-8 TD finishes the match (D5) |
| D12 | e2e helpers | Extract from league-matchday.spec.ts vs local | **Local helpers in the new spec** — zero blast radius on the green suite |
| D13 | Clock config source (LM-5) | Duplicate duration on `LiveMatch` vs read league | **Read `League.turnClockSeconds` via fixture→league at load**; `LiveMatch` never duplicates the duration; `LiveMatchViewState` carries only `turnClockEnabled` (clocks nullable when off) |

## Data Flow

```
GET .../live (EventSource)                      POST .../live {type:"endTurn", side}
  auth() → liveAccess gate → 401/404/200          auth() → liveAccess gate → 401/404/403
  hub.subscribe → buffer events                   applyTransition(liveStore):
  read LiveMatch+events → `snapshot`                read row + league clock config → recompute
  gap replay (seq > snapshot.seq) → `event`*        clocks (if enabled) → pure fn
  drain buffer → live stream ◄──┐                  → $transaction: LiveMatch(seq+1) +
  heartbeat 15s; abort → cleanup │                      LiveEvent(seq+1)  [optimistic seq]
      hub channel {subs, activeCoachConns,          → hub.publish(state) → `state`/`event`
       graceTimer} ── expiry/grace → liveStore → publish   (tick/grace only when the
       league's turn-clock option is enabled; publish only when subs exist)
MatchView → useMatchDetail (live: DTO|null) + useLiveMatch (SSE) → LiveTurnBar/Clock/Feed
LeagueDetail → ResultModalFor → getMatchDetail → prefill(scores, per-scorer ΣTD)
```

Subscribe order closes the race: hub.subscribe → DB snapshot+gap → drain buffered publishes (dedupe by `seq`).

## File Changes (chained PRs, <400 lines each — slice totals shown)

| Slice | File | Action | Δ |
|---|---|---|---|
| 1 | `prisma/schema.prisma` (+`League.turnClockEnabled`/`turnClockSeconds`) | Modify | 51 |
| 1 | `prisma/migrations/<ts>_add_live_match_realtime/migration.sql` (+League columns) | Create | 63 |
| 1 | `app/api/leagues/route.ts` (POST accepts option; 400 invalid duration; omitted → 240) | Modify | 30 |
| 1 | `app/api/leagues/route.test.ts` (default 240, invalid 400, persisted, immutable) | Modify | 40 |
| 1 | `features/leagues/api.ts` (`createLeague` option param) | Modify | 15 |
| 1 | `features/leagues/useLeagues.ts` (option pass-through) | Modify | 5 |
| 1 | `features/leagues/CreateLeagueModal.tsx` (toggle + 120/240/360 select) | Modify | 50 |
| 1 | `features/leagues/CreateLeagueModal.test.tsx` | Modify | 45 |
| 1 | `lib/liveAccess.test.ts` (role matrix) | Create | 50 |
| 1 | **slice total** | | **349** |
| 2 | `lib/liveAccess.ts` (+turnClock columns in league select) | Create | 52 |
| 2 | `lib/liveHub.ts` (hub, ticker, grace — conditional on option) | Create | 115 |
| 2 | `app/api/leagues/[id]/fixtures/[fixtureId]/live/route.ts` (GET stream; clock config into channel) | Create | 93 |
| 2 | `live/route.test.ts` (GET cases) | Create | 95 |
| 2 | **slice total** | | **355** |
| 3 | `lib/liveMatch.ts` (pure transitions; `clockSeconds` from state, no constant) | Create | 135 |
| 3 | `lib/liveStore.ts` (`applyTransition` reads league option) | Create | 65 |
| 3 | `live/route.ts` (+POST handler) | Modify | 88 |
| 3 | `live/route.test.ts` (+POST cases incl. seq-conflict 409) | Modify | 95 |
| 3 | **slice total** | | **383** |
| 4 | `lib/liveMatch.test.ts` (+clocks-disabled, duration-from-league) | Create | 160 |
| 4 | `lib/liveHub.test.ts` (+no ticker/grace when disabled) | Create | 95 |
| 4 | `features/leagues/useLiveMatch.ts` (SSE hook) | Create | 65 |
| 4 | `features/leagues/api.ts` (DTO `turnClockEnabled`, nullable clocks) | Modify | 55 |
| 4 | **slice total** | | **375** |
| 5 | `features/leagues/MatchView.tsx` (hide clocks when disabled) | Modify | 100 |
| 5 | `features/leagues/MatchView.test.tsx` | Modify | 90 |
| 5 | `app/.../fixtures/[fixtureId]/route.ts` (+turnClock include + DTO field) | Modify | 40 |
| 5 | `fixtures/[fixtureId]/route.test.ts` | Modify | 20 |
| 5 | `features/leagues/liveEventLabels.ts` + `liveEventLabels.test.ts` | Create | 60+70 |
| 5 | **slice total** | | **380** |
| 6 | `features/leagues/resultPrefill.ts` + test | Create | 45+45 |
| 6 | `features/leagues/ResultModal.tsx` + `LeagueDetail.tsx` + tests | Modify | 35+25+30 |
| 6 | `e2e/live-match.spec.ts` (league created with clocks enabled) | Create | 215 |
| 6 | `playwright.config.ts` / `playwright.config.auth.ts` (ignore/match) | Modify | 1+1 |
| 6 | **slice total** | | **397** |

Deps: 1→2→3→4→5→6 (migration → SSE → control → client → timeline/prefill → e2e preserved). **All six slices fit < 400 changed lines** (349/355/383/375/380/397; total 2239). Scope rebalance from the league-clock decision: the new leagues capability (creation API + form + tests) and the migration growth land in slice 1; `lib/liveAccess.test.ts` moved there too (role-matrix tests for the gate the SSE slice consumes); unit tests for slices 2–3 still ship one PR later in slice 4. No ask-on-risk size exception needed. Migration is deploy-ahead safe (entrypoint already runs `prisma migrate deploy`).

## Interfaces / Contracts

Prisma (additive; `Fixture` gains `liveMatch LiveMatch?`; `League` gains the clock option):

```prisma
model League {
  // existing fields …
  turnClockEnabled Boolean @default(true)
  turnClockSeconds Int    @default(240) // 120|240|360, meaningful only when enabled
}
enum TeamSide { home away }
enum LiveMatchStatus { pending live finished }
model LiveMatch {
  id String @id @default(cuid())
  fixtureId String @unique
  fixture Fixture @relation(fields: [fixtureId], references: [id], onDelete: Cascade)
  status LiveMatchStatus @default(pending)
  half Int @default(1)              turnNumber Int @default(1)
  activeSide TeamSide @default(home)
  homeClock Int @default(240)       awayClock Int @default(240)
  homeScore Int @default(0)         awayScore Int @default(0)
  seq Int @default(0)               paused Boolean @default(false)
  clockStartedAt DateTime?          finishedAt DateTime?
  createdAt DateTime @default(now()) updatedAt DateTime @updatedAt
  events LiveEvent[]
  @@index([fixtureId])
}
model LiveEvent {
  id String @id @default(cuid())
  liveMatchId String
  liveMatch LiveMatch @relation(fields: [liveMatchId], references: [id], onDelete: Cascade)
  seq Int
  kind String // turn|td|casualty|foul|endHalf|endMatch
  side TeamSide?  playerRosterId String?
  half Int  turnNumber Int
  payload Json @default("{}")
  createdAt DateTime @default(now())
  @@unique([liveMatchId, seq])
}
```

`clockStartedAt` = the single "active clock began running" timestamp: `remaining = persistedClock - (now - clockStartedAt)` while `live && !paused`; `null` = paused (recompute yields zero elapsed). `seq` = optimistic guard: `updateMany({ where: { id, seq: prev } })` returning 0 rows ⇒ double-action → 409.

SSE named events (GET; add `export const dynamic = "force-dynamic"`):

```
event: snapshot  (no id)  data: { seq, status, half, turnNumber, activeSide,
       turnClockEnabled, homeClock, awayClock, homeScore, awayScore, paused,
       homeCoachId, awayCoachId, leagueOwnerId, events: LiveEventDto[] }
event: state     id:<seq> data: same minus events     // after mutations + 1s ticks
event: event     id:<seq> data: LiveEventDto          // appended event
event: heartbeat (no id)  data: {}                    // 15s; never advances the cursor
```

`turnClockEnabled` flows from the League row (LM-5); when false, `homeClock`/`awayClock`/`paused` are `null` (no ticking, no grace — LM-7), and `clockSeconds` is absent so the client can never derive a clock.

`LiveEventDto = { seq, kind, side, playerRosterId, half, turnNumber, payload, at }`; Spanish labels are client-side pure fns (`liveEventLabels.ts`, `matchSummary.ts` precedent) so payloads stay structured.

Control commands (POST): `{type:"start"}` · `{type:"endTurn", side}` · `{type:"td", side, playerRosterId}` · `{type:"casualty", side, victimRosterId, band?}` · `{type:"foul", side, playerRosterId, victimRosterId?}` · `{type:"endMatch"}`. Codes: `200 {state}` · `400` bad body/type/params · `403` member-spectator · `404` foreign/unknown (no leak) · `409` invalid transition (out-of-turn, seq conflict, start on played/result fixture, already finished). Pause/resume are hub-driven internal transitions through the same store. `lib/liveMatch.ts` invariants: alternation, no double-action, turn 1..8 per half, half flip (away starts half 2), TD-ends-turn, clock reset to `turnClockSeconds` (120/240/360 from the League row, never a constant) at turn start when clocks are enabled — clock fields inert when the option is off (LM-5 clocks-disabled).

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit (pure) | Alternation, no double-action, 8-turn cap, half flip, TD-ends-turn, TD-in-half-2-turn-8 finishes, clock recompute, pause/resume, start guards, endMatch triggers; **clocks-disabled path (transition leaves clock fields inert) and duration-from-league (360s from the League row, never a constant)** | `lib/liveMatch.test.ts`, zero mocks (`lib/result.test.ts` precedent) |
| Unit (hub) | Subscribe/publish fan-out, active-coach tracking, 10s grace, ticker recompute; **no ticker and no grace timers when the league option is off** | Fake timers |
| Unit (leagues API) | Creation accepts the option; **omitted duration defaults to 240**; **invalid duration → 400, no league created**; option persisted; immutable (no update path exists) | `app/api/leagues/route.test.ts` |
| Unit (routes) | GET 401 both modes (route never reads env)/404/200 snapshot-first + gap replay + abort cleanup; POST 401/404/403/409/200, `LiveEvent` seq order, publish-after-commit, **seq-conflict variant: `updateMany` returns 0 rows → 409 double-action** | `vi.hoisted` mock pattern (`route.test.ts` precedent) |
| Unit (subscribe race) | Deterministic interleave of the subscribe sequence: hub.subscribe BEFORE the DB read; buffered publishes drained after gap replay; duplicates dropped by `seq` | `live/route.test.ts` with a fake hub + controlled prisma seqs (no timers/flakiness) |
| Unit (components) | MatchView live render; **clocks hidden when `turnClockEnabled` false**; static states keep `not.toContainText(/turno\|minuto\|½/i)` (MV-5/AC-5); timeline live+played; Spanish labels; prefill sets scores/ΣTD only, MJP untouched | `MatchView.test.tsx`, `ResultModal.test.tsx` |
| E2E (auth only) | League created with clocks enabled (240); two contexts: coach A "Dar el turno" → coach B sees flip/clock/score via SSE; new-device recovery (fresh context, same creds → snapshot + control restored) | `e2e/live-match.spec.ts`, `testMatch`/`testIgnore` per `match-view.spec.ts` precedent |
| CI | `pnpm db:generate` + `migrate deploy` — already in entrypoint + auth webserver command | existing flow |

## Threat Matrix

N/A — no shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary (archived 2026-08-12 design precedent): the new endpoints are standard HTTP in-app routes; the additive migration deploys through the unchanged `docker-entrypoint.sh`. All five rows N/A — no tasks manufactured.

## Migration / Rollout

Additive `add_live_match_realtime` — deploy-ahead safe (entrypoint runs `prisma migrate deploy`); may ship before live code. The League columns backfill existing rows with their defaults (`turnClockEnabled=true`, `turnClockSeconds=240`) — the option is immutable, so existing leagues get clocks enabled at 240 unless this default is changed before slice 1. Rollback: revert chained PRs in reverse order. Crash mid-match loses only in-flight state; the fixture resolves via the existing result flow (no auto-results). An in-flight 10s grace timer is deliberately unpersisted: on restart, clocks recompute from persisted timestamps, so a match that crashed mid-grace resumes with the clock running unless the active coach is still disconnected (the hub re-arms grace on its first tick). No feature flag: the live routes 404 until a `LiveMatch` exists; static fixture states render exactly as today.

## Open Questions

- [ ] TD-auto-ends-turn (D11) — confirm against house rules before slice 3.
- [ ] Live casualty band is coach-reported and immutable once recorded (D10) — confirm.
