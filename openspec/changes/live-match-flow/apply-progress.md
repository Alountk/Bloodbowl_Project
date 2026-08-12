# Apply Progress — live-match-flow (PR 1a + 1b + 2 + 3)

> Change: `live-match-flow` · PR slices: **1a** + **1b** + **2** (stacked-to-main chain)
> Phase: sdd-apply · Mode: **Strict TDD** (vitest)
> Status: **1a + 1b + 2 COMPLETE — 20/20 tasks** · Next: sdd-verify or apply → PR 3

## Scope

Implemented EXACTLY `tasks.md` PR 1a (1.1–1.8): server core. No client
(MatchView/CreateLeagueModal — PR 1b), no permissions/nudge (`lib/livePhase.ts` —
PR 2), no rejornar (PR 3), no correction (PR 4).

## Summary of changes

- **Migration** `20260812130000_add_live_match_flow` (additive): `ALTER TYPE
  "LiveMatchStatus" ADD VALUE 'ready'` (PG≥12 confirmed — PG16 dev/prod image);
  `homeConsented`/`awayConsented`/`startedAt`/`homeTurnMs`/`awayTurnMs` added to
  LiveMatch. `homeClock`/`awayClock` stay (deprecated-unused); League clock
  columns stay untouched.
- **`lib/liveMatch.ts`** — reworked to the two-phase lifecycle (`ready` status in
  the `LiveMatchStatus` union) + unified clock. Added `consentStart`,
  `retractConsent`, `beginMatch` (ready→live ONLY via the first turn, appends
  `start` + `turnStart("home")`), `deriveLiveClock` (pure clock derivation shared
  by both serializers). Deleted `startMatch`, `canStart`, `autoEndTurnOnClockZero`
  (D4), the `league` field, and the per-turn clock fields from `LiveMatchState`/
  `LiveMatchViewState`. `LiveEventKind` gained `turnStart`. DTO now exposes
  `homeConsented`/`awayConsented`/`viewerSide`/`startedAt`/`elapsed`/`homeTurnMs`/
  `awayTurnMs`; `turnClockEnabled`/`homeClock`/`awayClock`/nullable `paused` removed.
- **`lib/liveStore.ts`** — reworked store: `liveMatchRowToState` reads the new
  fields, `consentLiveMatch` (create-on-first-consent, P2002-re-read, ready on
  second consent — D16), `retractLiveConsent`, `beginLiveMatch`, `applyTransition`
  (unchanged contract), and pause/resume **repurposed for the unified clock**
  (LM-7/D18: pause bumps the ACTIVE accumulator by `(now - clockStartedAt)`,
  resume restarts the segment at `now`). Removed `startLiveMatch`.
- **`lib/liveHub.ts`** — `onClockExpired` seam DELETED (D4); ticker derives +
  publishes the ACTIVE side's accumulation via `deriveLiveClock` (informational,
  never stops on zero); grace-gate `if (!turnClockEnabled) return` REMOVED
  (LM-7 — grace now unconditional); `config`/`turnClockEnabled` dropped from
  `SubscribeInput`/`Channel`; new `TickSnapshot` shape.
- **`live/route.ts`** — commands rewired: `consent`/`retractConsent`/`begin`
  replace `start`; the D4 `onClockExpired` wiring + `startTicking(fid, snap,
  fn)` removed; the DTO carries `viewerSide` (D19) on snapshot + POST responses
  (hub fan-out frames stay `null`); `liveMatchRowToState(row)` no longer takes
  the clock config.
- **`fixtures/[fixtureId]/route.ts`** — `serializeLive` reworked to the unified DTO
  (shared `deriveLiveClock`), takes `viewerSide` (computed server-side per
  session); `turnClockEnabled`/`turnClockSeconds` no longer selected/read (D15).
