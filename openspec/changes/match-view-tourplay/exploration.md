# Exploration: match-view-tourplay

Redesign the match/fixture view toward a Tourplay style. Design target = `previews/enfrentamiento-tourplay.html` (original) + `previews/enfrentamiento-derivado.html` (derived v7, current direction). This exploration maps the existing match-view implementation, the live-match data model, the exact data gaps against the target design, and the test/system constraints that a proposal must satisfy.

## Current State

### MatchView anatomy (`features/leagues/MatchView.tsx`)
- Single client page rendered by `app/leagues/[id]/fixtures/[fixtureId]/page.tsx`. Renders from `getMatchDetail` (fixture + `MatchResult` snapshot + both rosters + the shared `LiveMatchView` DTO).
- `MatchView` dispatches by state:
  - `detail.live` present + `status === "finished"` → `FinishedLiveView` (TourplayHeader + `FinishedLiveTimeline` → `LiveEventsList`).
  - `detail.live` present or fixture scheduled → `LiveActiveMatch` (TourplayHeader + consent/live panel + `EventControls` FAB).
  - `pending` → `PendingFixtureView` (header + notice).
  - no LiveMatch and played → `PlayedSections` (renders `buildMatchSummary` snapshot sections).
- `TourplayHeader` (sticky, z-40) = `LiveTopBar` (nav bar: league·round label + back, per-side clocks) + `TurnTrack` (global T1–T16 pills, active highlighted) + `LiveHero` (1fr auto 1fr: two `LiveTeamBlock`s + `LiveScoreboard` `data-testid=live-score`; mini pills `mini-td-*`/`mini-spp-*`) + `LiveMetaRow` (Clima · Estándar / Estadio · Reglamentario). **There is NO timeline bar today** — the derived preview's horizontal JSON timeline in the sticky header does not exist.
- `LiveEventsList` renders a flat `<ol aria-label="Cronología del partido">` of `<li data-testid="live-event-row">`, newest-first, one row per display event: minute (`deriveMinute`), global turn tag (`turnTag`), dorsal (`playerRef` map), player name/position resolved from rosters, inline glyph (`EVENT_GLYPH` + casualty band glyph 🏥/⚰️), `liveEventLabel`, ★SPP. Side gradient navy/red + visitor row reflection (`flex-row-reverse`).
- `EventControls` (FAB "+", `liveControls.tsx`) — mini-form with player select + casualty band select; submits `LiveCommand`. Active coach: td/completion/casualty/foul; non-active: casualty only (own player).

### Data types
- `LiveCommand` (`api.ts`): `td/completion` carry `playerRosterId`; `casualty` carries `victimRosterId + band?`; `foul` carries `playerRosterId` (the aggressor) + **optional unknown `victimRosterId`**; plus consent/begin/endTurn/requestTurn/endMatch.
- `LiveMatchEventDto` / `LiveEventRecord`: `{ seq, kind, side, playerRosterId, half, turnNumber, payload, at }`. `LiveEventKind`: start|turn|td|completion|casualty|foul|endHalf|endMatch|turnStart|requestTurn|mvp. Feed DTOs filter to display kinds only via `isDisplayEvent` (`start|td|completion|casualty|foul|endHalf|endMatch|mvp`), LM-16.
- Server persistence: `app/api/.../live/route.ts` → `recordCasualty`/`recordFoul`/`applyTD`/`applyCompletion`/transitions append to `state.events`, persisted by `lib/liveStore.ts` (`LiveEvent` rows with JSON payload). `casualty` payload = `{ band }`; `foul` payload = `{}`; `td`/`completion` payload = `{}`/`{ spp: 1 }`; `mvp` written only by the result route.
- Derived helpers: `lib/liveFeed.ts` (`deriveMinute`, `turnTag`, `playerRef`, `deriveTeamStats`), `liveEventLabels.ts` (`bandToDisplay`, `eventSpp`, `liveEventLabel`).

## DATA GAPS vs the derived Tourplay design

