# Design: Live Match Flow

## Technical Approach

Replace the single-command start with two-phase consent→ready→begin (LM-11/LM-3); replace per-turn clocks with a server-derived unified clock (`startedAt` anchor + `homeTurnMs`/`awayTurnMs` accumulators, `clockStartedAt` repurposed as the running segment start — LM-5); delete D4/`onClockExpired` (5 sites); gate event commands by `activeSide` via a new pure `lib/livePhase.ts` (LM-12); add `turnStart`/`requestTurn` events + cooldown (LM-13); relax propose/accept locks for rejornar; widen PUT correction to participants; deprecate the league clock option (columns stay, reads stop). Additive migration, no WebSockets, 4 chained PRs (slice 1 exceeds 400 → ask-on-risk).

## Architecture Decisions

| # | Decision | Tradeoffs | Choice |
|---|----------|-----------|--------|
| D14 | Admin event recording under LM-12 | Admin-without-side has no `activeSide`; allowing events breaks asymmetry; blocking endMatch removes concession | Admin MAY do lifecycle ops (`endMatch`), NOT consent/begin/events/nudge → 403; coaches only for play surface. `begin` is coach-only (it IS the first turn) |
| D15 | Legacy `turnClockEnabled/Seconds` payload | 400 protects "clean" API but breaks stale production clients (Arcane images) sending the fields; ignore is inert-safe (columns unused) | **Ignore-not-persisted**: drop from validation, never read, columns keep DB defaults. Matches leagues delta scenario verbatim |
| D16 | LiveMatch row creation | Create-on-entry creates orphan pending rows for every scheduled fixture; create-on-first-consent couples row existence to intent | Row created on FIRST consent command. Never-consented fixture → `live: null` in GET → MatchView "Iniciar partido". P2002 race → re-read + applyTransition |
| D17 | Nudge cooldown | No limit = spam; persisted counter = schema churn; timestamp check is 1 indexed query | 60s cooldown (`REQUEST_TURN_COOLDOWN_MS` in lib/liveMatch.ts) keyed on last persisted `requestTurn` event `at`; extras → 409, no mutation |
| D18 | Grace pauses unified clock | Pause excludes disconnect time (fair, active coach loses nothing); keep-counting penalizes connectivity | Pause via `paused`: bump active accumulator by `(now - clockStartedAt)`, null segment start; resume restarts segment. Survives restart (persisted) |
| D19 | Per-viewer `viewerSide` fan-out | Hub publishes ONE payload per fixture; embedding per-viewer side is impossible; omitting forces client-side userId (unavailable — cookie-only session) | `viewerSide` computed server-side per session in snapshot/POST-response/fixture-GET; hub `state`/`event` frames carry `viewerSide: null`; `useLiveMatch` keeps last non-null value |

Clock model: `startedAt` = kickoff anchor (LM-5 "marks the first-turn kickoff", informational); `clockStartedAt` repurposed = current running turn-segment start (null while paused/pre-live). Accumulators bump at boundaries (turn flip / pause / finish) by `(now - clockStartedAt)`; derived values on read: `inFlight = paused ? 0 : now - clockStartedAt`; `homeTurnMs' = homeTurnMs + (activeSide==="home" ? inFlight : 0)`; `elapsed = homeTurnMs' + awayTurnMs'` (pauses excluded, restart/reconnect recompute — LM-5). Ticker publishes derived values only (no per-tick DB writes).

## Data Flow

```
POST consent(home) ─→ LiveMatch row created (pending, homeConsented)
POST consent(away) ─→ status ready (both booleans true) ─→ publish view
POST retractConsent → clears bool → pending (no clock)
POST begin ─→ live + startedAt=now + segmentStart=now + turnStart(home) event
  │
  ├─ ticker (1s, info-only): publish derived homeTurnMs/awayTurnMs/elapsed
  ├─ endTurn/TD flip: bump outgoing side accumulator, segmentStart=now, turnStart(nextSide)
  ├─ disconnect 10s → pauseLiveMatch: bump active accumulator, paused=true, segmentStart=null
  └─ reconnect → resumeLiveMatch: segmentStart=now
POST requestTurn(non-active) → persist requestTurn event (cooldown 60s) → active coach UI nudge
```

## Interfaces / Contracts

```prisma
enum LiveMatchStatus { pending ready live finished }

model LiveMatch {
  // + additive fields (homeClock/awayClock stay, deprecated-unused; no drops)
  homeConsented Boolean @default(false)
  awayConsented Boolean @default(false)
  startedAt     DateTime?
  homeTurnMs    Int      @default(0)
  awayTurnMs    Int      @default(0)
  // clockStartedAt REPURPOSED: running segment start (null = paused/pre-live)
}
```

