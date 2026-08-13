# Exploration: live-match-flow — Realtime Live-Match Product Refinement

## Summary

Product-driven refinement of the just-shipped `live-match-realtime` (PRs #61–#67).
Adds a double-consent "ready" start phase, replaces the per-turn league clock with a
unified match clock + per-coach accumulated time, enforces turn-phase event asymmetry,
adds turn-start + nudge notifications, reopens negotiation (rejornar) for any scheduled
fixture before play, and widens post-match correction to the participant coaches.
Multiple SDD-visible deltas: a new `ready` status, a clock-model rewrite, richer
`LiveCommand`/`LiveEventKind`, and a permission broadening. Likely 4 chained PR slices
(clock+lifecycle / turn-phase perm+nudge / rejornar / correction).

## Current State

### 1. Lifecycle & start
- `LiveMatchStatus = "pending" | "live" | "finished"` (`lib/liveMatch.ts:20`, Prisma enum).
- Single-command start: `POST .../live {type:"start"}` → `startLiveMatch` (`lib/liveStore.ts:247`)
  runs `startMatch` (`lib/liveMatch.ts:116`) which immediately sets `status: "live"` +
  starts home's clock. `canStart` requires a `scheduled`, not-played, no-result fixture
  (LM-3). Double start / played fixture → 409 (P2002 or `cannot start`).
- The control gate (route POST, `live/route.ts:412`) requires the caller be home/away
  owner or league admin (403 spectator / 404 foreign). `resolveLiveAccess` (`lib/liveAccess.ts`)
  handles the read/control open-vs-started matrix.
- There is NO "ready" or consent concept today (`ready`/`consent` absent across `lib/`).
- `LiveMatch` row fields: `status, half, turnNumber, activeSide, homeClock, awayClock,
  homeScore, awayScore, seq, paused, clockStartedAt, finishedAt`.

**Ripple (start):** `LiveMatchStatus` enum (Prisma + TS) + DTO + snapshot; `startMatch`
split into "consent" vs "begin"; `startLiveMatch`; the POST `start` handler; `canStart`.

### 2. Clock model (per-turn → unified + per-side)
- League option `League.turnClockEnabled`/`turnClockSeconds` (default true@240, immutable,
  AC-10; `prisma/schema.prisma:45-46`, creation API `app/api/leagues/route.ts:98-109`).
- `LiveMatch` clocks: `homeClock`/`awayClock` (per-turn remaining, reset at each turn start),
  `paused`, `clockStartedAt`. `toLiveViewState` (`lib/liveMatch.ts:335`) recomputes the ACTIVE
  clock as `persistedClock - (now - clockStartedAt)`.
- Hub ticker (`lib/liveHub.ts:146`) decrements the active clock 1s; D4 `autoEndTurnOnClockZero`
  (`lib/liveMatch.ts:264`) auto-ends the turn at 0. `onClockExpired` wiring in
  `live/route.ts:218`.
- Disconnect grace (LM-7/D6): 10s timer in the hub keyed on the active coach; `pauseLiveMatch`/
  `resumeLiveMatch` (`lib/liveStore.ts:189,214`) null out / reset `clockStartedAt`.
- DTO carries `homeClock`/`awayClock`/`paused` (null when option off), `turnClockEnabled`.

**Ripple for unified clock + per-side accumulated time:**
- `LiveMatch` adds `startedAt` (unified clock epoch) and `homeTurnMs`/`awayTurnMs`
  (accumulators) OR a single `clockStartedAt` reinterpreted + per-side `homeTurnMs`/
  `awayTurnMs`. The active side's accumulated time must be **server-derived** from persisted
  timestamps (LM-5 restart-recompute pattern): on a turn flip, the flipper's accumulator is
  bumped by `(now - turnStartedAt)` and `turnStartedAt` restarts for the new active side.
- The hub ticker no longer decrements a remaining clock; it must **accumulate** the active
  side's ms and publish `homeTurnMs`/`awayTurnMs` + unified elapsed. `TickSnapshot` shape
  changes (needs `homeTurnMs`/`awayTurnMs`, `startedAt`, activeSide).
- `autoEndTurnOnClockZero` (D4) becomes **obsolete/non-sensical** under the unified clock
  (no per-turn limit) → removed or repurposed; its ticker stop-gap and `onClockExpired` seam
  in `live/route.ts:218` die.
- **Design decision (flagged):** disconnect grace semantics. Recommend: keep the existing
  10s grace pause but have it PAUSE THE UNIFIED CLOCK (persist `startedAt` freeze via the
  `paused` flag, consistent with the LM-5 pattern; `clockStartedAt`-equivalents just stop
  accumulating while paused). No per-turn limit.
- League option handling: **recommend deprecate-not-remove** — keep the columns in the schema
  (avoid a destructive migration), remove the toggle/select from `CreateLeagueModal.tsx`
  (and its `CLOCK_DURATIONS`/state + tests), drop the fields from the `POST /api/leagues`
  creation body/validation, and remove `turnClockEnabled`/nullable-clocks logic from
  `MatchView.tsx` + the live DTO. `liveMatchRowToState`/`serializeLive` stop reading them.
- `MatchView.tsx` per-turn clock UI (FormatClock, the two-column clock grid, `Dar el turno`
  clock header) is replaced by a unified elapsed timer + two per-coach accumulated time reads
  ("1:41:58 / 1:24:54" mockup).

### 3. Turn-phase event permissions
- Events validated in `lib/liveMatch.ts` pure transitions: `applyEndTurn` (`cmd.side !==
  activeSide` → out-of-turn), `applyTD`, `applyEndMatch`; `recordCasualty`/`recordFoul` in
  `live/route.ts:527,548` append events WITHOUT an out-of-turn guard (any coach/admin can
  record any casualty/foul today).
- The POST route (`live/route.ts:430-436`) gates only at the coach/admin level; it does NOT
  check the caller's SIDE vs `current.activeSide`.
- `LiveEvent.kind` = `start|turn|td|casualty|foul|endHalf|endMatch`. `side` + `playerRosterId`
  identify target/owner.

**Ripple for asymmetry:** the route has `ctx.homeOwnerId`/`ctx.awayOwnerId` + `userId` already;
the caller's side = `userId === homeOwnerId ? "home" : "away"`. Add a side-aware guard before
`applyTransition`/`recordCasualty`: the ACTIVE coach may record TDs/fouls/casualties/pass-turn;
the NON-ACTIVE coach may ONLY record a casualty to their OWN players (side = their own side).
Roles invert on pass. This belongs in a new pure decision (mirroring `liveAccess`) + a route
check, keeping `lib/liveMatch.ts` transitions free of per-user state.

### 4. Rejornar (re-open negotiation before play)
- Propose route `app/.../propose/route.ts` requires fixture `status === "started"` (league)
  + participant; returns 409 when `scheduledAt != null || winnerId != null` (line 70).
- Accept route `app/.../accept/route.ts` returns 409 when already scheduled/played (lines
  49, 87).
- `NegotiationPanel.tsx:60`: `negotiationOpen = isParticipant && fixture.status === "pending"`.
- Forfeit route clears open proposals and `scheduledAt`.

**Ripple for rejornar:** the scheduled-409 locks must be relaxed: propose/accept must allow
re-negotiation for a `scheduled` (scheduledAt set, not played) fixture; still-block on
`played`/result. Accept updates `scheduledAt` to the new proposal date. Proposal lifecycle:
counter-propose closes the previous active proposal (already handled). Re-negotiation must
NOT clear scoreboard/result (forward-only; these are pre-play). NegotiationPanel gate widens to
`status === "pending" || status === "scheduled"` (still `!== "played"`). LeagueDetail passes
the panel for scheduled fixtures too. MatchCard footer "Programado" stays; the card's
negotiation affordance (card click) already exists. The "started" league gate in both routes
stays (a prereq for any fixture negotiation).

### 5. Turn notification + nudge
- SSE frames: `snapshot` (no id) → `state`/`event` (id:`<seq>`) → `heartbeat` (no id)
  (`live/route.ts:299-358`). `useLiveMatch` (`features/leagues/useLiveMatch.ts`) applies
  `snapshot`/`state`; ignores `event` kinds beyond state.
- `LiveEventKind` is the notification seam. Two new kinds: `turnStart` (notify the other
  coach a turn began) and `requestTurn` (nudge) — each a `LiveEvent` row + label in
  `liveEventLabels.ts`. The turn-start notice can be driven off the existing `turn` event,
  but the product asks for an EXPLICIT turn-start notification, so add a `turnStart` event (or
  a `notify`-subtype state frame).
- Nudge: a new `{type:"requestTurn"}` command (non-active coach → active coach). It must NOT
  flip the turn; it persists a `requestTurn` event and the hub publishes the state so the
  active coach's UI shows "te piden el turno". Server-owned; stored like any transition.
- MatchView UX: a "Tu turno" notice rendered when the viewer is the active coach (already
  derivable from `activeSide` + viewer's side, once the DTO exposes the viewer's side), and a
  "Pedir turno" button for the non-active coach.

### 6. Post-match correction permissions
- PUT `app/.../result/route.ts:367` is **admin-only**: captains rejected 403, foreign 404.
- `MatchCard.tsx:112` shows `Corregir resultado` only `isLeagueOwner && fixture.status==="played"`.
- `match-result.spec.ts` / `ResultModal.test.tsx` encode the admin-only assumption (captain →
  403).

**Ripple:** PUT must allow league admin + the TWO participant coaches; keep forfeit
(award-walkover) admin-only. MatchCard adds `isParticipant && status==="played"` to the
`Corregir resultado` visibility (union). ResultModal correction mode already generic
(`mode: "correct"`).

### 7. Migration + testing impact
- Prisma: additive `add_live_match_flow` — `LiveMatch` gains the ready/consent fields +
  unified-clock fields (`startedAt`, `homeTurnMs`, `awayTurnMs`, or `clockStartedAt`
  reinterpretation). `LiveMatchStatus` enum gains `ready`. League clock columns are kept
  (deprecated, not removed). Deploy-ahead safe (entrypoint runs `prisma migrate deploy`).
- Tests broken/rewritten:
  - `lib/liveMatch.test.ts` — `startMatch`/`canStart` (now two-phase), D4
    `autoEndTurnOnClockZero` suite becomes obsolete, clock recompute tests rewritten to
    unified + per-side accumulation.
  - `lib/liveStore.test.ts` — `startLiveMatch` (ready phase), pause/resume repurposed,
    new field writes.
  - `lib/liveHub.test.ts` — ticker now accumulates (no decrement), D4 `onClockExpired`
    seam removed.
  - `live/route.test.ts` — POST start now two-phase; `casualty`/`foul` out-of-turn 409s
    added; new commands `requestTurn`; ready/begin command cases.
  - `app/api/leagues/route.test.ts` + `CreateLeagueModal.test.tsx` — turn-clock option tests
    removed/rewritten (option deprecated).
  - `MatchView.test.tsx` — clock UI rewrite, "Tu turno"/"Pedir turno", "Dar el turno" stays
    but as begin-or-pass actor.
  - `api.test.ts` — new `LiveCommand` members + DTO fields.
  - `NegotiationPanel.test.tsx` — scheduled-stage negotiation gate.
  - `result/route.test.ts` — PUT correction: captain 403 → 200.
  - `e2e/live-match.spec.ts` — the e2e currently `start`s via API then expects `Dar el turno`
    visible directly; under double-consent it must give both coaches' consent then begin.
  - `e2e/league-matchday.spec.ts` — rejornar scenarios (re-negotiate a scheduled fixture).
  - `e2e/match-report.spec.ts` — correction by a participant coach.
- Deploy: single `next start` still required (in-memory hub, LM-1).

### 8. Scope / slice split (validation)
The ripple clusters into four independent slices (all < 400 changed lines, stacked to main):

1. **Clock replacement + lifecycle ready/consent** — new `ready` status + consent commands,
   unified `startedAt` + per-side `homeTurnMs`/`awayTurnMs`, hub ticker rewrite, D4 removal,
   league-option deprecation (schema columns kept, removed from creation UI/API + live UI),
   MatchView clock rewrite. Biggest slice; own migration.
2. **Turn-phase permissions + nudge + notifications** — side-aware control guard (active vs
   non-active), `casualty-own-team` exception, `requestTurn` command + `turnStart`/`requestTurn`
   events + labels, MatchView notice/button, `useLiveMatch` handles new frames/fields.
3. **Rejornar** — relax propose/accept scheduled locks (still block played), accept updates
   `scheduledAt`, NegotiationPanel + MatchCard + LeagueDetail gates, lifecycle tests + e2e.
4. **Post-match permissions + UI + e2e** — PUT correction widens to participant coaches,
   MatchCard visibility, ResultModal wiring, e2e.

This split is validated against the ripple: slice 1 owns the clock-field/schema churn and the
`ready` transition; slice 2 layers on the permission/notification surface that consumes the
new DTO (no prismatic independence from slice 1, so it lands after); slice 3 is orthogonal
(negotiation routes, no live dependency); slice 4 is the smallest permission/UI delta.
Dependencies: 1→2 (permissions+notifications need the ready/live DTO), 3 and 4 parallelizable
after 1.

## Affected Areas

- `prisma/schema.prisma` — `LiveMatch` + `ready`/consent + unified-clock fields; `League`
  clock columns deprecated-but-kept (or new migration for removal); `LiveMatchStatus` + `ready`.
- `prisma/migrations/<ts>_add_live_match_flow/migration.sql` — new additive migration.
- `lib/liveMatch.ts` — `LiveMatchStatus`, `startMatch` split (consent/begin), unified-clock
  state fields, `autoEndTurnOnClockZero` removal, `LiveMatchViewState` additions.
- `lib/liveStore.ts` — `startLiveMatch`, pause/resume repurposed to unified clock, ready
  persistence, new field writes.
- `lib/liveHub.ts` — ticker accumulates the active side's `homeTurnMs`/`awayTurnMs`, grace
  pauses the unified clock, `TickSnapshot` rewrite; D4 `onClockExpired` seam removed.
- `app/api/leagues/[id]/fixtures/[fixtureId]/live/route.ts` — POST start two-phase,
  side-aware permission guard, new `requestTurn` command, `recordCasualty`/`recordFoul`
  permission tightening, ticker/grace wiring under unified clock.
- `app/api/leagues/[id]/fixtures/[fixtureId]/route.ts` — `serializeLive` DTO additions
  (ready, homeTurnMs/awayTurnMs, startedAt, viewer-side), drop nullable clocks.
- `features/leagues/api.ts` — `LiveCommand` (+requestTurn, maybe ready), `LiveMatchViewState`
  additions, `LiveMatchEventDto` new kinds.
- `features/leagues/useLiveMatch.ts` — handle new frames/DTO fields, viewer-side derivation.
- `features/leagues/MatchView.tsx` — clock UI rewrite, "Tu turno"/"Pedir turno",
  ready-consent controls.
- `features/leagues/liveEventLabels.ts` — `turnStart`/`requestTurn` labels.
- `features/leagues/CreateLeagueModal.tsx` + `app/api/leagues/route.ts` — remove
  turn-clock option (deprecation).
- `app/api/leagues/[id]/fixtures/[fixtureId]/propose/route.ts` + `accept/route.ts` — relax
  409 scheduled lock, re-negotiation lifecycle, accept updates `scheduledAt`.
- `features/leagues/NegotiationPanel.tsx` + `LeagueDetail.tsx` — rejornar gate + wiring.
- `features/leagues/MatchCard.tsx` — `Corregir resultado` union (participant), forfeit
  stays admin-only, "Programado" footer stays.
- `app/api/leagues/[id]/fixtures/[fixtureId]/result/route.ts` — PUT correction widens to
  participant coaches (always keep forfeit/admin-only).
- Tests: many — see §7. e2e: `live-match.spec.ts`, `league-matchday.spec.ts`, `match-report.spec.ts`.

## Approaches

1. **Unified clock + per-side accumulation (recommended)** — replace per-turn clocks with
   `startedAt` + `homeTurnMs`/`awayTurnMs`; the ticker accumulates the active side; recompute
   from persisted timestamps (LM-5 pattern). Deprecate the league clock option (keep columns).
   - Pros: matches the mockup ("1:41:58 / 1:24:54"); removes D4 complexity; simplest
     rulebook-faithful model; additive migration.
   - Cons: larger DTO/state churn; per-turn UI + tests rewritten; grace semantics need a
     decision (pause the unified clock).
   - Effort: High.

2. **Keep the per-turn clock, layer unified on top** — retain `homeClock`/`awayClock` plus
   add unified accumulators.
   - Pros: smaller immediate rewrite risk.
   - Cons: two clock models fight; D4 still present but wrong for the product; more state to
     keep consistent — NOT recommended.
   - Effort: Medium (but conceptually wrong).

3. **League option full removal migration** — drop `turnClockEnabled`/`turnClockSeconds`
   columns.
   - Pros: clean schema; no dead config.
   - Cons: destructive migration (rollback/compat risk against the archived `live-match-realtime`
     and older images in production). Violates additive-migration preference.
   - Effort: Low (schema) but High (deploy risk). **Recommend deprecate, not remove.**

## Recommendation

Adopt approach 1 (unified clock + per-side accumulation) with the league option **deprecated
not removed** (keep columns; strip them from creation UI/API + live DTO/UI). Add `ready` to
`LiveMatchStatus` and model double-consent as two persisted booleans (or a consent-set side)
on the LiveMatch row plus a `{type:"ready"}` / new begin command. Gate turn-phase permissions
in the route against the caller's side. Add `turnStart` + `requestTurn` as new `LiveEventKind`s
and new `LiveCommand` members. Reopen negotiation for scheduled-but-not-played fixtures by
relaxing the propose/accept 409 locks and widening the NegotiationPanel gate. Widen PUT
correction to admin + participant coaches (forfeit stays admin-only). Keep the grace = pause
UNIFIED clock decision as a flagged design decision (default: pause). Slice into the four PRs
validated above.

## Risks

- **CRITICAL:** e2e `live-match.spec.ts` drives start via API and expects "Dar el turno" right
  after start — double-consent breaks it; the e2e must add both coaches' consent + a begin
  step or the start assertion must change. Plan the e2e rewrite in slices 1–2.
- **WARNING:** D4 `autoEndTurnOnClockZero` + its ticker seam are scattered (liveMatch,
  liveHub `onClockExpired`, live/route `onClockExpired` restart, liveStore, multiple unit
  tests) — removal must sweep all five or a dead seam lingers and the ticker misbehaves.
- **WARNING:** the fixture detail route (`serializeLive`) duplicates the live DTO shape
  independently of `lib/liveMatch` `toLiveViewState` — new DTO fields (ready/consent/
  turnMs/viewer-side) must be added in BOTH serializers or MatchView and the GET snapshot
  diverge.
- **WARNING:** the PUT-correction widening must NOT touch the POST/forfeit admin-only gate;
  match-report e2e + ResultModal tests assert captain-forbidden → these must be updated to
  captain-allowed for correct, while forfeit stays 403 for non-admin.
- **SUGGESTION:** the 10s disconnect-grace under a unified clock is a genuine product decision
  (pause elapsed time vs keep counting). Recommend pausing the unified clock via the persisted
  `paused` flag (LM-5 pattern), matching the existing grace behavior.
- **SUGGESTION:** rejornar is gated on the league being `started`; ensure a scheduled fixture
  whose league is still `started` (normal case) can re-negotiate, but a played/result fixture
  stays locked with 409 (no double-result drift).

## Ready for Proposal

Yes. The user-approved semantics are authoritative and the ripple is fully mapped. The
orchestrator should move to `sdd-propose` with these decisions to lock in: (a) unified clock
+ per-side `homeTurnMs`/`awayTurnMs`, (b) league clock option deprecated-not-removed,
(c) double-consent modeled as two persisted consent booleans on the LiveMatch row,
(d) grace pauses the unified clock, (e) four-slice chained-PR split.
