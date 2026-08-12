# Apply Progress — Live Match Realtime (PR 1 + PR 2 merged)

Phase: **apply** (slices 1–2 of 6, stacked-to-main)
Status: **PR 1 tasks 1.1–1.7 complete · PR 2 tasks 2.1–2.4 complete**
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
