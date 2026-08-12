# Apply Progress — Live Match Realtime (PR 1: Migration + League Clock Option)

Phase: **apply** (slice 1 of 6, stacked-to-main)
Status: **PR 1 tasks 1.1–1.7 complete**
Mode: **Strict TDD** (test runner: `pnpm test` = `vitest run`)
Date: 2026-08-12

## What shipped (PR 1)

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

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `app/api/leagues/route.test.ts` | Unit (route, mocks) | ✅ 6/6 | ✅ 4 fail | ✅ 11/11 | ✅ 5 cases (default, explicit 240, invalid 3600, invalid 90, immutable) | ✅ extracted `TURN_CLOCK_SECONDS`/`isTurnClockSeconds` |
| 1.2 | `features/leagues/CreateLeagueModal.test.tsx` | Integration (component) | ✅ 4/4 | ✅ 4 fail | ✅ 7/7 | ✅ 4 cases (default 240, 360 select, disable toggle, options list) | ✅ typed duration as literal union |
| 1.3 | `features/leagues/api.test.ts` | Unit (api wrapper) | ✅ 16/16 | ✅ 1 fail | ✅ 18/18 | ✅ 2 cases (option sent / option omitted) | ➖ None needed |
| 1.6 | `lib/liveAccess.test.ts` | Unit (pure fn, 0 mocks) | N/A (new) | ✅ import fails | ✅ 13/13 | ✅ 13 role-matrix cases | ✅ aligned foreign→404 for started (D9 no-leak) |

Tasks 1.4, 1.5, 1.7 are structural (schema/migration/verify) — no test cycle;
verified via `pnpm db:generate` + `npx tsc --noEmit` + a manual read of the
entrypoint (`prisma migrate deploy` already present, unchanged).

### Test Summary

- **Total tests written**: 24 (5 route + 3 modal + 2 api + 13 liveAccess + 1 League-shape amend)
- **Total tests passing**: 24/24 (focused) · 988/988 (full suite)
- **Layers used**: Unit (route/api/pure 21), Integration (component 3)
- **Approval tests** (refactoring): 0 — none required; the one existing modal
  test ("POSTs the league") was updated to the intentionally-changed spec
  behavior (option now always sent with defaults).
- **Pure functions created**: `isTurnClockSeconds`, `resolveLiveAccess`

## Work Unit Evidence

- **Work unit 1 (league option API + migration)** — tests `route.test.ts`, `api.test.ts`, modal test, `db:generate`, `tsc`.
- **Work unit 2 (liveAccess gate)** — tests `lib/liveAccess.test.ts`.

| Evidence | Required value |
|---|---|
| Focused test command and exact result | `pnpm vitest run app/api/leagues/route.test.ts features/leagues/CreateLeagueModal.test.tsx lib/liveAccess.test.ts` → 3 files, 31/31 passing |
| Runtime harness command/scenario and exact result | `AUTH_MODE=local pnpm exec playwright test` → 21/21 passing (league create path in auth-only specs untouched; modal preserves `Nombre` input + `Crear liga` button). Local realtime 401-by-design (liveAccess local parity). |
| Rollback boundary | Revert league option commit stack: remove guard in `POST /api/leagues`, modal option fields, `createLeague` param, League columns via reverse-migration, and delete `lib/liveAccess.ts`/test — none interdependent with slices 2–6 SSE/hub code. |

## Deviations from Design

- **File-line budget**: design estimated slice 1 at 349 authored lines; actual
  authored ≈ 630 (production ~165, tests ~461). Tests are more thorough than the
  terse task bullets implied (API layer tests added that the design slice-1 rows
  did not list). Production code is well under budget. **Flagged as WARNING —
  reviewer should accept the extra test coverage or size:exception.**
- design.md File Changes table listed `lib/liveAccess.ts` as a **slice-2**
  creation, but tasks.md 1.6 requires the gate helper in PR 1 ("GREEN
  `lib/liveAccess.ts` (empty gate awaiting slice 2)"). Followed **tasks.md** (the
  authoritative apply scope). The design's own slice-1 note confirms the
  `liveAccess.test.ts` role matrix belongs in slice 1.
- All other behaviors match design (default enabled@240, 400 before write on
  invalid duration, immutable option, D9 404-foreign/no-leak on started).

## Issues Found

- None blocking. `toBeChecked`/`toHaveValue` jest-dom matchers absent; used raw
  `.checked`/`.value` assertions per repo convention (AGENTS.md).

## Remaining Tasks (not this PR)

- [ ] 2.1–2.4 (SSE hub/subscribe) · 3.1–3.3 (control) · 4.1–4.2 (client) ·
      5.1–5.3 (MatchView/timeline) · 6.1–6.3 (prefill + e2e) — slices 2–6.

## AC Traceability (PR 1 contribution)

| AC | Covered in |
|----|-----------|
| AC-10 | 1.1–1.5 (league option), full matrix via liveAccess read gate (enabled/disabled honored downstream) |
| AC-1 | 1.6 role matrix (401 both modes / 404 foreign / 200 owner/member; control 403/404) |

## Workload / PR Boundary

- Mode: **stacked PR slice (1 of 6)**, stacked-to-main
- Boundary: PR 1 starts from updated `main` planning artifacts and ends with
  migration + league option + liveAccess gate. Depends on nothing; PR 2 adds
  hub + SSE routes.
- Review budget impact: production +165 lines; total (incl. tests + docs)
  ≈ 630 authored lines → exceeds the 400-line guide. Recommend maintaining the
  PR-1 task boundary; the extra weight is strict-TDD test coverage, not scope.
