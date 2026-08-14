# Exploration: live-match-events

> Change name: `live-match-events` · Status: exploration complete · Date: 2026-08-13
> Decision source: Design A (Tourplay-style chronological list) — `/var/folders/hz/fz3h02rs18q3gr_bhpdfcqpr0000gn/T/opencode/designs/01-lista-cronologica.html`
> Product decisions are user-approved and binding (see below); this doc maps them onto the current codebase and flags the deltas it forces.

## Product decisions (binding)

1. **Design A UI**: one row per important event — minute (`199'`), global turn tag (`T16` = half 2 → `turnNumber + 8`), dorsal (`#4`), player name + position, event icon, label, ★ stars. Side gradients (local navy / visitor red). No turn-pass rows.
2. **Only important events** become rows: `start`, `td`, `completion` (NEW), `casualty` (with band), `foul`, `endHalf`, `endMatch`, `mvp` (NEW). `turn`, `turnStart`, `requestTurn` are FILTERED OUT of the history feed (the nudge banner stays live-only).
3. **Stars = SPP** (BB2025): TD ★3, Completion ★1, Casualty ★2 (lasting band), MVP ★4. Badly Hurt → no star, label "Herida".
4. **Team stats** derived from events (per team): TD count, completions, casualties, fouls, ★ SPP total (hero mini-row / score-mini).
5. History already DB-persisted (`LiveEvent` + snapshot-first resume). This change EXTENDS the event model + builds the Design-A UI + derived stats.

## Current State

### Event model (`lib/liveMatch.ts`)
- `LiveEventKind` (line 24) is the TS union `"start" | "turn" | "td" | "casualty" | "foul" | "endHalf" | "endMatch" | "turnStart" | "requestTurn"`. **No `completion`, no `mvp`.**
- `LiveEventRecord` (line 49): `seq, kind, side, playerRosterId, half, turnNumber, payload, at`.
- `LiveMatchState` (line 60): adds `homeScore/awayScore`, `startedAt`, home/awayTurnMs, `activeSide`, `status`.
- Pure transitions: `beginMatch` (writes `start` + `turnStart`), `applyEndTurn`→`turnTransition` (writes `turn`/`endHalf`/`endMatch` + `turnStart`), `applyTD` (writes `td` + score bump, flips side, auto-finishes on half-2 turn 8), `applyRequestTurn`.
- **`recordCasualty` / `recordFoul` live in the route**, not `lib/liveMatch.ts` (route line 681-719). `recordCasualty` writes payload `{ band: cmd.band ?? null }` where `band` is the **coach-reported** D10 band, immutable once recorded (D10 comment).
- `toLiveViewState` (line 479) / `deriveLiveClock` (line 456) map state → subscriber DTO. **`events` are NOT in the view DTO** — they're `LiveMatchViewState` (no events); the route/snapshot add an `events` array separately.

### Persistence (`lib/liveStore.ts`)
- `persistAndPublish` (line ~129): optimistic seq bump (`@@unique([liveMatchId, seq])` P2002 → re-read), writes each `next.events[]` as `LiveEvent` rows, publishes via hub.
- `liveMatchRowToState` (line 85) rebuilds state; `applyTransition` (line 192) is the shared commit seam.

### DB schema (`prisma/schema.prisma`)
- `model LiveEvent` (line 144): **`kind String`** (plain TEXT — line 149), `side TeamSide?`, `playerRosterId String?`, `half Int`, `turnNumber Int`, `payload Json`, `createdAt`. `@@unique([liveMatchId, seq])`.
- **`LiveEvent.kind` is NOT a PG enum.** The only enums are `TeamSide`, `LiveMatchStatus`, `LeagueStatus`. So adding `completion`/`mvp` kinds needs **NO migration** — no `ALTER TYPE`.
- `model Player` (line 234): **NO jersey/number field.** Fields: `rosterPlayerId`, `name`, `positionalKey`, `pe`, `skills`, `injuries`, `alive`, `valueBonus`, etc.
- `Team.roster` is a JSON `PlayerEntry[]` (`features/teams/types.ts` line 47): `id, name, positionalKey, cost, ...` — **NO `number`/dorsal either.**