```sql
-- prisma/migrations/<ts>_add_live_match_flow/migration.sql (additive, deploy-ahead)
ALTER TYPE "LiveMatchStatus" ADD VALUE 'ready';
ALTER TABLE "LiveMatch" ADD COLUMN "homeConsented" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LiveMatch" ADD COLUMN "awayConsented" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LiveMatch" ADD COLUMN "startedAt" TIMESTAMP(3);
ALTER TABLE "LiveMatch" ADD COLUMN "homeTurnMs" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LiveMatch" ADD COLUMN "awayTurnMs" INTEGER NOT NULL DEFAULT 0;
```

New pure functions in `lib/liveMatch.ts` (all throw on invalid, mirroring `throwInvalid`):

```ts
consentStart(state, { side }, now): LiveMatchState   // sets bool; status = both ? "ready" : "pending"; already-both → no-op
retractConsent(state, { side }, now): LiveMatchState // clears bool; status = both ? "ready" : "pending"
beginMatch(state, now): LiveMatchState               // requires ready+both; → live, half 1 turn 1 home, startedAt/segmentStart=now, events: start + turnStart("home")
// turnTransition/applyTD/applyEndTurn/applyEndMatch gain: bump outgoing side by (now - clockStartedAt); segmentStart=now; emit turnStart(nextActive)
```

New pure decision in `lib/livePhase.ts`:

```ts
resolveEventPermission({ callerSide: "home"|"away"|null, activeSide, kind: "td"|"foul"|"casualty"|"passTurn", victimSide? })
// callerSide===activeSide → allow (any victim); callerSide!==activeSide → allow ONLY casualty+victimSide===callerSide;
// callerSide===null → deny. Route maps: participant deny → 409, non-participant → 403, foreign → 404 (gate).
```

DTO (both serializers, identical field set):

```ts
interface LiveMatchViewState {
  seq: number; status: "pending"|"ready"|"live"|"finished"; half: number; turnNumber: number;
  activeSide: "home"|"away"; homeConsented: boolean; awayConsented: boolean;
  viewerSide: "home"|"away"|null; startedAt: number|null; elapsed: number;
  homeTurnMs: number; awayTurnMs: number; paused: boolean;
  homeScore: number; awayScore: number; finishedAt: number|null;
}
// REMOVED: turnClockEnabled, homeClock, awayClock, nullable paused
// LiveCommand: + {type:"consent",side} {type:"retractConsent",side} {type:"begin"} {type:"requestTurn"}; - {type:"start"}
// LiveEventKind: + "turnStart" | "requestTurn"
```

`serializeLive` (fixture GET) and `toLiveViewState` (live route) share a pure `deriveLiveClock(rowFields, now)` in `lib/liveMatch.ts` computing `homeTurnMs/awayTurnMs/elapsed/paused` — kills the clock drift risk (WARNING 2); field-set parity asserted by a test. `serializeLive` additionally takes `viewerSide` (from session + `fixture.homeTeam.userId/awayTeam.userId`).

## File Changes

| File | Action | Δ |
|------|--------|---|
| `prisma/schema.prisma` + `migrations/<ts>_add_live_match_flow/` | Modify/Create | ~25 |
| `lib/liveMatch.ts` | Modify: status+`ready`, consent/begin fns, clock accumulation, **delete D4** `autoEndTurnOnClockZero`, DTO, `deriveLiveClock`, cooldown const | ~160 |
| `lib/liveStore.ts` | Modify: `liveMatchRowToState`/`rowData` new fields, `startLiveMatch`→`consentLiveMatch`/`retractLiveConsent`/`beginLiveMatch`, pause/resume repurposed | ~110 |
| `lib/liveHub.ts` | Modify: ticker derives+publishes (no decrement), **delete `onClockExpired`**, grace unconditional (drop turnClockEnabled gate) | ~70 |
| `app/.../fixtures/[fixtureId]/live/route.ts` | Modify: commands, **delete D4 wiring + import**, side gate, requestTurn+cooldown, viewerSide | ~120 |
| `app/.../fixtures/[fixtureId]/route.ts` | Modify: `serializeLive` new DTO + viewerSide | ~50 |
| `app/api/leagues/route.ts` | Modify: drop turn-clock validation (D15) | ~25 |
| `features/leagues/api.ts` | Modify: `LiveCommand`/DTO types, `createLeague(name, desc)` (drop option) | ~45 |
| `features/leagues/CreateLeagueModal.tsx` | Modify: remove clock toggle/select | ~30 |
| `features/leagues/MatchView.tsx` | Modify: consent panel, per-side clock UI, "Tu turno"/"Pedir turno" | ~150 |
| `features/leagues/useLiveMatch.ts` | Modify: keep last-known viewerSide | ~10 |
| `lib/livePhase.ts` | Create: side matrix | ~60 |
| `features/leagues/liveEventLabels.ts` | Modify: 2 labels | ~8 |
| `propose/route.ts`, `accept/route.ts` | Modify: played-only 409 (scheduled allowed); accept updates `scheduledAt` (already) | ~35 |
| `features/leagues/NegotiationPanel.tsx` | Modify: gate `pending` OR `scheduled` | ~10 |
| `result/route.ts` | Modify: PUT gate `isAdmin \|\| isCaptain`; forfeit untouched | ~15 |
| `features/leagues/MatchCard.tsx` | Modify: `(isLeagueOwner \|\| isParticipant) && played` → "Corregir resultado" | ~5 |
| `features/leagues/LeagueDetail.tsx` | Modify: pass `onCorrectResult` for participants | ~10 |