- **`app/api/leagues/route.ts`** — D15: the turn-clock validation REMOVED; a
  legacy payload carrying `turnClockEnabled`/`turnClockSeconds` is IGNORED-not-
  persisted (columns keep DB defaults).

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `prisma/schema.prisma` + migration (validated via `pnpm db:generate`) | Structural | ✅ 77/77 | ✅ Written (schema+SQL) | ✅ Prisma client generated | ➖ Single spec | ✅ Clean |
| 1.2 | `lib/liveMatch.test.ts` | Unit | ✅ 77/77 | ✅ Written (consent/retract/begin referenced before impl) | ✅ 25/25 | ✅ 3 cases (pending→ready, idempotent, begin guards) | ✅ Clean |
| 1.3 | `lib/liveMatch.test.ts` | Unit | ✅ | ✅ Written (deriveLiveClock/toLiveViewState) | ✅ 25/25 | ✅ 3 cases (active acc, paused, elapsed) | ✅ Clean |
| 1.4 | `lib/liveStore.test.ts` | Unit | ✅ 77/77 | ✅ Written (consent/retract/begin/pause/resume) | ✅ 12/12 | ✅ 4 cases | ✅ Clean |
| 1.5 | `lib/liveHub.test.ts` | Unit | ✅ 77/77 | ✅ Written (ticker acc, no autoend) | ✅ 10/10 | ✅ 4 cases | ✅ Clean |
| 1.6 | `live/route.test.ts` | Integr. | ✅ 77/77 | ✅ Written (401/403/404/409, viewerSide) | ✅ 17/17 | ✅ 8 cases | ✅ Clean |
| 1.7 | `fixtures/[fixtureId]/route.test.ts` + `leagues/route.test.ts` | Integr. | ✅ 77/77 | ✅ Written (DTO fields, no turnClock) | ✅ 10/10 + 12/12 | ✅ 4 cases | ✅ Clean |
| 1.8 | grep audit (5 D4 sites) | Audit | ✅ 77/77 | ✅ (6 D4 tests deleted) | ✅ clean grep | n/a (grep) | ✅ Clean |

## Work Unit Evidence

| Evidence | Required value |
|---|---|
| Focused test command and exact result | `pnpm vitest run lib/liveMatch.test.ts lib/liveStore.test.ts lib/liveHub.test.ts "app/api/leagues/[id]/fixtures/[fixtureId]/live/route.test.ts" "app/api/leagues/[id]/fixtures/[fixtureId]/route.test.ts" app/api/leagues/route.test.ts` → **86 passed** (6 files) |
| Full gates | `pnpm test` → 1094/1094 (92 files) · `pnpm lint` → clean · `npx tsc --noEmit` → clean |
| Regression | `AUTH_MODE=local pnpm exec playwright test` (killed stale :3000) → **21/21 passed** (live-match e2e begin-step excluded — that is PR 1b) |
| Runtime harness | Local Playwright e2e run IS the runtime harness (real HTTP + browser for the touched surfaces); live-match AUTH e2e (begin step) is PR 1b by design → N/A for this slice with that reason |
| Rollback boundary | Revert `lib/{liveMatch,liveStore,liveHub}.ts` + `live/route.ts` + `fixtures/[fixtureId]/route.ts` + `app/api/leagues/route.ts` + `prisma/migrations/20260812130000_add_live_match_flow/` + the test files. Migration is additive (League columns + LiveMatch `homeClock`/`awayClock` untouched) → no data backfill. PR 1b's client/e2e work depends on this slice and stays on top. |

## D4 sweep audit (task 1.8)

- `autoEndTurnOnClockZero`: **0 references** in `lib/`, `app/api/`, `features/` (gone).
- `onClockExpired`: only in explanatory comments/tests (no functional seam).
- `turnClockSeconds`/`turnClockEnabled` reads: **0 in the live stack** — removed the
  league clock select from `live/route.ts` + `fixtures/[fixtureId]/route.ts`; removed
  the validation/write in `app/api/leagues/route.ts` (D15). Only the deprecated
  columns themselves remain (untouched).

## Deviations from Design

None blocking. Notes:
- `consentStart`/`retractConsent` drop the `now` parameter (the design listed it,
  but consent/retract produce no events and no clock work, so `now` was unused).
  The routing is identical; the store passes the state machine through.
- The applied diff (~2.2k lines incl. tests) is larger than the tasks.md estimate
  (~340) because the `LiveMatchState` shape change ripples through the pure layer,
  store, hub, and both route files plus their rewrites — this is the PR 1a
  server-core slice already split from 1a/1b by design.