1. **Foul → victim not persisted.** `foul` command accepts `victimRosterId?` but `recordFoul` drops it into `payload: {}`; the `playerRosterId` column is the AGGRESSOR. The design row "a #8 Trash (victim)" has no data source. → must capture `victimRosterId` in `EventControls` AND persist it in the foul payload.
2. **Casualty has no cause/causer.** `recordCasualty` persists only `{ band }`. The derived design's three actors — victim (row), causer ("por #4 Arnau" or "El público"), and cause (`blitz|foul|dodge|crowd|penetration|block`) — are absent. → add `cause` + `causerRosterId` fields to the casualty command + payload (design note already proposes `cause` + `causerRosterId`).
3. **No kickoff events in the live feed.** No error-costoso ("Crisis evitada: -0 gp."), no fan-factor pre-match roll, no weather dice roll, no inducements rows. `LiveEventKind` has no such kinds; `isDisplayEvent` doesn't include them.
4. **No post-match summary rows in the finished feed.** "Partido reportado" (success), fanáticos dedicados, ganancias (winnings), incentivos, and MVP-as-row exist only via `PlayedSections`/`buildMatchSummary` from the `MatchResult` snapshot (only when there is NO LiveMatch). For a finished LIVE match the feed renders only `LiveEventsList` rows. The design wants these as feed/card rows ("Partido reportado" green success card, MVP ★4 rows already exist as events, winnings/fans from snapshot).
   - MVP **is** already a live event (result route appends home+away `mvp`, LM "MVP Event Write").
   - Winnings/fans/incentives/expensive-mistake live only in `MatchScoreboard` (`postFf`, `winnings`, `pettyCash`, `mw`? no — `pettyCash` on `MatchResultRecord`), NOT in the live feed.