### DTO + SSE surface
- `app/api/leagues/[id]/fixtures/[fixtureId]/live/route.ts`:
  - `toEventDtos` (line 83) maps persisted rows → `LiveEventDto` (`seq/kind/side/playerRosterId/half/turnNumber/payload/at`).
  - GET SSE snapshot (line ~359) carries `events: toEventDtos(persistedEvents)`; gap replay by seq; event frames for fan-out.
  - POST control (line 470+): consent/retractConsent/begin lifecycle; then the side-aware gate (`resolveEventPermission`) for `endTurn|td|casualty|foul` (line 610-635); dispatches to `applyEndTurn`/`applyTD`/`recordCasualty`/`recordFoul`/`applyEndMatch`.
- `app/api/leagues/[id]/fixtures/[fixtureId]/route.ts`:
  - `serializeLive` (line 80) also serializes events into its `live` DTO (used by the fixture GET for the played timeline).
  - Fixture GET (line 148) includes `homeTeam.players` / `awayTeam.players` (line 179-212) with `rosterPlayerId, name, positionalKey, pe, ...` — so **names/positions ARE available** to `MatchView` for the Design-A rows, but `FinishedLiveTimeline` currently receives only `{live, names}`.

### Side permission matrix (`lib/livePhase.ts`)
- `EventKind = "td" | "foul" | "casualty" | "passTurn"` (line 21).
- `resolveEventPermission` (line 39): active coach → allow any; non-active → allow ONLY `casualty` to own victim; null side → deny.

### Labels / stats (`features/leagues/`)
- `liveEventLabels.ts`: `liveEventLabel` — `start`→"Inicio del partido", `turn`→"Fin de turno", `turnStart`→"Tu turno", `requestTurn`→"Te piden el turno", `td`→"Touchdown", `casualty`→"Baja · {band}", `foul`→"Falta", `endHalf`→"Fin de la mitad", `endMatch`→"Fin del partido".
- `matchSummary.ts`: `casualtyKindLabel` maps 5 injury bands (`bruise`→Magullado, `apaleado`→Apaleado, `grave`→Herida grave, `permanent`→Permanente, `dead`→Muerto).
- `MatchView.tsx`: `LiveEventFeed` (line 734, `<ol aria-label="Cronología del partido">`, row label + "Mitad N · Turno N"); `LiveTimelineTrack` (line 527, dot track); `FinishedLiveTimeline` (line 713); `LiveActiveMatch` (line 561).
- `api.ts`: `LiveMatchEventDto` (line 527), `LiveCommand` (line 539), `LiveMatchView` (line 479).
- `resultPrefill.ts`: `tdsByScorer` derives per-scorer TDs from `td` events for the result modal prefill (LM-9).
- `useLiveMatch.ts`: `upsertEvents` (seq dedup) accumulates the client timeline.

### Injury band / SPP terminology mismatch (IMPORTANT)
The task said the lasting band is "Miss Next Game / Niggling / Dead" and badly hurt → "Herida". But the **codebase's casualty band is the 5-value BB2025 `InjuryOutcomeKind`: `bruise | apaleado | grave | permanent | dead`** (payload `{ band }`, `lib/rules/injuries.ts` line 14). The Spanish labels are `Magullado | Apaleado | Herida grave | Permanente | Muerto`. So the SPP mapping must map these 5 bands to the user's intent:
- `bruise` (Magullado / badly hurt) → ★0, label "Herida".
- `apaleado` (Apaleado / miss next), `grave` (Herida grave), `permanent` (Permanente), `dead` (Muerto) → ★2, label "Baja".
This MUST be an explicit decision in proposal/spec — the design's prose vocabulary doesn't map 1:1 to the persisted band.