## Issues Found

None blocking.

## Files Changed (PR 1a)

Modified:
- `prisma/schema.prisma` — LiveMatchStatus + `ready`; LiveMatch consent/startedAt/turnMs fields
- `lib/liveMatch.ts` — lifecycle + unified clock + DTO rewrite
- `lib/liveStore.ts` — consent/begin + pause/resume repurpose
- `lib/liveHub.ts` — ticker accumulate + D4 seam removal
- `app/api/leagues/[id]/fixtures/[fixtureId]/live/route.ts` — commands + viewerSide
- `app/api/leagues/[id]/fixtures/[fixtureId]/route.ts` — serializeLive unified DTO
- `app/api/leagues/route.ts` — D15 ignore-not-persisted

Created:
- `prisma/migrations/20260812130000_add_live_match_flow/migration.sql`
- `openspec/changes/live-match-flow/apply-progress.md` (this file)

Modified (tests): `lib/liveMatch.test.ts`, `lib/liveStore.test.ts`,
`lib/liveHub.test.ts`, `live/route.test.ts`, `fixtures/[fixtureId]/route.test.ts`,
`app/api/leagues/route.test.ts`.

---

# PR 1b — Client + Deprecation + e2e (MERGED)

## Scope

Implemented EXACTLY `tasks.md` PR 1b (1b.1–1b.4): client + deprecation + begin e2e.
No permissions/nudge (PR 2), no rejornar (PR 3), no correction (PR 4). Committed in
4 work units: 866f37e, 5a4a58d, dab240b, f594f41. Clean working tree on
`feat/live-match-flow-1b`.

## Summary of changes

- **1b.1** `CreateLeagueModal.tsx` + `features/leagues/api.ts` `createLeague`: the
  turn-clock toggle + 120/240/360 select are GONE from the modal and the API no
  longer sends the option (D15 ignore-not-persisted). `useLeagues.create` drops
  the option param.
- **1b.2** `League` (and `TurnClockOption`) type: `turnClockEnabled`/
  `turnClockSeconds` keep a `@deprecated` note (columns remain on the row,
  never read/written). `LiveCommand` updated to the PR-1a surface:
  `consent`/`retractConsent`/`begin` added, `start` removed. `LiveMatchViewState`
  updated to the unified-clock DTO (consents / viewerSide / startedAt / elapsed /
  homeTurnMs / awayTurnMs / paused:boolean; `turnClockEnabled`/`homeClock`/
  `awayClock` removed). `useLiveMatch` now resets to `null` on a no-live-row
  snapshot and keeps the DTO `viewerSide` (D19).
- **1b.3** `MatchView.tsx` renders the full two-phase lifecycle: no live row →
  "Partido programado" + "Iniciar partido" (per coach, side from session+owners);
  one consent → "Listo, esperando al rival." + "Retirar consentimiento"; both →
  "Listo para empezar" + "Empezar partido" (begin = first turn); live → unified
  clock (elapsed + per-side `homeTurnMs`/`awayTurnMs` as M:SS) + "Dar el turno";
  finished → timeline. `viewerSide` drives which controls show (D19).
- **1b.4** `e2e/live-match.spec.ts` begin-step rewritten: resolves each coach's
  SIDE from the real round-robin fixture (admin/rival team names vs the fixture's
  home/away names — home/away is randomized), then consent(home/away each) →
  ready → begin → "Dar el turno". The P2002 seq bug this surfaced is fixed
  (below). `e2e/match-view.spec.ts` scheduled-state assertion updated to the
  consent panel (D16).

## Additional bug fixed (surfaced by the e2e begin-step)

- **`lib/liveStore.ts` `persistAndPublish`**: `beginMatch` emits TWO events
  (`start` + `turnStart`), but the shared persist advanced the row seq by only
  `currentSeq + 1`, causing the NEXT transition's event to collide on
  `@@unique([liveMatchId, seq])` → Prisma P2002 → 500. Fixed to advance `nextSeq`
  past the highest delta-event seq (the `beginLiveMatch` store test now asserts
  `seq: 4` from a ready row at seq 2). This is a PR-1a invariant bug that PR 1b's
  e2e legitimately un-gated.

