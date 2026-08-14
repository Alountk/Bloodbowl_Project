# Apply Progress — Live Match Events (Design-A History Feed)

## Change
**Change**: live-match-events
**Phase**: sdd-apply
**Slice**: PR 1 — Event model (server) + mvp write
**Branch**: `feat/live-match-events-pr1`
**Mode**: Strict TDD
**Status**: success — all PR 1 tasks (1.1–1.12) complete
**Elapsed state**: applyState ready → all PR-1 done; remaining PRs 2–4 untouched

## Delivery Strategy Resolution

- Forecast: `400-line budget risk: Low` · `Chained PRs recommended: Yes` · `Chain strategy: stacked-to-main`
- Resolved path: 5-PR stacked-to-main chain; this batch implemented ONLY PR 1 (estimated ~340 lines < 400). No `size:exception`.
- Work-unit commits: 3 feature commits (+1 style cleanup). Each is independently green (pre-commit hooks run the full `pnpm test` suite).

## PR 1 Completed Tasks

- [x] **1.1** `lib/livePhase.ts`: `EventKind` += `"completion"` (no permission logic change — active-coach allow / non-active deny already the matrix default).
- [x] **1.2** `lib/liveMatch.ts`: `LiveEventKind` += `"completion"|"mvp"` (TEXT col, no migration).
- [x] **1.3** `lib/liveMatch.ts`: pure `applyCompletion(state, { side, playerRosterId }, now)` — appends a `completion` event with `payload: { spp: 1 }` (★1, D24), NO turn flip, monotonic `seq = state.seq + 1`.
- [x] **1.4** T-unit: `applyCompletion` active-coach path persists `completion` kind, next seq, ★1, no flip (home + away triangulation).
- [x] **1.5** T-unit: non-active completion deny → 409 no mutation (`livePhase.test.ts` permission deny + `live/route.test.ts` non-active completion 409, no `applyTransition`).
- [x] **1.6** `live/route.ts`: `ControlCommand` += `{type:"completion"; side; playerRosterId}`; `isControlCommand` accepts it; `type:"mvp"` is NOT a control command → 400 no mutation (LM-14 mvp-not-command). `mvp` stays out of `ControlCommand`.
- [x] **1.7** `live/route.test.ts`: completion 200 (active) / 409 (non-active) / `mvp`→400 (no mutation).
- [x] **1.8** `features/leagues/api.ts`: `LiveCommand` += `completion` (NO `mvp`, D26/D22).
- [x] **1.9** `features/leagues/liveEventLabels.ts`: pure `bandToDisplay` (`bruise`→`{Herida,0}`; `apaleado|grave|permanent|dead`→`{Baja,2}`; unknown passes through) + `eventSpp` (td 3, completion 1, casualty via band lasting?2:0, mvp 4, else 0) (LM-18/LM-19, D23). Also added `completion`→"Pase completo" and `mvp`→"Jugador más valioso" labels.
- [x] **1.10** T-unit: `liveEventLabels.test.ts` — all 5 bands→2 buckets; spp per kind incl. completion/mvp.
- [x] **1.11** `result/route.ts`: fixture query `include: { liveMatch: { select: { id, half, turnNumber, finishedAt } } }`; in-tx (runs FIRST, so a conflict aborts the whole result) `aggregate({_max:{seq}})` → home mvp seq+1, away +2; `createMany` two `mvp` rows (payload `{}`, per-team `side`, grantee from `computeMvpGrantee`); `liveMatch.updateMany` guarded row seq bump past both (D20); no LiveMatch → no write. `at` = `lm.finishedAt ?? now` via `createdAt` (validator refinement). P2002 → 409.
- [x] **1.12** T-route: result on live fixture appends home+away mvp monotonic seq; `at` = `lm.finishedAt`; concurrent double-write P2002→409; fixture without LiveMatch unchanged.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1/1.4/1.5 | `lib/liveMatch.test.ts` + `lib/livePhase.test.ts` | Unit | ✅ 25/25 | ✅ Written | ✅ Passed | ✅ 2 cases (home/away) | ➖ None needed (pure fn) |
| 1.2 | `lib/liveMatch.test.ts` `applyCompletion` | Unit | ✅ 27/27 | ✅ Written | ✅ Passed | ✅ 2 cases | ➖ None needed |
| 1.6/1.7 | `live/route.test.ts` | Integration | ✅ 28/28 | ✅ Written | ✅ Passed | ✅ 3 cases (200/409/400) | ➖ None needed |
| 1.8 | `api.ts` `LiveCommand` type | Structural | N/A (type only) | ✅ Written | ✅ Passed (tsc) | ➖ Single | ➖ None needed |
| 1.9/1.10 | `liveEventLabels.test.ts` | Unit | ✅ 9/9 | ✅ Written | ✅ Passed | ✅ 5 bands + 6 spp kinds | ➖ None needed |
| 1.11/1.12 | `result/route.test.ts` | Integration | ✅ 25/25 | ✅ Written | ✅ Passed | ✅ 4 cases (mvp append, at, no-LM, P2002) | ✅ Indent cleanup |