### Result route (`app/api/leagues/[id]/fixtures/[fixtureId]/result/route.ts`)
- POST (line 179) loads the fixture with `homeTeam`/`awayTeam` but **does NOT include the `liveMatch` relation** and the players select only `rosterPlayerId, valueBonus` (no names). To write `mvp` events it must add `include: { liveMatch: true }` (and optionally names) and resolve the grantee roster ids.
- `homeMvp = computeMvpGrantee(home.nominations, rollD6())` (line 272) — returns a `rosterPlayerId` string (per team), `awayMvp` likewise. Available to append `mvp` events.
- The e2e result-prefill flow (`e2e/live-match.spec.ts` line 344-358) opens the result modal on a finished-live fixture — the `mvp` write happens here on POST.

## Affected Areas

- `lib/liveMatch.ts` — extend `LiveEventKind` union (`completion`, `mvp`); add `applyCompletion` pure transition (★1, active-coach); possibly rename/abstract `recordCasualty`/`recordFoul` up from the route; minute/turn-tag + SPP derivation helpers.
- `lib/livePhase.ts` — add `"completion"` to `EventKind`; `resolveEventPermission` already allows any active-coach action (no matrix change needed — completion is active-coach-only, deny non-active automatically).
- `app/api/leagues/[id]/fixtures/[fixtureId]/live/route.ts` — add `completion` command dispatch; **filter server-side** `toEventDtos` to display-worthy kinds (`turn`/`turnStart`/`requestTurn` stay in DB for replay/audit but drop from snapshot/frame DTOs).
- `app/api/leagues/[id]/fixtures/[fixtureId]/result/route.ts` — `include: { liveMatch }`; append home+away `mvp` events to the fixture's LiveMatch on result POST (only when a LiveMatch row exists).
- `app/api/leagues/[id]/fixtures/[fixtureId]/route.ts` — `serializeLive` event list (already mirrors toEventDtos shape; apply same filter there for fixture-GET played timeline).
- `features/leagues/api.ts` — extend `LiveCommand` with `completion`; emit `mvp`; maybe add resolved row descriptor(s).
- `features/leagues/MatchView.tsx` — replace `LiveEventFeed` row rendering with the Design-A list (minute, tag, dorsal, name/position, icon, label, stars; side gradient); pass `homeTeam`/`awayTeam` rosters into `FinishedLiveTimeline`/`LiveActiveMatch` for name/position/dorsal; add hero mini-stats row; keep the live nudge banner (turnStart/requestTurn) live-only.
- `features/leagues/liveEventLabels.ts` — add `completion`→(label, ★1); `mvp`→(label, ★4); casualty band → SPP/label mapping (Herida vs Baja ★2).
- `features/leagues/resultPrefill.ts` — unaffected (mvp events don't feed result prefill; still fine).
- `lib/rules/pe.ts` — confirm `PE_MVP = 4`, `awardPeForActions` covers TD/comp/cas (★3/1/2) for the stars derivation (or a dedicated client mapping).

### Dorsal (jersey number) — DECISION
- **No number field exists** on `Player`, `PlayerEntry`, or the fixture-GET players select. Options:
  1. **Derive from roster array order (index+1)** — `Team.roster` JSON `PlayerEntry[]` is ordered (backfill iterates it, line 14-25). The players selected in the fixture GET are `players` relation ORDER (Prisma default is by row, not roster order). To derive a stable dorsal you must fetch `roster` (ordered) or add an explicit `number`.
  2. **Add a `number` field** to `PlayerEntry` (roster JSON) — matches BB2025 dorsal (permanent, coach-assigned), but touches team creation/roster JSON everywhere.
- **Recommendation: derive from roster order.** For the fixture GET, fetch each team's `roster` JSON and build `rosterPlayerId → index+1`; the Design-A rows resolve via that map. Flag as an explicit decision (dorsal may not reflect a true jersey number, but bloodbowl teams don't wear real numbers — index-based is rulebook-plausible). Cost: Low.

## Approaches