## TDD Cycle Evidence (PR 1b)

| Task | Test File | Layer | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|-----|-------|-------------|----------|
| 1b.1 | `CreateLeagueModal.test.tsx`, `api.test.ts` | Unit | ✅ 2 fail | ✅ 26/26 | ✅ 3 cases | ✅ Clean |
| 1b.2 | `api.test.ts`, `useLiveMatch.test.tsx` | Unit | ✅ tsc RED (types) | ✅ 29/29 | ✅ 2 cases | ✅ Clean |
| 1b.3 | `MatchView.test.tsx` | Component | ✅ (via tsc + assertions) | ✅ 14/14 | ✅ 6 cases | ✅ Clean |
| 1b.4 | `e2e/live-match.spec.ts` (auth) | E2E | ✅ (old start failed) | ✅ 29/29 | n/a | ✅ Clean |

## Work Unit Evidence (PR 1b)

| Evidence | Required value |
|---|---|
| Focused test cmd + result | `pnpm vitest run` on CreateLeagueModal/api/useLiveMatch/MatchView/resultPrefill → **53 / 53** (after additions); final full vitest **1096/1096** |
| Full gates | `pnpm test` 1096/1096 (92 files) · `pnpm lint` clean · `npx tsc --noEmit` clean |
| Regression (local) | `AUTH_MODE=local pnpm exec playwright test` (stale :3000 killed) → **21/21 passed** |
| Runtime harness (auth, authoritative) | `pnpm run test:e2e:auth` → **29/29 passed** (2.5m) — the PR-1a expected-fail is gone |
| Rollback boundary | Revert the 4 PR-1b commits + the `persistAndPublish` seq fix; the additive PR-1a migration + server core remain on main. |

## Deviations from Design

None blocking. Notes:
- The `persistAndPublish` seq fix is a PR-1a invariant bug fixed within PR 1b (the
  e2e begin-step exercised the two-event `begin` path that unit-mocked stores had
  missed). The store test now locks the rule: row seq advances past ALL delta
  events.
- `match-view.spec.ts`'s scheduled-state assertion flipped from `Programado:` to
  the consent panel — a direct, intended consequence of the D16 scheduled-UI change.

## Files Changed (PR 1b)

Modified:
- `features/leagues/CreateLeagueModal.tsx` + `.test.tsx` (drop clock option)
- `features/leagues/api.ts` + `.test.ts` (createLeague no option; League @deprecated; LiveCommand/LiveMatchViewState unified)
- `features/leagues/useLeagues.ts` (create drops option)
- `features/leagues/useLiveMatch.ts` + `.test.tsx` (null-snapshot reset, keep viewerSide)
- `features/leagues/MatchView.tsx` + `.test.tsx` (consent/ready/begin + unified clock UI)
- `features/leagues/resultPrefill.test.ts` (DTO shape)
- `lib/liveStore.ts` + `.test.ts` (persistAndPublish seq fix + begin seq 4)
- `e2e/live-match.spec.ts` (begin-step rewrite)
- `e2e/match-view.spec.ts` (scheduled-state consent assertion)
- `openspec/changes/live-match-flow/tasks.md` (1b.1–1b.4 `[x]`)

---

# PR 2 — Permissions + Nudge (MERGED)

## Scope

Implemented EXACTLY `tasks.md` PR 2 (2.1–2.4): permissions + nudge. No rejornar
(PR 3), no correction (PR 4), no migration. Committed in 4 work units: ca82296,
f7402f2, f2393ae, 79e9ef4. Clean working tree on `feat/live-match-flow-2`.

## Summary of changes

- **2.1** Created `lib/livePhase.ts` with the pure `resolveEventPermission`
  side-matrix (LM-12/D14): ACTIVE coach → any event on any victim; NON-ACTIVE
  coach → ONLY a casualty to their OWN player; caller with no side
  (admin/spectator) → deny all events. RED matrix tests cover every cell
  (`lib/livePhase.test.ts`, 7 tests).