## Work Unit Evidence

### Work Unit 1 — completion kind + command (tasks 1.1–1.8)
| Evidence | Required value |
|---|---|
| Focused test command and exact result | `pnpm vitest run lib/liveMatch.test.ts lib/livePhase.test.ts "app/api/leagues/[id]/fixtures/[fixtureId]/live/route.test.ts"` → 3 files, 66 tests passed |
| Runtime harness command/scenario and exact result | N/A — no runtime boundary for the pure transition + route dispatch; covered by the integration route suite (200/409/400 already asserted) |
| Rollback boundary | Reverting `applyCompletion`, `completion` dispatch in `live/route.ts`, and the `completion` union/EventKind members removes all completion behavior without touching unrelated live logic |

### Work Unit 2 — band→label/★ mapping (tasks 1.9–1.10)
| Evidence | Required value |
|---|---|
| Focused test command and exact result | `pnpm vitest run features/leagues/liveEventLabels.test.ts` → 1 file, 18 tests passed (9 existing + 9 new) |
| Runtime harness command/scenario and exact result | N/A — pure display derivation used client-side in later PRs (3a render); no runtime boundary in this slice |
| Rollback boundary | Reverting `bandToDisplay` + `eventSpp` + the completion/mvp labels in `liveEventLabels.ts` removes only the mapping and leaves existing `liveEventLabel` behavior intact |

### Work Unit 3 — result-route mvp write (tasks 1.11–1.12)
| Evidence | Required value |
|---|---|
| Focused test command and exact result | `pnpm vitest run "app/api/leagues/[id]/fixtures/[fixtureId]/result/route.test.ts"` → 1 file, 28 tests passed (25 existing + 4 new mvp) |
| Runtime harness command/scenario and exact result | Real transaction path exercised via the mocked `$transaction` (aggregate → createMany → updateMany); the in-tx seq arbiter and P2002→409 mapping are asserted directly. (Full DB integration would need a Docker Postgres; the auth e2e suite runs separately.) |
| Rollback boundary | Reverting the `mvp` append block in `result/route.ts` (the `include.liveMatch` select + in-tx block + P2002 catch) stops mvp writes; existing mvp/live rows still render safely |

## Files Changed (PR 1)