Tests: `lib/liveMatch.test.ts` (consent/begin/accumulation, **delete 6 D4 cases**), `lib/liveStore.test.ts`, `lib/liveHub.test.ts` (**delete 2 onClockExpired**), `lib/livePhase.test.ts` (Create, matrix), `live/route.test.ts` (403/404/409 + requestTurn + cooldown), `result/route.test.ts` (captain 403→200 flip, forfeit stays 403), `fixtures/[fixtureId]/route.test.ts` (DTO parity), `NegotiationPanel.test.tsx`, `MatchCard.test.tsx`, `MatchView.test.tsx`, `CreateLeagueModal.test.tsx` + `leagues/route.test.ts` (clock-option removed), `api.test.ts`. E2E (auth suite): `e2e/live-match.spec.ts` (two consents → begin → "Dar el turno"), `e2e/league-matchday.spec.ts` (rejornar), `e2e/match-report.spec.ts` + `e2e/full-league-flow.spec.ts:654` (captain correction 403→200).

## Slice Plan (4 chained PRs → main, deps 1→2→{3,4})

| Slice | Contents | Est. Δ | Budget |
|-------|----------|--------|--------|
| 1 Clock+lifecycle | migration, ready/consent/begin, unified clock, D4 sweep (5 sites), deprecation, DTO both serializers, MatchView, e2e begin | **~1100–1300** | **⚠ HIGH — ask-on-risk: recommend splitting into 1a (server core ~550: schema/pure/store/hub/route+unit tests) / 1b (client+deprecation+e2e ~400) or accept `size:exception`** |
| 2 Permissions+nudge | `lib/livePhase.ts`, side gate, own-casualty, turnStart/requestTurn, cooldown, UI | ~380–450 | Medium (fits) |
| 3 Rejornar | propose/accept locks, panel gate, tests + e2e | ~140 | Fits |
| 4 Correction | PUT gate, MatchCard, tests + e2e | ~105 | Fits |

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | consent/retract/begin guards, clock accumulation + recompute (restart), side matrix (all 6 matrix cells), nudge never-flips + cooldown, `deriveLiveClock` | Pure fns, zero mocks (`lib/liveMatch.test.ts`, `lib/livePhase.test.ts`) |
| Integration | POST route 401/403/404/409 per actor (coach/admin/spectator/foreign), ready→live only via begin, played-consent 409, DTO parity both serializers, pause/resume accumulation | Route tests with injected prisma/hub |
| Component | MatchView controls by `viewerSide` (consent panel, "Tu turno", "Pedir turno", "Dar el turno"), NegotiationPanel rejornar gate, MatchCard correction visibility | Vitest + Testing Library |
| E2E (auth suite) | live begin (2 consents → begin → "Dar el turno"), rejornar (propose/accept updates date), participant correction (captain 200) | Playwright, `AUTH_MODE=auth` + Postgres |

## Threat Matrix

| Boundary | Applicability | Design response | RED tests |
|----------|---------------|-----------------|-----------|
| Documentation-like paths | N/A — no file/executable classification | — | — |
| Git repository selection | N/A — no shell/VCS automation | — | — |
| Commit state | N/A — no shell/VCS automation | — | — |
| Push state | N/A — no shell/VCS automation | — | — |
| PR commands | N/A — no shell/VCS automation | — | — |

No shell/subprocess/VCS/executable-file boundary. The HTTP route permission surface (401/403/404/409) is covered by the integration tests above.

## Migration / Rollout

Additive `add_live_match_flow` (deploy-ahead: `prisma migrate deploy` before app). LiveMatch `homeClock`/`awayClock` stay as deprecated-unused columns (no drop → rollback = revert PRs 4→1). League clock columns remain, nothing reads them (spec "columns remain"). Single `next start` still required (in-memory hub). Revert PRs 4→1; no data backfill.

## Open Questions

- None blocking. Slice-1 split (1a/1b) or `size:exception` needs the orchestrator's delivery-strategy decision (ask-on-risk).
- `begin` coach-only under D14: confirm admin may not kick off a fully-consented match (recommended: no).
