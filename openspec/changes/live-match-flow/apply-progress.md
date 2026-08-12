# Apply Progress — live-match-flow (PR 1a: Server Core)

> Change: `live-match-flow` · PR slice: **1a** (stacked-to-main chain, slice 1 of 5)
> Phase: sdd-apply · Mode: **Strict TDD** (vitest)
> Status: **1a COMPLETE — 8/8 tasks** · Next: sdd-verify or apply → PR 1b

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
