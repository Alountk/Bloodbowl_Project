# Apply Progress — Live Match Realtime (PR 1–4 merged)

Phase: **apply** (slices 1–4 of 6, stacked-to-main)
Status: **PR 1 tasks 1.1–1.7 · PR 2 tasks 2.1–2.4 · PR 3 tasks 3.1–3.3 · PR 4 tasks 4.1–4.2 complete**
Mode: **Strict TDD** (test runner: `pnpm test` = `vitest run`)
Date: 2026-08-12

---

## PR 1: Migration + League Clock Option (merged via #61)

### What shipped (PR 1)

- League creation API (`app/api/leagues/route.ts`) now accepts the turn-clock
  option and enforces it server-side: omitted → defaults enabled@240 (DB
  defaults); when enabled the duration MUST be exactly 120|240|360, otherwise
  `400` BEFORE any write (no partial league rows, `prisma.league.create` never
  called). The option has **no update path**, so it is immutable by construction.
- `features/leagues/CreateLeagueModal.tsx` renders the option (enabled toggle
  defaulting ON + 120/240/360s duration select defaulting 240) and always
  submits it with the league.
- `features/leagues/api.ts` + `useLeagues.ts` pass the option through
  (`createLeague(name, description, option?)`); the `League` type now carries
  `turnClockEnabled` / `turnClockSeconds`.
- `prisma/schema.prisma`: `League.turnClockEnabled Boolean @default(true)` +
  `turnClockSeconds Int @default(240)`.
- Migration `20260812010000_add_live_match_realtime/migration.sql`: additive
  `ALTER TABLE "League" ADD COLUMN ... NOT NULL DEFAULT true/240` which
  backfills existing rows to enabled@240 (matches `@default` semantics).
- `lib/liveAccess.ts` gate helper (pure role-decision, D9/AC-1) + role-matrix
  tests. Consumed by the slice-2 SSE routes.

### PR 1 TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `app/api/leagues/route.test.ts` | Unit (route, mocks) | ✅ 6/6 | ✅ 4 fail | ✅ 11/11 | ✅ 5 cases | ✅ extracted consts |
| 1.2 | `features/leagues/CreateLeagueModal.test.tsx` | Integration | ✅ 4/4 | ✅ 4 fail | ✅ 7/7 | ✅ 4 cases | ✅ literal-union type |
| 1.3 | `features/leagues/api.test.ts` | Unit (api wrapper) | ✅ 16/16 | ✅ 1 fail | ✅ 18/18 | ✅ 2 cases | ➖ None |
| 1.6 | `lib/liveAccess.test.ts` | Unit (pure fn) | N/A (new) | ✅ import fails | ✅ 13/13 | ✅ 13 cases | ✅ D9 404 alignment |

Tasks 1.4, 1.5, 1.7 structural (schema/migration/verify): no test cycle; verified
via `pnpm db:generate` + `npx tsc --noEmit` + entrypoint read (`prisma migrate
deploy` already present, unchanged).

---

## PR 2: SSE Subscribe + Hub

### What shipped (PR 2)

- `lib/liveHub.ts` — narrow in-memory fan-out hub behind the swappable seam
  (`createLiveHub()` factory + `liveHub` singleton): `subscribe`/`unsubscribe`/
  `publish` per fixture (no-op when no subscribers), per-channel clock config
  from the League row, 1s clock ticker that advances the ACTIVE coach's clock
  ONLY when `turnClockEnabled` (emits `kind:"tick"`; seq stays DB-authoritative),
  and a 10s active-coach disconnect grace (arms on last connection drop, fires
  `onGraceExpired` unless a reconnect cancels it). Grace + ticker are gated on
  the league option (LM-5/LM-7 clockless leagues: no ticking, no grace).