### Q1 — Event model extension
1. **Extend the TS union, no migration, one `casualty` kind** (recommended)
   - Add `"completion"` and `"mvp"` to `LiveEventKind`. Keep `casualty` as the sole casualty kind carrying the coach-reported `band` (immutable D10). Derive display label + SPP from the band client/server-side (`bruise`→★0 "Herida"; `apaleado|grave|permanent|dead`→★2 "Baja"). Add `applyCompletion` pure transition (★1 payload not needed — kind implies SPP; but a `payload.side`/`playerRosterId` already on the record). `mvp` is never a control command — only written by the result route; add a small store/route-side append.
   - Pros: no schema change; `casualty` stays the audit-consistent single kind; band→label/SPP is a pure mapping; replay/audit never loses the band.
   - Cons: the mapping (5 bands → 2 star buckets) diverges from the design prose vocabulary and needs explicit spec wording.
   - Effort: Low–Medium
2. **Add a `completion` DB enum value via ALTER TYPE**
   - N/A — `LiveEvent.kind` is `TEXT`, not an enum. This option is void. (Correcting the task's assumption.)

### Q2 — History feed (Design A UI)
1. **Server-side DTO filtering + client render** (recommended)
   - Filter `toEventDtos` (live route) and `serializeLive` (fixture route) to display-worthy kinds (`start|td|completion|casualty|foul|endHalf|endMatch|mvp`). `turn`/`turnStart`/`requestTurn` stay in DB (replay/audit) and in the live-only nudge flow, but never reach the Design-A list. Build pure helpers: `deriveMinute(at, startedAt)`, `turnTag(half, turnNumber)`, `eventSpp(kind, band)`, and a `deriveTeamStats(events, rosters)` pure fn.
   - Pros: snapshot/feed payload shrinks; schema stays the audit source; client renders display-only rows; the nudge banner keeps its live-only `turnStart`/`requestTurn` events.
   - Cons: the DELETE of turn rows changes the timeline contract — existing e2e (`Mitad N · Turno N`, timeline labels) and unit tests will need updating (behavior intentionally changes).
   - Effort: Medium
2. **Client-side filtering only**
   - Keep all kinds in the DTO; filter in the renderer.
   - Pros: faster to ship, no DTO contract change.
   - Cons: bloats the snapshot; the live SSE frames still carry turn noise; a pure-fn test surface overlaps. Not recommended over server-side.

### Q3 — Completion permission
- `resolveEventPermission` returns `allow` for any active-coach `kind` already. Add `"completion"` to `EventKind` and to the route's gated set (`endTurn|td|casualty|foul|completion`, route line 610). Command shape `{ type: "completion"; side; playerRosterId }`. Non-active coach → 409 (auto-deny, since completion has no own-victim exception). **No matrix logic change needed**; purely wiring in the route + union.

### Q4 — MVP write on result load
- In result POST, add `include: { liveMatch: { include: { events: { orderBy: { seq: "desc" }, take: 1 } } } }` (need current seq) to the fixture query. After the transaction computes `homeMvp`/`awayMvp` (rosterPlayerId strings), if `fixture.liveMatch` exists, append two `LiveEvent` rows (home + away, kind `mvp`, no side-scoped `side` — set `side` to each team, `half`/`turnNumber` from the last event or the finished state, payload `{}`, `at: now`). Guard: only when a LiveMatch row exists (a fixture can be result-loaded without ever being live — walkover/e2e). Risk: the existing `@@unique([liveMatchId, seq])` requires the next seq; fetch `max(seq)`.

### Q5 — Testing / e2e impact
- **Breaks (behavior intentionally changes):**
  - `features/leagues/MatchView.test.tsx` — finished-timeline labels (`"Baja · Herida grave"`, `"Finish del partido"`, turn-row text); live feed `/Mitad N · Turno N/` text.
  - `features/leagues/liveEventLabels.test.ts` — `"Fin de turno"` for `turn`, `turnStart`/`requestTurn` labels (moved to live-only), casualty label now "Herida"/"Baja ★2".
  - `app/api/leagues/[id]/fixtures/[fixtureId]/live/route.test.ts` — snapshot frame asserts `"kind":"requestTurn"` (line 300) will need moving to a "not-in-feed" assertion if server-side filtering is adopted.
  - `e2e/live-match.spec.ts` — `Mitad N · Turno N` asserts (lines 279-332); result-prefill flow unaffected by mvp (mvp write is after, in POST).
- **New tests:** derived stats pure fn (`deriveTeamStats`), minute/turn-tag derivation, `resolveEventPermission` with `completion`, band→label/SPP mapping (5 bands → Herida/Baja ★2), `mvp` event write on result POST (home+away grantee, seq bump), Design-A row render (minute/tag/dorsal/name/position/icon/label/stars + side gradient).
- Note: `matched live e2e` must still pre-fill result; adding `mvp` events post-load must not reorder the prefill test's TD assertions.

### Q6 — Scope / slice guidance
1. **Slice 1 — event model (server)**: extend `LiveEventKind` (+`completion`/`mvp`), add `applyCompletion`, add `completion` route command + permission wiring, add `mvp` write on result POST. Tests: liveMatch, livePhase, result-route.
2. **Slice 2 — DTO/filtering/derivations**: server-side filtering in `toEventDtos` + `serializeLive`; pure helpers `deriveMinute`/`turnTag`/`eventSpp`/`deriveTeamStats`; extend `LiveCommand`/`LiveMatchEventDto` for `completion`/`mvp`; fixture GET exposes roster order (dorsal map). Tests: pure-fn suites, route filters.
3. **Slice 3 — Design-A UI**: replace `LiveEventFeed` with the Design-A list (row fields + side gradient, stars, dorsal/name/position via rosters), hero mini-stats row, finished timeline + nudge-only live banner. Tests: MatchView component.
4. **Slice 4 — e2e + regression**: update `live-match.spec.ts` + unit assertions to the new feed (turn rows gone, new labels), add e2e for completion + a Design-A row; run full suite.
Each slice <400 changed lines and chains to main.

## Recommendation
Pursue Approach 1 (extend TS union, no migration, single `casualty` kind + band-derived label/SPP), server-side DTO filtering, `completion` as an active-coach-only command via the existing `resolveEventPermission` matrix (just adding it to `EventKind`), `mvp` written by the result route (only when a LiveMatch exists), and the 4-slice chained split above. Derive the dorsal from roster order (no schema field) and treat the 5-band→SPP mapping as an explicit spec decision.

## Risks
- **WARNING — band vocabulary divergence**: the bound product decision's "Miss Next Game / Niggling / Dead → ★2, Badly Hurt → Herida" does not map 1:1 to the persisted `bruise|apaleado|grave|permanent|dead` band. Must be resolved in proposal/spec (recommend: `bruise`→★0 "Herida"; `apaleado|grave|permanent|dead`→★2 "Baja").
- **WARNING — e2e + unit breakage**: the turn-row removal and Design-A label changes intentionally break `MatchView.test.tsx`, `liveEventLabels.test.ts`, `live/route.test.ts`, and `e2e/live-match.spec.ts` turn/label asserts. Budget for updating them in the right slices.
- **WARNING — mvp write seq race**: appending `mvp` events to a finished LiveMatch must bump `seq` consistently (`@@unique([liveMatchId, seq])`); a concurrent read just before the write must not create a seq collision. Guard by reading `max(seq)` inside the transaction.
- **SUGGESTION — dorsal is pseudo**: index-derived dorsals aren't player-fixed; if a real jersey number is ever wanted, add a `number` to `PlayerEntry` later. Confirm the user accepts index-based for this iteration.
- **SUGGESTION — `mvc`/`mvp` is result-only**: it is NOT a live control command; keep it out of `resolveEventPermission`/`LiveCommand` to avoid an illegal write path.

## Ready for Proposal
Yes. The orchestrator should tell the user: the event model is a pure TS-union extension (no DB migration — `LiveEvent.kind` is TEXT), the Design-A UI replace `LiveEventFeed`, completion slots into the existing side matrix automatically, mvp is written by the result route when a LiveMatch exists, and the 4-slice chained split holds each PR <400 lines. Flag the band-vocabulary mapping for explicit confirmation in proposal.