- **2.2** Wired the side-matrix guard into the live POST route for the event
  commands (endTurn/pass, TD, casualty, foul) — a deny returns 409 (the only
  callers reaching it are fixture coaches or the no-team admin; spectator 403 /
  foreign 404 are handled by the existing coach gate + `loadFixtureGate`).
  Added `requestTurn` (non-active coach only; persists a labeled event, no turn/
  clock change) with the 60s `REQUEST_TURN_COOLDOWN_MS` cooldown (D17) keyed on
  the last persisted `requestTurn` event. `turnTransition` now emits an explicit
  `turnStart(nextActive)` event on every turn flip (LM-13).
- **2.3** `liveEventLabels.ts` labels `turnStart` → "Tu turno" and `requestTurn`
  → "Te piden el turno". `MatchView` renders the "Tu turno" notice for the
  ACTIVE coach (viewerSide === activeSide) and "Dar el turno" for the active
  coach / "Pedir turno" for the non-active coach (LM-12/D19). 16 MatchView tests.
- **2.4** `api.ts` `LiveCommand` gains `requestTurn`. (`useLiveMatch` already
  forwards any `LiveCommand`; DTO kinds flow through the string-typed event.)

## Work-unit commits

1. `ca82296` feat(live): add resolveEventPermission side-matrix decision (LM-12)
2. `f7402f2` feat(live): gate event commands by side matrix and add requestTurn nudge (LM-12/LM-13)
3. `f2393ae` feat(leagues): side-aware MatchView controls with 'Tu turno' and 'Pedir turno' (LM-12/LM-13)
4. `79e9ef4` test(e2e): route live-match TD and first pass through the active coach (LM-12)

## TDD Cycle Evidence (PR 2)

| Task | Test File | Layer | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|-----|-------|-------------|----------|
| 2.1 | `lib/livePhase.test.ts` | Unit | ✅ (before impl) | ✅ 7/7 | ✅ 6 cells | ✅ |
| 2.2 | `live/route.test.ts` | Integr. | ✅ 6 fail | ✅ 26/26 | ✅ 8 cases | ✅ |
| 2.3 | `MatchView.test.tsx`, `liveEventLabels.test.ts` | Component | ✅ | ✅ 16/16 + 9/9 | ✅ 2 cases | ✅ |
| 2.4 | `api.test.ts` | Unit | ✅ (type) | ✅ 22/22 | ✅ | ✅ |

## Work Unit Evidence (PR 2)

| Evidence | Required value |
|---|---|
| Focused vitest | 105/105 across livePhase/liveMatch/live route/MatchView/labels/api |
| Full gates | `pnpm test` 1115/1115 (93 files) · `pnpm lint` clean · `npx tsc --noEmit` clean |
| Local e2e | `AUTH_MODE=local pnpm exec playwright test` → **21/21** |
| Auth e2e (authoritative) | `pnpm run test:e2e:auth` → **29/29 passed** (2.7m) — live-match journey green under the new side guards |
| Rollback boundary | Revert the 4 PR-2 commits; server core (PR 1a) + client (PR 1b) stay on main |

## Deviations / Issues

- The existing live-match e2e previously let the admin record an AWAY TD from
  their context regardless of side — invalid under LM-12. Fixed to route both
  the first "Dar el turno" (HOME coach) and the away TD (AWAY coach) through the
  coach who owns the active side. This is the intended tightening, not a break.