- `app/api/leagues/[id]/fixtures/[fixtureId]/live/route.ts` — SSE GET (`force-dynamic`).
  Gate via `liveAccess` (LM-2): 401 both auth modes (AUTH_MODE=local 401s by
  design), 404 foreign/unknown, 200 owner/member. Stream lifecycle (D7/LM-8):
  `event: snapshot` (no id) FIRST, then gap `event: event id:<seq>` for events
  with `seq > snapshot.seq` (deduped by seq), 15s `heartbeat`, then live
  `state`/`event` frames. Subscribes to the hub BEFORE the DB read to close the
  subscribe race; abort/cancel tears the subscription down (no leaks). Handles
  "no live match started": snapshotSeq 0, `live: null`, stream still open.
- `lib/liveHub.test.ts` (10) + `live/route.test.ts` (6) — hub fan-out/grace/
  ticker (fake timers) and route gate/snapshot/gap/abort/race tests.

### PR 2 TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 2.1/2.2 | `lib/liveHub.test.ts` | Unit (pure, fake timers) | N/A (new) | ✅ import fails | ✅ 10/10 | ✅ 4 fan-out + 3 grace + 3 ticker | ✅ dropped fixtureId param; optional paused |
| 2.3/2.4 | `live/route.test.ts` | Unit (route, `vi.hoisted` mocks + fake hub) | N/A (new) | ✅ route missing | ✅ 6/6 | ✅ 401-both-modes / 404 / 200 / snapshot / gap-dup-drop / abort | ✅ subscribe-before-snapshot (race closed) |

### PR 2 Test Summary

- **PR 2 tests written**: 16 · **passing**: 16/16 focused
- **Full suite**: 1004/1004 (87 files) — up from 988
- **Layers used**: Unit (hub pure via fake timers 10; route via `vi.hoisted` + fake hub 6)
- **Pure/concurrency concerns**: subscribe race closed (hub.subscribe before DB
  read; buffered gap drained after snapshot).

## Combined Work Unit Evidence (PR 1 + PR 2)

| Evidence | Required value |
|---|---|
| Focused test command & exact result (PR 1) | `pnpm vitest run app/api/leagues/route.test.ts features/leagues/CreateLeagueModal.test.tsx lib/liveAccess.test.ts` → 31/31 |
| Focused test command & exact result (PR 2) | `pnpm vitest run lib/liveHub.test.ts app/api/leagues/[id]/fixtures/[fixtureId]/live/route.test.ts` → 16/16 |
| Runtime harness (PR 1) | `AUTH_MODE=local pnpm exec playwright test` → 21/21 |
| Runtime harness (PR 2) | `AUTH_MODE=local pnpm exec playwright test` → 21/21 (realtime routes 401 by design in local; auth suite untouched — PR 6 covers the auth e2e) |
| Rollback boundary (PR 2) | Revert live/route.ts + lib/liveHub.ts (and tests) — independent of PR 1 migration and league-option work; PR 3 control/store lands on top and only needs the hub interface (subscribe/publish/startTicking) unchanged. |

## Deviations from Design

- **File-line budget (PR 2)**: design estimated slice 2 at 355 authored lines;
  actual ≈ 856 (production hub 200 + route 191 ≈ 391; tests 465). The production
  code sits right at the 400-line guide; total is well over because strict-TDD
  test volume doubled it. **WARNING — reviewer should accept `size:exception` or
  the PR-2 task boundary (hub + GET route are coupled: the route consumes the
  hub and its tests need the hub).**
- The design rebalance note said hub unit tests "ship one PR later in slice 4",
  but **tasks.md 2.1/2.4 explicitly requires `lib/liveHub.test.ts` and the
  subscribe-race test in PR 2**, and the orchestrator's PR-2 focused command
  includes `lib/liveHub.test.ts`. Followed **tasks.md** (authoritative).
- PR 2 has NO migration and NO control/POST handler (correct — those are PR 1
  and PR 3 respectively). The GET reads the optional `live` snapshot defensively
  (cast) so `npx tsc --noEmit` stays green until the LiveMatch/store work lands
  in PR 3/5.