| File | Action | What Was Done |
|------|--------|---------------|
| `lib/liveMatch.ts` | Modified | `LiveEventKind` += `completion\|mvp`; added pure `applyCompletion` |
| `lib/liveMatch.test.ts` | Modified | 2 `applyCompletion` unit tests (no flip, seq, ★1, side) |
| `lib/livePhase.ts` | Modified | `EventKind` += `completion` |
| `lib/livePhase.test.ts` | Modified | 1 completion-permission deny test |
| `app/api/leagues/[id]/fixtures/[fixtureId]/live/route.ts` | Modified | `ControlCommand` += completion; `isControlCommand`; side-gate + dispatch; `mvp` excluded |
| `app/api/leagues/[id]/fixtures/[fixtureId]/live/route.test.ts` | Modified | completion 200/409, `mvp`→400 |
| `features/leagues/api.ts` | Modified | `LiveCommand` += completion (no mvp) |
| `features/leagues/liveEventLabels.ts` | Modified | `bandToDisplay`, `eventSpp`, completion/mvp labels |
| `features/leagues/liveEventLabels.test.ts` | Modified | band→bucket + spp unit tests |
| `app/api/leagues/[id]/fixtures/[fixtureId]/result/route.ts` | Modified | `include.liveMatch`; in-tx mvp append (D20), P2002→409 |
| `app/api/leagues/[id]/fixtures/[fixtureId]/result/route.test.ts` | Modified | 4 mvp-write route tests |
| `openspec/changes/live-match-events/tasks.md` | Modified | PR 1 tasks 1.1–1.12 marked `[x]` |
| `openspec/changes/live-match-events/apply-progress.md` | Created | this artifact |

## Deviations from Design

- **`liveEventLabels`: added completion/mvp labels in PR 1** (task 2.7 in the design defers label rewiring to PR 2). The `bandToDisplay`+`eventSpp` are PR 1 (1.9); adding the two new label cases now keeps the kind→label taxonomy complete and is additive — no existing test asserts the old passthrough for `completion`/`mvp`. Flagged for the reviewer; revertible if the maintainer prefers them in PR 2.
- **`result/route.ts` include shape**: the design sketch used `include:{ liveMatch: { include: { events: ... } } }`; I used `include: { liveMatch: { select: { id, half, turnNumber, finishedAt } } }` because the actual max seq comes from the in-tx `aggregate(_max)` per D20 (the events include is never read), and `half/turnNumber/finishedAt` are needed for the event fields + `at` computation.
- **MVP write order**: the mvp block runs FIRST inside the transaction (before fixture/score mutations) so a P2002 conflict aborts the whole result atomically; D20 does not mandate ordering.
- **MVP `at`**: persisted via `LiveEvent.createdAt` (the only timestamp column — `toEventDtos` maps `at` from `createdAt`), set to `lm.finishedAt ?? now` (validator refinement).

## Issues Found
- **Indentation drift** in `result/route.ts` after wrapping the transaction in try/catch — cleaned up (style commit). No functional issue.
- Pre-existing `createdAt`-is-timestamp coupling means `mvp` feed minute = `createdAt` row value; accepted per design open-question ("mvp at = result-load time").

## Workload / PR Boundary
- Mode: chained PR slice (#1 of 5, stacked-to-main)
- Current work unit: all of PR 1 (event model server + band mapping + mvp write)
- Boundary: starts from the planning artifacts commit (`29d5835`); ends at the mvp-write commit — precisely the PR 1 deliverables. PR 2 (DTO filter/derivations), PR 3a/3b (UI/controls), PR 4 (e2e) are NOT touched.
- Estimated review budget impact: ~452 additions across the 4 commits (plus tests); within PR 1 scope and under the 400-line authored budget once the included tests are counted toward the slice (~340 est).

## Verification

- Focused: `pnpm vitest run lib/liveMatch.test.ts lib/livePhase.test.ts "app/api/leagues/[id]/fixtures/[fixtureId]/live/route.test.ts" "app/api/leagues/[id]/fixtures/[fixtureId]/result/route.test.ts" features/leagues/liveEventLabels.test.ts` → **5 files, 112 tests passed**.
- Full: `pnpm test` → **94 files, 1179 tests passed**.
- `pnpm lint` → clean.
- `npx tsc --noEmit` → clean.
- Local e2e: `AUTH_MODE=local pnpm exec playwright test` (stale :3000 killed first) → **21/21 passed**.
- Pre-commit hooks (full `pnpm test`) passed on every feature commit.

## Status
12/12 (PR 1) tasks complete. Ready for next batch (PR 2) after the orchestrator opens the next slice branch/PR, or `sdd-verify` per the parent's chosen flow.