5. **Partial score per TD.** Currently derived from `state.homeScore/awayScore` (cumulative), and the design shows per-TD score "(1 - 0)" on TD rows. Derivable by accumulating TD events per side (`deriveTeamStats` already counts `tds` per side; a running per-team TD→score map over the sorted feed reproduces the design's per-TD score note).
6. **Timeline bar in the sticky header.** The design's horizontal timeline with icons at `%=minute/duration` needs the same feed events (percentage positioning possible via `at - startedAt` / elapsed). No such component exists today.

## Test Constraints (strings/data-testids asserted)

### Unit (`features/leagues/`)
- **MatchView.test.tsx**: `tourplay-header`, `live-score`, `live-event-row`, `mini-td-home`, `mini-td-away`, `mini-spp-home`; texts `1ª PARTE`, `2ª PARTE`, `Mitad 1 · Turno 1`, `Mitad 1 · Turno 3`, `Mitad 2 · Turno 8`, `Mitad 2 · Turno 5`; buttons `Dar el turno`, `Pedir turno`; status `Tu turno`; event labels `Baja`, `Herida grave`, `Inicio del partido`, `Fin del partido`, `Pase completo`; `live-score` regex `/-\s*:\s*-/` and `/1\s*:\s*0/`, `/2\s*:\s*1/`. No `tourplay-header` when no LiveMatch; no turn controls for spectator/inactive.
- **liveControls.test.tsx**: menu buttons `Touchdown`, `Pase completo`, `Baja`, `Herida`, `Falta`; non-active offers only `Herida`; labels `Jugador`, `Tipo de lesión`, `Registrar`, `Cancelar`.
- **liveEventLabels.test.ts**: exact map — start "Inicio del partido", turn "Fin de turno", td "Touchdown", completion "Pase completo", mvp "Jugador más valioso", foul "Falta", endHalf "Fin de la mitad", endMatch "Fin del partido", turnStart "Tu turno", requestTurn "Te piden el turno", casualty bruise→"Herida" / lasting→"Baja"; SPP td 3 / completion 1 / mvp 4 / lasting cas 2 / bruise 0 / foul 0.
- **liveFeed.test.ts / deriveTeamStats**: per-team td/completion/casualty/foul/★ counts.
- **useLiveClock.test.ts / useLiveMatch.test.tsx**: clock derivations + SSE merge (no DOM string deps).

### e2e (`e2e/live-match.spec.ts`, auth suite)
- Buttons `Iniciar partido`, `Empezar partido`, `Dar el turno`, `Pedir turno`, `Registrar`; labels `Jugador`, `Tipo de lesión`, `Herida grave`; status `Tu turno`; text `Tu rival pide el turno`; `Mitad 1 · Turno N`; `live-event-row` filtered by scorer name / `★3` / `★4`; `live-score` regex `/0\s*:\s*1/`; after reload `Inicio del partido`, `Pase completo`, `★3` visible and `Fin de turno` absent (LM-16 no turn rows in feed); `Jugador más valioso` + `★4` x2 for home+away mvp.
- Design-system: `MV-7`/`LM-10` — only rulebook-light tokens (navy `#12225a`, red `#d11938`, bg `#f8fafc`, white panels), Spanish league copy, NO icon library (inline glyphs), no new deps. The derived preview uses Material inline SVG icons — the app must keep inline TEXT glyphs or inline SVG, NOT a library.

## Approaches

1. **Model-first (recommended)** — close the data gaps in the server (foul victim, casualty cause/causer, new kickoff/summary event kinds) and the `LiveCommand`/`EventControls` capture, then refactor `LiveEventsList` into Tourplay cards + add the timeline bar and post-match summary rows to the finished feed.
   - Pros: persistent, survives reload/new-device (LM-8/LM-17), renders identically for live and finished; matches the "events are the source of truth" architecture.
   - Cons: touches the live route + store + command union + EventControls + several unit/e2e tests.
   - Effort: High (multiple slices).

2. **View-only from existing data** — redesign the cards/timeline using only today's events + the existing result snapshot, and only add the FAB capture for foul victim (a minimal command/payload bump). Post-match summary rows rendered from the snapshot (not as feed events).
   - Pros: smallest change; no new event kinds.
   - Cons: casualty cause/causer and kickoff rows remain impossible (they are NOT in any existing data source for a live game — a result snapshot rolls casualty bands but does not capture fouler/cause per-blow); "Partido reportado"/winnings/fans can come from snapshot. Less faithful to the approved design.
   - Effort: Medium.

3. **Full Tourplay port** — new component set mirroring the preview HTML/SVG 1:1.
   - Pros: most pixel-faithful.
   - Cons: violates MV-7/LM-10 (SVG icon lib/deps), increases e2e breakage; rejected by the design system constraint.
   - Effort: High, out of policy.

## Recommendation
Adopt **Approach 1 (model-first, sliced)**. The casualty cause/causer and foul victim genuinely need new persisted fields (data does not exist anywhere today); MVP already exists as an event; winnings/fans/reportado can be added to the finished feed as summary rows reading the snapshot (or as persisted events written at result-load, consistent with the `mvp` precedent). Slice: (a) command+route+store payloads for foul victim + casualty cause/causer, (b) `EventControls` captures those fields, (c) `LiveEventsList` card redesign + timeline bar, (d) finished-feed summary rows, (e) unit+e2e updates.

## Risks
- **e2e/unit breakage is broad**: `live-event-row` scalar assertions and many exact Spanish strings are asserted. Card/grouping changes must preserve these testids and labels or they must be updated deliberately (the redesign intentionally changes structure, so tests will need updates — gate them behind intentional behavior change).
- **Data-model migration**: `LiveEvent.payload` is a JSON column (additive) and `LiveEvent.kind` is TEXT — adding fields/kinds needs NO Prisma migration (LM-14 precedent), but the command union + permission matrix (`resolveEventPermission`) needs extension for foul victim and casualty cause.
- **LM-12/`resolveEventPermission`**: today a foul can carry a victim but the side-gate only knows `kind`. Adding `foulVicitimSide`/`causerSide` to permission checks needs care to not break the non-active/own-injury rule.
- **Turn rows excluded from feed (LM-16)**: the timeline's event-positioning relies on the display kinds only; boundary/`turnStart` rows never surface — the timeline must derive position from display events (already the case via `deriveMinute`).
- **MVP already an event**: reusing `mvp` for the summary row is fine; do NOT duplicate "Partido reportado"/winnings into new kinds unless required — they can be snapshot-derived rows on the finished feed, keeping `isDisplayEvent`'s 8-kind surface (LM-16).

## Ready for Proposal
**Yes.** The orchestrator should tell the user: this is a substantial, model-first redesign; the proposal should scope it as ~4-5 sliced PRs (payload extension + controls + card/timeline UI + finished summary rows + test updates) and decide whether casualty cause/causer and foul victim persistence are in scope (they require server change, but are unavoidable to meet the approved derived design).