- All other behaviors match design: snapshot-first (no id), gap replay by
  `seq > snapshot.seq`, dup-drop by seq, 15s heartbeat, publish-only-when-subs,
  gate via `resolveLiveAccess` (LM-2), local-mode 401 parity.

## Issues Found

- None blocking. Route stream teardown uses the stream's `cancel()` (reader
  abort) to unsubscribe — the design's "abort → cleanup" is satisfied.
- `TickSnapshot.paused` made optional (PR 2 has no persisted paused state yet);
  `tick()` treats absent as not-paused.

## Remaining Tasks (not this PR)

- [ ] 3.1–3.3 (control transitions + POST + liveStore) · 4.1–4.2 (client hook +
      DTO) · 5.1–5.3 (MatchView/timeline) · 6.1–6.3 (prefill + e2e).

## AC Traceability

| AC | Covered in |
|----|-----------|
| AC-1 | 1.6 + 2.3 role matrix (401 both modes / 404 foreign / 200 owner/member) |
| AC-4 | 2.3/2.4 snapshot-first + seq gap replay / dup-drop |
| AC-8 | 2.3 LM-8 snapshot-first stream (no-id snapshot; reconnect gap by seq) — full new-device flow in PR 6 |
| AC-9 | 2.2/2.1 hub grace + ticker gated on `turnClockEnabled` (LM-5/LM-7) — persist seam in PR 3 |
| AC-10 | 1.1–1.5 league option (PR 1) |

## Workload / PR Boundary