- `passTurn` in the matrix is the `endTurn` command (the design's term); the
  route maps `endTurn` → `passTurn` for the gate.
- No slice split was needed: PR 2 (matrix+guards+tests then UI+labels+tests)
  stayed within budget across two commits, matching the 2a/2b WARNING path.

## Files Changed (PR 2)

- Created: `lib/livePhase.ts`, `lib/livePhase.test.ts`
- Modified: `lib/liveMatch.ts` (turnStart-on-flip + `applyRequestTurn` + cooldown const),
  `live/route.ts` + `.test.ts`, `features/leagues/MatchView.tsx` + `.test.tsx`,
  `features/leagues/liveEventLabels.ts` + `.test.ts`, `features/leagues/api.ts`,
  `e2e/live-match.spec.ts`, `tasks.md`

---

# PR 3 — Rejornar (MERGED)

## Scope

Implemented EXACTLY `tasks.md` PR 3 (3.1–3.3): rejornar — re-open negotiation
before play. No correction (PR 4), no migration, no live-match changes.
Committed in 4 work units: 3f56baf, e36ed8c, de39e10, 9593e35. Clean working
tree on `feat/live-match-flow-3`.

## Summary of changes

- **3.1** `propose/route.ts` and `accept/route.ts` relaxed their pre-play lock:
  a SCHEDULED-but-not-played fixture now accepts a new propose (200) and a new
  accept updates `scheduledAt` (200). The guards 409 only when the fixture is
  PLAYED (winnerId set or scores set — the `deriveFixtureStatus` played markers).
  The accept transaction's re-check mirrors this. RED tests flipped (propose L70,
  accept L49 outer + L87 tx re-check) and added a kept 409-on-played for each.
- **3.2** `NegotiationPanel.tsx`: `negotiationOpen` widens from
  `status === "pending"` to `pending` OR `scheduled`. A scheduled-not-played
  fixture re-opens propose/accept for a participant; history retains all old
  proposals alongside the new cycle; a "Re-programar" cue labels the re-opened
  scheduled state. Played fixtures stay locked (no controls). RED tests.
- **3.3** e2e rejornar journey in `e2e/league-matchday.spec.ts`: after a first
  schedule, a participant re-opens negotiation on the scheduled fixture, proposes
  a NEW date, the other participant accepts, `scheduledAt` updates, and the card
  + negotiation history show the new date (old agreed proposal intact).

## Work-unit commits

1. `3f56baf` feat(leagues): relax propose/accept locks for rejornar (re-schedule before play)
2. `e36ed8c` feat(leagues): widen negotiation gate to scheduled fixtures (rejornar)
3. `de39e10` test(e2e): add rejornar journey — re-negotiate a scheduled fixture date
4. `9593e35` test(e2e): reload before asserting scheduled status in rejornar journey

## TDD Cycle Evidence (PR 3)

| Task | Test File | Layer | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|-----|-------|-------------|----------|
| 3.1 | `propose/route.test.ts`, `accept/route.test.ts` | Integr. | ✅ 2 fail | ✅ 15/15 | ✅ 4 cases | ✅ |
| 3.2 | `NegotiationPanel.test.tsx` | Component | ✅ 1 fail | ✅ 15/15 | ✅ 3 cases | ✅ |
| 3.3 | `e2e/league-matchday.spec.ts` | E2E | ✅ (n/a) | ✅ 5/5 matchday | n/a | ✅ |

## Work Unit Evidence (PR 3)

| Evidence | Required value |
|---|---|
| Focused vitest | 30/30 across propose/accept routes + NegotiationPanel |
| Full gates | `pnpm test` 1120/1120 (93 files) · `pnpm lint` clean · `npx tsc --noEmit` clean |
| Local e2e | `AUTH_MODE=local pnpm exec playwright test` → **21/21** (matchday is auth-only) |
| Auth e2e (authoritative) | `pnpm run test:e2e:auth` → **30/30 passed** (2.4m) — 29 pre-existing + the new rejornar journey |
| Rollback boundary | Revert the 4 PR-3 commits; PR 1a/1b/2 (server core + client + permissions) stay on main |

## Deviations / Issues

- The rejornar e2e initially failed because the first-accept assertion read the
  proposer page without a reload (it still held the pre-accept snapshot). Fixed
  with a `proposer.reload()` before asserting the scheduled card — deterministic.
- The played guard uses `winnerId != null || homeScore != null || awayScore !=
  null` (matching `deriveFixtureStatus`), not `scheduledAt` — a scheduled fixture
  is explicitly allow-listed for rejornar.

## Files Changed (PR 3)

- Modified: `propose/route.ts` + `.test.ts`, `accept/route.ts` + `.test.ts`,
  `features/leagues/NegotiationPanel.tsx` + `.test.tsx`,
  `e2e/league-matchday.spec.ts`, `tasks.md`
