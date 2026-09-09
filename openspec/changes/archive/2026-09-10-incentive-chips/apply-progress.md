# Apply Progress: incentive-chips — Slices S1 + S2 + S3 + S4 (PR 1–4, Phases 1–4)

Mode: Strict TDD · Branches: `feat/incentive-chips-s2` (S1+S2, merged via PRs #198–#202) → `feat/incentive-chips-s3` (S3, merged via PRs #203–#204) → `feat/incentive-chips-s4` (this batch, S4 FINAL over main @ 5c6d206) · S4 commits: 1 (below). NO push, NO PR opened.

## Completed Tasks

### Phase 1 / S1 (merged via PRs #198–#200; kept here for the cumulative record)

- [x] 1.1 `lib/rules/inducements.ts` — pure client-safe catalog module (16-entry IND-1 table incl. reserved `mercenaries` marked `dynamicCost`), `RACE_SPECIAL_RULES` (8 races), `NO_APOTHECARY_RACES` (empty — IND-5 verification debt), `getInducement`, `listInducements`, `raceRules`, `effectiveCost`, `isEligible`, `budgetForSide`, `maxAllowed`, `validateCart`, `parsePersistedInducements`, `emptyPersistedInducements`.
- [x] 1.2 RED→GREEN `lib/rules/inducements.test.ts`.
- [x] 1.3 `LiveMatch.inducements Json?` + additive migration.
- [x] 1.4 `purchaseInducements` store fn (ready guard, server-TV budget, validateCart, replace-cart seq-guarded `updateMany`, hub publish).
- [x] 1.5 Route wiring + DTO/SSE exposure (`toLiveViewState` `opts.inducements`, client `LiveCommand.purchaseInducements`, `LiveMatchViewState.inducements?`, `MatchScoreboard.inducements?`).
- [x] 1.6 RED tests — `liveStore.test.ts` + `live/route.test.ts`.

### Phase 2 / S2 (commits `eec9326` + `1658e14`, merged via PRs #201–#202)

- [x] 2.1 Ready-phase purchase UI in `features/leagues/MatchView.tsx` — `InducementPurchasePanel` (visible ONLY to the lower-TV coach while `ready`, budget > 0, via the server-derived `inducementBudget` on the fixture GET; the rival/spectator/equal-TV never see it). Shows the budget, the race-filtered catalog with per-race EFFECTIVE cost (race-gated entries excluded), add/remove with `maxPerMatch` + disabled-at-max feedback, Σ spent + remaining (over-budget blocks confirm, `role=alert`), confirm → live `purchaseInducements` `{side, items}` replace-cart; an existing persisted cart renders with the "Reemplazar incentivos" affordance. Rulebook-light tokens; Spanish copy. Pending/error/success via disabled button + `role=status`/`role=alert` (a11y).
- [x] 2.2 ES/EN i18n keys under `match.inducements.*` (title, budget, remaining/spent, add/remove, quantity `{count}× {name}`, empty/noneForRace, confirm/replace, purchasing, over-budget, max-reached, cart, notEligible) — key-for-key sync (the i18n test asserts `enKeys == esKeys`).
- [x] 2.3 Component tests `MatchView.test.tsx` (+8): eligible-coach-only render (ready + positive budget), rival/spectator hidden, live-status hidden, equal-TV hidden, add/remove with maxPerMatch + over-budget blocking + alert, confirm fires the exact `purchaseInducements` POST body, persisted cart shows with replace, server rejection surfaces as an a11y alert.
- [x] 2.4 E2E documented (NOT executed — environment limitation): `e2e/inducement-purchase.spec.ts` (auth suite only; wired into `playwright.config.auth.ts` testMatch and ignored in the local config). This machine's :3000 (dev server) and :5433 (Postgres) ports are occupied, so Playwright's own `next dev` cannot boot. The spec documents the intended real-DB flow (lower-TV coach buys in ready → reload shows the persisted cart + Reemplazar → begin still works); component/integration tests are the S2 verification here. Run when the environment permits: `pnpm run test:e2e:auth`.

### Phase 3 / S3 (this batch — commits `0796f94` + `767baf8`, branch `feat/incentive-chips-s3`)

- [x] 3.1 Shared `buildInducementSnapshot(row, homeTeam, awayTeam)` helper in `lib/liveStore.ts` (exported) — the ONE helper the 3 close builders call: given the persisted per-side cart (id+count) + the two team rows it produces per-side `{budget, cards:[{name,count}]}` with ES display NAMES resolved from the catalog at close time (snapshot standalone, IND-4). Budget = the side's |ΔTV| entitlement (IND-2, mirrors the purchase command derivation over the same team rows); cart absent/empty/malformed → `null` both sides (builders omit the key — legacy rows untouched); non-empty cart on a zero-budget side → defensive `{budget:0, cards}`; unknown race → value-bonus-only TV fallback; unknown catalog id → raw-id name fallback.
- [x] 3.2 Wired into the `resolveLiveMatch` LEGACY close scoreboard — conditional `...(inducements.home/away ? { inducements } : {})` spread so `scores.home|away.inducements` persist exactly when a cart exists.
- [x] 3.3 Wired into `runWizardClose` (identical conditional spread — same helper → parity by construction).
- [x] 3.4 Result POST (`result/route.ts`) — the `liveMatch` select now carries `inducements`; when a live row exists the POST calls the SAME helper and spreads the per-side snapshot into the scoreboard (classic/legacy fixture without a live row → no key).
- [x] 3.5 PUT copy-forward — `inducements` added to the forward-only copy list exactly like `winnings` (`prevScores?.home/away?.inducements != null ? { inducements } : {}`); `prevScores` type widened.
- [x] 3.6 Parity tests — helper unit suite (7: cart→ES names, home-side, absent→omit, empty→omit, budget-0 defensive, unknown-race/id fallback, malformed→omit); per-path tests assert the IDENTICAL `{budget:150000, cards:[{name:"Mago",count:1}]}` on the away side for all 3 builders (legacy resolve, wizard close, result POST) + no-key legacy tests on every path + PUT preserves + PUT omit-if-absent.

### Phase 4 / S4 (this batch — commit `656fbcc`, branch `feat/incentive-chips-s4`)

- [x] 4.1 `features/leagues/matchSummary.ts` — the `SummaryFeedRow` incentives variant is now PER-SIDE: `{ type: "incentives"; team: "home"|"away"; budget: number; cards: {name,count}[] }`. `buildSummaryFeedRows` reads `scores.home|away.inducements` (the S3 per-side snapshot): when ANY side carried an entry it emits BOTH team rows — the side WITH an entry shows its `{budget, cards}`, the side WITHOUT shows its (zero) budget and no chips (MVT-4 scenario "per-team incentive chips render": buyer 150k + "2× Sobornos", other side zero/no chips). When NEITHER side has an entry but the legacy top-level `pettyCash` exists, the original single home-assigned row is emitted with `cards: []` (backward-compatible fallback — legacy rows / already-played matches keep rendering, never crash). Walkover (result null) still returns `[]`; MVP stays event-derived.
- [x] 4.2 `features/leagues/MatchView.tsx` — `SummaryFeedRowView` case "incentives" renders per row: `💰` icon, "Incentivos" label, `{names[team]}: {formatCoins(budget)}` line, and — when `cards` is non-empty — chip pills styled rulebook-light (`rounded-full border border-border bg-panel px-2 py-0.5 text-[10px] font-bold text-navy`) with the `{count}× {name}` text via the existing `match.inducements.quantity` i18n key (e.g. "2× Sobornos", IND-4). Legacy fallback rows (`cards: []`) render the amount with NO chips. `SummaryFeedRows` row key is now `type+side` for incentives (`incentives-home`/`incentives-away`) so two per-team rows never collide (was `key={row.type}` → duplicate-key warning).
- [x] 4.3 Pinned tests DELIBERATELY updated + new coverage: `matchSummary.test.ts` — the legacy fixture now expects the single `{team:"home", budget:150_000, cards:[]}` row; new tests for (a) away-carried entry → home zero row + away `{budget:150_000, cards:[{name:"Sobornos",count:2}]}` row, (b) BOTH sides carrying their own entries → no zero synthesis, each row carries its own data. `MatchView.test.tsx` — the pinned "Incentivos 150.000" assertion updated (legacy fixture: exactly ONE Incentivos row containing "150.000" and NO "×" chip marker); new render tests for (a) per-team chips (2 Incentivos rows; home "Reavers" zero/no chips, away "Dwarves" 150.000 + chip "2× Sobornos"), (b) unique keys: with two per-team rows the render logs NO React "same key" warning (console.error spy) and both chips (Mago/Sobornos) render.

## TDD Cycle Evidence (S4 batch)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 4.1 + 4.3 (unit) | features/leagues/matchSummary.test.ts | Unit | ✅ 22/25 baseline | ✅ 3 failed (legacy single row expected `value` → per-side `budget`+`cards`; per-team rows absent) | ✅ 25/25 | ✅ legacy fallback + single-side entry (zero synthesis for other side) + both-sides entries (own data) | ✅ row union member narrowed to per-side team/budget/cards |
| 4.2 + 4.3 (component) | features/leagues/MatchView.test.tsx | Component | ✅ 80/82 baseline | ✅ 16 failed (`row.value` undefined after type change → renderer crash) | ✅ 82/82 | ✅ legacy single row (no chips) + per-team chips (2 rows, budget + "2× Sobornos") + duplicate-key spy | ✅ `rowKey` helper (type, or type+team for incentives) |

## Test Summary

- S2 batch: 17 tests added; full suite 169 files / 2439 passed.
- S3 batch: 15 tests added (7 helper + 2 resolve + 2 wizard + 2 POST + 2 PUT); full suite `pnpm test` → 170 files / 2454 passed / 0 failed.
- S4 batch: 5 tests added (3 matchSummary unit net of the 1 rewritten pinned test + 2 MatchView component net of the 1 rewritten pinned assertion); full suite `pnpm test` → 170 files / 2458 passed / 0 failed.
- `npx tsc --noEmit` → clean (all batches) · `pnpm lint` → clean (0 errors, 0 warnings).

## TDD Cycle Evidence (S2 batch)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 2.1 (pure budget helper) | lib/rules/inducements.test.ts | Unit | ✅ 31/31 | ✅ Written (missing `inducementBudgetOf`/`cartCost`) | ✅ 38/38 | ✅ 4+3 cases (roster/coaching/valueBonus math) | ✅ shared `InducementTeamRow`/`InducementBudget` types |
| 2.1 (fixture GET cart+budget) | route.test.ts | Integration | ✅ 27/27 | ✅ Written (fields missing) | ✅ 29/29 | ✅ ready-cart + legacy-null + derived-budget | ✅ budget computed once in GET handler |
| 2.1/2.3 (purchase UI) | MatchView.test.tsx | Integration | ✅ 72/72 | ✅ Written (panel missing) | ✅ 80/80 | ✅ 8 cases (gates, budget math, POST body, alerts) | ✅ draft-state/sync simplified to single source |
| 2.2 (i18n) | i18n.test.tsx (sync) + MatchView tests | Integration | ✅ green | ➖ keys-first (ES/EN added before UI) | ✅ key-sync 16/16 | ✅ keys exercised by UI tests | ➖ N/A |

## TDD Cycle Evidence (S3 batch)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 3.1 (helper) | lib/liveStore.inducements.test.ts | Unit | ✅ 2439 suite baseline | ✅ 7 failed (missing export) | ✅ 7/7 | ✅ 7 cases (cart/absent/empty/budget-0/unknown/malformed) | ✅ typed interfaces (InducementSnapshotSide/Team) |
| 3.2 (legacy resolve) | lib/liveStore.resolve.test.ts | Integration | ✅ 25/25 | ✅ 1 failed (key missing) | ✅ 27/27 | ✅ cart + no-cart legacy | ➖ N/A |
| 3.3 (wizard close) | lib/liveStore.wizard.test.ts | Integration | ✅ 23/23 | ✅ 1 failed (key missing) | ✅ 25/25 | ✅ cart parity + no-cart | ➖ N/A |
| 3.4 (result POST) | result/route.test.ts | Integration | ✅ 37/37 | ✅ 1 failed (no key in create) | ✅ 39/39 | ✅ cart + no-cart | ✅ liveMatch select widened |
| 3.5 (PUT copy-forward) | result/route.test.ts | Integration | ✅ 39/39 | ✅ 1 failed (key dropped) | ✅ 41/41 | ✅ preserves + omit-if-absent | ✅ prevScores type widened |
| 3.6 (parity) | all four files | Unit+Integration | n/a (built into rows above) | ✅ same-input per path | ✅ same shape asserted per path | ✅ identical literal across 3 paths | ➖ N/A |

## Test Summary

- S2 batch: 17 tests added; full suite 169 files / 2439 passed.
- S3 batch: 15 tests added (7 helper + 2 resolve + 2 wizard + 2 POST + 2 PUT); full suite `pnpm test` → 170 files / 2454 passed / 0 failed.
- `npx tsc --noEmit` → clean (both batches) · `pnpm lint` → clean (0 errors, 0 warnings).

## Commands Observed (S3 batch)

- `pnpm vitest run lib/liveStore.inducements.test.ts` → RED 7 failed (missing export) → GREEN 7/7
- `pnpm vitest run lib/liveStore.resolve.test.ts lib/liveStore.wizard.test.ts` → RED (keys missing) → GREEN 27/27 + 25/25
- `pnpm vitest run app/api/leagues/[id]/fixtures/[fixtureId]/result/route.test.ts` → RED (1 POST + 1 PUT) → GREEN 41/41
- `pnpm test` → Test Files 170 passed, Tests 2454 passed (pre-commit hook ran the full suite on each commit)
- `npx tsc --noEmit` → clean · `pnpm lint` → clean
- e2e: NOT applicable (no e2e scope in S3 — route/store unit+integration tests cover the 3 close paths)

## Commands Observed (S4 batch)

- `pnpm vitest run features/leagues/matchSummary.test.ts features/leagues/MatchView.test.tsx` → baseline GREEN (2 files / 103 passed)
- `pnpm vitest run features/leagues/matchSummary.test.ts` → RED 3 failed (per-team incentives expectations) → GREEN 25/25
- `pnpm vitest run features/leagues/MatchView.test.tsx` → RED 16 failed (`row.value` renderer crash after the type change) → GREEN 82/82
- `pnpm test` → Test Files 170 passed, Tests 2458 passed (pre-commit hook re-ran the full suite on the commit)
- `npx tsc --noEmit` → clean (exit 0) · `pnpm lint` → clean (0 errors, 0 warnings)
- e2e: NOT applicable (S4 is a pure feed-render slice — component tests cover the render + key uniqueness; no e2e scope in the S4 tasks)

## Commits (conventional work units)

S2 batch: `eec9326` feat(rules): derive ready-phase inducement budget and expose cart on fixture GET (IND-2/LM-30) · `1658e14` feat(match): add ready-phase inducement purchase step for the lower-TV coach (LM-30/S2)

S3 batch:
1. `0796f94` feat(live): carry per-side inducement snapshot on live close paths (LM-30/S3) — helper + resolveLiveMatch legacy + runWizardClose wiring + helper unit tests + path parity tests.
2. `767baf8` feat(result): persist inducement snapshot on result POST and copy it forward on PUT (LM-30/S3) — POST liveMatch select + scoreboard spread; PUT forward-only copy.

S4 batch:
1. `656fbcc` feat(feed): render per-team Incentivos rows with chip pills in the finished feed (LM-30/S4) — per-side `SummaryFeedRow` incentives variant + `buildSummaryFeedRows` per-team emission with zero-row synthesis and legacy pettyCash fallback; `SummaryFeedRowView` team-labeled rows with chip pills + type+side keys; pinned + new unit/component tests.

## Workload / PR Boundary (S3)

- Mode: chained PR slice (feature-branch chain S1→S4, per design slices).
- Boundary: S3 starts at main @ 7ad7e46 (S1+S2 merged) and ends at the 2 commits above; S4 (feed per-team rows + chips) is NOT included.
- Authored delta over main: 453 additions + 7 deletions = 460 lines (> 400-budget → recommend `size:exception` OR split into 2 PRs at the 2-commit seam — commit 1 is a self-contained live-close unit, commit 2 the result-route unit).

## Workload / PR Boundary (S4)

- Mode: chained PR slice (feature-branch chain S1→S4, per design slices) — FINAL slice.
- Boundary: S4 starts at main @ 5c6d206 (S1+S2+S3 merged via PRs #198–#204) and ends at the single commit `656fbcc` above.
- Authored delta over main: 182 additions + 26 deletions = 208 changed lines (within the 400-line review budget — single PR 4 candidate, no `size:exception` needed).
- Rollback: revert `656fbcc` → the feed falls back to the S1-era single-row incentives rendering path shape; the S3 snapshot keys (`scores.*.inducements`) and purchase flow are untouched.

## Deviations from Design

S2 batch:
- The design sketched the ready budget as "the command computes it server-side; the client shows what the DTO exposes." S1 shipped the purchase command WITHOUT exposing the eligible side/budget on any read path, so S2 (per the launch tolerance) extended the FIXTURE GET: `serializeLive` now exposes the persisted cart (`inducements`) and the GET handler attaches the server-derived `inducementBudget` (computed over the loaded team rows via the new pure `inducementBudgetOf`, mirroring the store's raceTvParts+computeTeamTv+budgetForSide). The fixture-GET-only placement mirrors the `journeymen`/`mvpGrantees` convention (stable per fixture; SSE hub frames omit both, so the UI reads the fixture DTO, never the churning `state` merge).
- The purchase step is a discrete sub-panel BELOW the consent panel (same ready body), not a replacement of it — `begin` stays reachable regardless of the cart, matching LM-30 "begin works with an empty cart or zero budget."
- The e2e task (2.4) was satisfied as a documented, wired auth-suite spec rather than an executed run: the environment cannot boot Playwright's dev server (ports busy) — a documented limitation, not a scope cut.

S3 batch:
- The helper signature follows tasks.md 3.1 (`buildInducementSnapshot(row, homeTeam, awayTeam)` in `lib/liveStore.ts`) — the design decision row only named the shared helper, so placement follows the tasks artifact + design File-Changes row (`lib/liveStore.ts`). The result route imports it from `@/lib/liveStore` (no cycle: liveStore never imports the route).
- Snapshot `budget` is the side's |ΔTV| entitlement recomputed at close over the same team rows (equal to the purchase-time budget because teams do not change mid-match) — the snapshot is standalone and does not read the LiveMatch row's transient state. An empty/absent cart yields NO `inducements` key at all (spec "legacy row untouched": no key invented); the S4 match-view spec's "other side shows its (zero) budget" is S4's rendering concern over the absent field.
- The helper unit suite lives in a new `lib/liveStore.inducements.test.ts` (pure function over row+team-row inputs — no harness needed), matching the repo's `liveStore.*.test.ts` per-concern convention.

S4 batch:
- The S3 close builders write a per-side `inducements` key ONLY on the side that actually bought (the other side has NO key). `buildSummaryFeedRows` treats that absent key as the buyer's opponent showing its (zero) budget with no chips — the literal MVT-4 scenario 2 reading, exercised by the new unit test where only `scores.away.inducements` exists.
- The `value` → `budget` field rename on the legacy fallback row keeps the rendering IDENTICAL for already-played matches (single home row, same `formatCoins` amount) — the legacy fallback now goes through the SAME per-side row shape with `cards: []`, so the renderer has exactly one "incentives" branch.
- No i18n dictionary change was needed: the chip pill text reuses the existing `match.inducements.quantity` key (`{count}× {name}` → "2× Sobornos"), which is already ES/EN-synced.
- MVT-4 pinned e2e (`e2e/live-match.spec.ts:871-887`) still passes by construction: that scenario closes a match with NO inducement purchase → legacy single-row fallback → the `summary-row`/`Incentivos` filters match exactly one row. The chip render path is covered by component tests (the S2 e2e spec `inducement-purchase.spec.ts` already defers chip assertions to this render slice — still documented, not executed).

## Risks

- The fixture GET now computes team TV per request (roster + coaching cost derivation) whenever a live row exists. It is a read-only derivation over rows the GET already loads (`coaching` was added to the select) — small constant cost, no extra query.
- The persisted-cart read in the UI prefers `state.inducements` (SSE-fresh, set by the purchase POST view + snapshot) and falls back to the fixture GET cart; a hub frame of an unrelated transition still omits the cart (S1 row-extra convention) — the fixture GET covers reloads.
- `inducementBudgetOf` mirrors the store's TV derivation; the store's private `raceTvParts` was NOT refactored to share it (avoided churn in S2). The result route keeps its own copy. A follow-up could deduplicate the three TV derivations behind the new pure helper.
- The result route now imports `@/lib/liveStore` (for the shared snapshot helper). Server-side only, no circular import; verified by tsc + the full suite.
- Auth e2e spec is written but unexecuted in this environment — first `pnpm run test:e2e:auth` run on a free-port machine/CI validates it.
- IND-5 verification debt (NO_APOTHECARY_RACES empty; wizard per-race types) remains open from S1 — the purchase UI ships with the documented base rules.

S4 batch:
- The MVT-4 pinned e2e assertion `summary-row` filtered by "Incentivos" expects a single row in its no-purchase scenario; a match where the lower-TV coach bought WILL render 2 Incentivos rows (home zero + away chips). The e2e spec `live-match.spec.ts` closes a match without inducements, so it stays green — but any future e2e that buys inducements and then asserts a single "Incentivos" row must switch to per-team assertions.
- The `value` → `budget` rename is internal to the feed row union; the persisted `pettyCash`/`inducements` snapshot shapes are untouched, so no DB/data compatibility impact.
- Chip text reuses the inducements `quantity` i18n key; if the snapshot ever carries a non-ES display name (raw-id fallback from S3), the chip shows the raw id — matches the S3 fallback contract, not a render bug.

## Rollback Boundary

S3: revert `767baf8` then `0796f94` in order — the result-route snapshot carry/copy-forward disappears, then the liveStore helper + live-close wiring; prior MatchResult rows are untouched (additive JSON keys only). S2/S1 reverts are independent (see the S2 apply-progress report in Engram #788).

S4: revert `656fbcc` — the finished feed returns to the single-row `pettyCash` incentives rendering; the S3 per-side snapshot keys and the S2 purchase UI are untouched. No migration, no data change (pure render/type layer over existing additive snapshot JSON).