- Mode: **stacked PR slice (2 of 6)**, stacked-to-main
- Boundary: PR 1 (#61) merged → PR 2 adds hub + SSE GET. Depends on PR 1
  (liveAccess, league option); PR 3 adds control/store on the hub interface.
- Review budget impact (PR 2): production ≈ 391 lines, total ≈ 856 with
  strict-TDD tests. Exceeds the 400-line guide; recommend `size:exception` or
  accepting the coupled hub+route task boundary.

## Commits

**PR 1 (feat/live-match-realtime-pr1):** `bf13f19` (league option API+migration),
`1b6b136` (create form), `aee38bc` (liveAccess gate), `af1c98b` (docs).

**PR 2 (feat/live-match-realtime-pr2):** `ff181f4` (hub + tests), `5e21f14`
(SSE GET route + tests), + docs commit (tasks.md marks).

---

## PR 3: Control + Transitions + POST

### What shipped (PR 3)

- **Prisma models + migration** (`20260812120000_add_live_match_models`): added
  `LiveMatch` + `LiveEvent` tables, the `TeamSide`/`LiveMatchStatus` enums, and
  `Fixture.liveMatch` (1:1 via unique `fixtureId`). The design's slice-1 row had
  listed them but PR 1 only shipped the League columns — this slice added them
  additively (the control route needs them). Additive only.
- `lib/liveMatch.ts` — pure state machine (LM-3/LM-4, D4/D5/D11): `startMatch`
  (start guard: scheduled fixture, not played, no result), `applyEndTurn`
  (alternation, no double action, 1..8 turn cap, half flip, half-2-turn-8
  auto-finish), `applyTD` (score++, auto-ends turn, half-2-turn-8 TD finishes),
  `applyEndMatch`, `toLiveViewState` (clockSeconds derived from state, clocks
  null when disabled). Zero mocks.
- `lib/liveStore.ts` — `startLiveMatch` (create row + start event atomically,
  409 on P2002 double-start), `applyTransition` (optimistic `updateMany` seq
  guard → 0 rows → 409 double-action, atomic event append, publish-after-commit),
  `pauseLiveMatch`/`resumeLiveMatch` (grace persistence), `liveMatchRowToState`.
- `live/route.ts` — POST handler: gate via `liveAccess`(control) → fixture-coach/
  admin check (spectator member 403, foreign 404), dispatch start/endTurn/td/
  casualty/foul/endMatch, 200/400/403/404/409. GET refactored to read the
  persisted `LiveMatch` row for the snapshot and to wire grace (active coach
  reconnect → resume; grace expiry → pause).
- `lib/liveHub.ts` — grace handler now fixture-level (a single `onGraceExpired`
  on the channel) so a disconnect pause persists once, not per spectator sub.
- Tests: `lib/liveMatch.test.ts` (14), `lib/liveStore.test.ts` (8), hub grace
  update, `live/route.test.ts` (+POST gate/command/409, +grace-resume GET).

### PR 3 TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 3.1 | `lib/liveMatch.test.ts` | Unit (pure) | N/A (new) | ✅ import fails | ✅ 14/14 | ✅ 14 cases | ✅ cleaned event/seq handling |
| 3.2 | `lib/liveStore.test.ts` | Unit (injected deps) | N/A (new) | ✅ import fails | ✅ 8/8 | ✅ 8 cases | ✅ extracted persistAndPublish |
| 3.2 POST | `live/route.test.ts` | Unit (`vi.hoisted` + store mocks) | ✅ 3/3 | ✅ new cases RED | ✅ 15/15 | ✅ 401/404/403/409/200 | ✅ shared loadFixtureGate |
| 3.3 | `liveStore.test.ts` + `liveHub.test.ts` + `route.test.ts` | Unit | — | ✅ RED | ✅ green | ✅ pause/resume/no-op | ✅ fixture-level grace |

### PR 3 Test Summary

- **PR 3 tests written**: 33 (14 liveMatch + 8 store + 2 grace-wiring route + 9 POST/tests reused) · focused 47/47 (incl. hub 10).
- **Full suite**: 1035/1035 (89 files) — up from 1004.
- **Layers**: Unit pure (14) + unit injected-deps (8) + unit route mocks (15) + hub unit (10).

### PR 3 Work Unit Evidence

| Evidence | Required value |
|---|---|
| Focused test command & exact result | `pnpm vitest run lib/liveMatch.test.ts lib/liveStore.test.ts app/api/leagues/[id]/fixtures/[fixtureId]/live/route.test.ts` → 37/37 |
| Runtime harness | `AUTH_MODE=local pnpm exec playwright test` → 21/21 (live POST realtime is auth-mode-only; local 401 by design — auth e2e lands in PR 6) |
| Rollback boundary | Revert control store/state-machine/POST commits + the model migration (additive) independently of PR 1/2 SSE GET + hub; only the POST+store+grace depend on the models. |

### Deviations / Risks (PR 3)

- **Line budget**: PR 3 authored lines far exceed 400 (production state-machine 355
  + store 323 + route ~467 + models/migration ≈ 796+). The control slice is the
  largest by design. **WARNING — `size:exception` or accept the PR-3 task
  boundary.**
- The design's slice-1 model migration (LiveMatch/LiveEvent) was deferred to PR 3
  since PR 1 shipped only the League columns; tasks.md Phase 3 required the
  control route which needs the models. Added them additively.
- `liveHub` grace reconciliation: hub's per-subscriber `onGraceExpired` → a
  single fixture-level channel handler (so a disconnect-pause persists once).
  This is the correct LM-7 semantics and updates the PR 2 hub test.
- `casualty`/`foul` events are recorded (coach-reported band immutable, D10); the
  results POST (PR 6) stays authoritative. No parallel dice path.

### Remaining Tasks (not this PR)

- [ ] 4.1–4.2 (client SSE hook + DTO) · 5.1–5.3 (MatchView + timeline + labels) ·
      6.1–6.3 (result prefill + live e2e).

### AC Traceability (PR 3 contribution)

| AC | Covered in |
|----|-----------|
| AC-2 | 3.2 POST control gates (401/404/403) + transition 409s |
| AC-3 | 3.1 pure invariants (alternation, no double, 8-turn, half flip) |
| AC-4 | 3.2 optimistic seq (updateMany 0 → 409) + LiveEvent seq order + publish-after-commit |
| AC-9 | 3.3 grace pause (`paused=true`/`clockStartedAt=null`) + resume on reconnect + restart recompute via persisted timestamps |

### Workload / PR Boundary

- Mode: **stacked PR slice (3 of 6)**, stacked-to-main
- Boundary: PR 2 (#62) merged → PR 3 adds models/migration, state machine, store,
  POST control route, grace. PR 4 adds the client hook + DTO.
- Review budget impact: control slice is the largest (state machine + store +
  POST + models). Recommend `size:exception`.

## Commits (PR 3, feat/live-match-realtime-pr3)

- `c8717da` feat(live): add live-match Prisma models and additive migration
- `f5ba9fb` feat(live): add pure live-match state machine
- `30cfa97` feat(live): add live-match store with optimistic seq persistence
- `b765e99` feat(live): make hub grace pause fixture-level for store wiring
- `c89189a` feat(live): add control POST handler with gates and commands
- + docs commit (this file + tasks.md marks)

---

## PR 4: Client + SSE Hook + DTO

### What shipped (PR 4)

- `features/leagues/api.ts`: `LiveMatchViewState` DTO (seq, status, half,
  turnNumber, activeSide, `turnClockEnabled`, **nullable** `homeClock`/`awayClock`/
  `paused` when the league option is off, `homeScore`/`awayScore`, `finishedAt`);
  `LiveMatchEventDto`; `LiveCommand` union; `sendLiveCommand(leagueId, fixtureId,
  cmd)` using the `readJson` fetch pattern (returns the POST response `view`;
  maps 400/403/404/409 to thrown Errors with `.status`).
- `features/leagues/useLiveMatch.ts`: SSE hook. Opens an `EventSource` to the live
  route (same-origin cookie, no custom headers, LM-1), applies `snapshot`/`state`
  events to a client view (snapshot has no `id` so it never advances the
  Last-Event-ID cursor), surfaces `live`/`connected`/`error` + `sendCommand`.
  EventSource auto-reconnects with `Last-Event-ID` set from the last `state`
  `id:<seq>`; the server gap-replays past that cursor so a new device/reconnecting
  coach converges (LM-8/AC-8). Unmount closes the stream. The `sendCommand`
  optimistically reflects the returned view for the issuing coach (the hub pushes
  the authoritative `state` back to all coaches).
- Tests: `useLiveMatch.test.tsx` (7 — fake EventSource + fetch stubs) and api.test.ts
  live DTO/command coverage (3: enabled/disabled DTO, sendLiveCommand 200, 409).

### PR 4 TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 4.1 | `features/leagues/useLiveMatch.test.tsx` | Integration (hook, fake ES + fetch) | N/A (new) | ✅ import fails | ✅ 7/7 | ✅ connect/snapshot/delta/reconnect/control/409/cleanup | ✅ removed unused ref & FakeESCtor |
| 4.2 | `features/leagues/api.test.ts` | Unit (api wrapper) | ✅ 18/18 | ✅ RED | ✅ 21/21 | ✅ enabled/disabled DTO + command 200/409 | ✅ `clockSeconds` absence asserted via `in` |

### PR 4 Test Summary

- **PR 4 tests**: 10 (7 hook + 3 api DTO/command) · focused 28/28 (incl. existing api 21).
- **Full suite**: 1045/1045 (90 files) — up from 1035.
- **Layers**: Integration hook (7) + unit api (3).

### PR 4 Work Unit Evidence

| Evidence | Required value |
|---|---|
| Focused test command & exact result | `pnpm vitest run features/leagues/useLiveMatch.test.tsx features/leagues/api.test.ts` → 28/28 |
| Runtime harness | `AUTH_MODE=local pnpm exec playwright test` → 21/21 (SSE/control are auth-mode-only; local 401 by design — live e2e lands in PR 6) |
| Rollback boundary | Revert the two client commits (`useLiveMatch` + api DTO/`sendLiveCommand`) — purely client; server GET/POST unchanged. |

### Deviations / Risks (PR 4)

- **Line budget**: PR 4 ≈ 393 authored lines — within the 400-line guide (production ~150). No `size:exception` needed.
- **Design rebalance**: tasks.md Phase 4 lists only the hook + DTO (no deferred slice-2/3 unit tests in Phase 4 — those shipped already in PR 2/3). Followed tasks.md exactly.
- Reconnect: EventSource auto-reconnects internal (the hook does NOT recreate the EventSource on error); the hook just re-applies the post-reconnect snapshot. `Last-Event-ID` is the browser's cursor; the server gap-replays.
- DTO keeps clocks nullable + no `clockSeconds` (LM-5: client can't derive a clock). `LiveMatchEventDto` defined for the future timeline (PR 5) — not yet consumed.

### Remaining Tasks (not this PR)

- [ ] 5.1–5.3 (MatchView live wiring + timeline + `liveEventLabels`) · 6.1–6.3 (result prefill + live e2e).

### AC Traceability (PR 4 contribution)

| AC | Covered in |
|----|-----------|
| AC-8 | 4.1 hook reconnect + snapshot-first (EventSource Last-Event-ID; server gap replay) |
| AC-9 | 4.2 DTO nullable clocks + pause (client never derives a clock) |

### Workload / PR Boundary

- Mode: **stacked PR slice (4 of 6)**, stacked-to-main
- Boundary: PR 3 (#63) merged → PR 4 client hook + DTO + `sendLiveCommand`. PR 5 wires MatchView + timeline.
- Review budget: fits the 400-line guide (~393).

## Commits (PR 4, feat/live-match-realtime-pr4)

- `676d513` feat(leagues): add live match DTO types and sendLiveCommand client
- `50bf592` feat(leagues): add useLiveMatch SSE hook with snapshot-first and reconnect
- + docs commit (this file + tasks.md marks)

---

## PR 5: MatchView + Timeline + Labels

### What shipped (PR 5)

- `features/leagues/liveEventLabels.ts` (+ test): pure Spanish label fn for the
  minimum event taxonomy — start, turn, touchdown, casualty (reuses the rulebook
  `casualtyKindLabel` band: "Herida grave"/"Permanente"/"Muerto"), foul, end of
  half, end of match. Unknown kinds pass through (matchSummary precedent).
- `app/api/leagues/[id]/fixtures/[fixtureId]/route.ts` (+2 tests): returns the
  shared `live` DTO (`LiveMatchViewState` + chronological `events`) via the
  fixture GET. The fixture include now pulls `liveMatch { events orderBy seq }`
  and the league's turn-clock fields; `live` is `null` when no LiveMatch exists
  (MV-5 static inert). `api.ts` `MatchDetail` + `LiveMatchView` typed accordingly.
- `features/leagues/MatchView.tsx` (+4 unit tests): a LiveMatch for a fixture
  renders the live UI — `LiveActiveMatch` (running match: `useLiveMatch` SSE
  feeds the turn bar/clocks/score/feed + "Dar el turno" control via `sendCommand`)
  or `FinishedLiveTimeline` (played live match: final score + persisted timeline).
  Clocks are hidden when `turnClockEnabled` is false (LM-5). Static fixtures
  (`detail.live === null`) render exactly as before, so the MV-5 guard
  `not.toContainText(/turno|minuto|½/i)` holds.

### PR 5 TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 5.1 | `features/leagues/MatchView.test.tsx` | Integration (fake ES + fetch) | ✅ 7/7 | ✅ 4 fail | ✅ 11/11 | ✅ live turn/score/feed, clocks-hidden, control, finished timeline | ✅ static-state regression preserved |
| 5.2 | `features/leagues/liveEventLabels.test.ts` | Unit (pure) | N/A (new) | ✅ import fails | ✅ 8/8 | ✅ 8 kinds + band + unknown | ➖ None |
| 5.3 | `.../fixtures/[fixtureId]/route.test.ts` | Unit (route, mocks) | ✅ 7/7 | ✅ 2 fail | ✅ 9/9 | ✅ live-null + live-serialize | ✅ shared serializeLive |
| DTO | `features/leagues/api.test.ts` + matchSummary.test | Unit | ✅ 21/21, ✅ 12/12 | — | ✅ green | ✅ MatchDetail `live` field | ➖ |

### PR 5 Test Summary

- **PR 5 tests**: 13 new (4 MatchView live/timeline + 8 labels + 2 route live) · focused 49/49.
- **Full suite**: 1058/1058 (91 files) — up from 1045.
- **Layers**: Integration component (4 + 7 static regression) + unit pure (8) + unit route (2) + unit DTO.

### PR 5 Work Unit Evidence

| Evidence | Required value |
|---|---|
| Focused test command & exact result | `pnpm vitest run features/leagues/MatchView.test.tsx features/leagues/liveEventLabels.test.ts app/api/leagues/[id]/fixtures/[fixtureId]/route.test.ts features/leagues/api.test.ts` → 49/49 |
| Runtime harness | `AUTH_MODE=local pnpm exec playwright test` → 21/21 (local suite ignores auth-only match-view/live specs; static-state guard covered by the MatchView unit test and the auth e2e in PR 6) |
| Rollback boundary | Revert MatchView/labels/fixture-GET commits independently of PRs 1-4; the fixture GET `live` field is additive (null default) and removable without breaking static MatchView. |

### Deviations / Risks (PR 5)

- **Line budget**: PR 5 ≈ 690 authored lines (MatchView UI + route + labels + tests). The UI wiring is the dominant weight; the orchestrator's task boundary (5.1-5.3) is one coherent slate. **WARNING — `size:exception` or accept the UI-slice boundary.**
- Live vs finished: a running match (`live.status === "live"`) is fed by `useLiveMatch`; a finished live match renders the persisted timeline from the fixture GET `live` (no SSE). This matches MV-5 (live + played timeline) and D8.
- The static-state guard (`/turno|minuto|½/i` absent) is preserved: `detail.live === null` renders no live UI. Covered by the "no visible live/timeline/clock shells" unit test and the auth `e2e/match-view.spec.ts` (PR 6 runs it).
- `matchSummary.test` fixture updated with the required `MatchDetail.live` field (additive TS).

### Remaining Tasks (not this PR)

- [ ] 6.1–6.3 (result prefill `resultPrefill.ts` + ResultModal/LeagueDetail + auth-suite live e2e + config exclusion).

### AC Traceability (PR 5 contribution)

| AC | Covered in |
|----|-----------|
| AC-5 | 5.1 live UI only for live/played; static guard preserved; tokens/copy Spanish (MV-7) |
| AC-9 | 5.1 clocks hidden when `turnClockEnabled` false (LM-5) |
| LM-10 | 5.1/5.3 timeline for live (SSE) + played (persisted events via fixture GET `live`); no replay/public/out-of-taxonomy |

### Workload / PR Boundary

- Mode: **stacked PR slice (5 of 6)**, stacked-to-main
- Boundary: PR 4 (#64) merged → PR 5 wires MatchView live/timeline + labels + fixture GET `live`. PR 6 adds result prefill + live e2e.
- Review budget: ≈ 690 authored lines (UI slate); recommend `size:exception`.

## Commits (PR 5, feat/live-match-realtime-pr5)

- `a89ce30` feat(leagues): add Spanish live-event labels
- `8eecf4f` feat(leagues): return the shared live DTO from fixture GET
- `fc97806` feat(leagues): wire MatchView live shells and timeline
- + docs commit (this file + tasks.md marks)
