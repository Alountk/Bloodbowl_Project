# Tasks: incentive-chips — Pre-Match Inducement Purchase + Per-Team Feed Chips

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1,400 (S1 ~350 · S2 ~380 · S3 ~330 · S4 ~340) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (S1) → PR 2 (S2) → PR 3 (S3) → PR 4 (S4) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Catalog + column + purchase command | PR 1 | `pnpm test lib/rules/inducements.test.ts liveStore.test.ts` | N/A (pure module + store unit tests) | Revert S1; new `LiveMatch.inducements` column stays null |
| 2 | Ready purchase UI + i18n | PR 2 | `pnpm test MatchView.test.tsx` | `AUTH_MODE=local pnpm exec playwright test` (ports busy in this env → documented) | Revert S2 UI + i18n keys |
| 3 | Snapshot carry (3 paths) + PUT copy-forward | PR 3 | `pnpm test result/route.test.ts` | N/A (route/store unit tests) | Revert S3; prior rows untouched |
| 4 | Feed per-team rows + chips + pinned tests | PR 4 | `pnpm test matchSummary.test.ts MatchView.test.tsx` | N/A (component tests) | Revert S4; legacy single-row fallback |

## Phase 1: Catalog + LiveMatch column + purchase command (S1)

- [x] 1.1 Create `lib/rules/inducements.ts` — `COMMON_INDUCEMENTS` (16 BB2025 entries), `RACE_SPECIAL_RULES`, `NO_APOTHECARY_RACES`, `getInducement`, `effectiveCost`, `isEligible`, `budgetForSide`, `validateCart` (IND-1/IND-5). Exclude `mercenaries` (id reserved); `wizard` base 150k + `wizard-type` marker.
- [x] 1.2 RED `lib/rules/inducements.test.ts` — lookup; effectiveCost goblin bribes=50k; eligibility orc/plague-doctor false; budgetForSide 1200k/1050k→away 150k, equal→0; validateCart over-budget/limit/unknown/race (IND-1..3, IND-5).
- [x] 1.3 Add `inducements Json?` to `LiveMatch` in `prisma/schema.prisma` (after `journeymen`); run `pnpm db:generate`.
- [x] 1.4 Add `purchaseInducements` store fn in `lib/liveStore.ts` — ready guard, lower-TV budget via `raceTvParts`+`computeTeamTv`, `validateCart`, replace-cart `updateMany` seq bump, `persistAndPublish` (LM-30).
- [x] 1.5 Add command to `ControlCommand` + `isControlCommand` + dispatch in `app/api/leagues/[id]/fixtures/[fixtureId]/live/route.ts` (LM-2 gate 403/404; non-ready 409; non-eligible side 409); expose `inducements` in `toLiveViewState`/`LiveMatchViewState` + `LiveMatchView` + `MatchScoreboard` in `features/leagues/api.ts`.
- [x] 1.6 RED `liveStore.test.ts` + `route.test.ts` — ready guard, lower-TV guard, replace-cart, seq 409, hub publish, 200 cart-in-view.

## Phase 2: Ready purchase UI + i18n + e2e (S2)

- [x] 2.1 Add ready-phase purchase UI in `features/leagues/MatchView.tsx` — eligible side only, remaining budget, add/remove per `maxPerMatch`, confirm (IND-3/LM-30).
- [x] 2.2 Add ES/EN purchase + chip labels in `lib/i18n/dictionaries.ts`.
- [x] 2.3 Component test `MatchView.test.tsx` — purchase UI enabled/disabled + error states.
- [x] 2.4 E2E Playwright — lower-TV coach buys in ready → close → per-team chips render; `AUTH_MODE=local` (ports busy in this env → document; run when env permits).

## Phase 3: Snapshot carry + PUT copy-forward (S3)

- [x] 3.1 Add `buildInducementSnapshot(row, homeTeam, awayTeam)` helper in `lib/liveStore.ts` — per-side `{budget, cards:[{name,count}]}`.
- [x] 3.2 Wire into `resolveLiveMatch` scoreboard (`scores.home/away.inducements`).
- [x] 3.3 Wire into `runWizardClose` (identical shape).
- [x] 3.4 Wire result POST in `app/api/leagues/[id]/fixtures/[fixtureId]/result/route.ts` — carry snapshot when `fixture.liveMatch` has cart.
- [x] 3.5 PUT correction copy-forward `inducements` like `winnings` in `result/route.ts` (forward-only).
- [x] 3.6 Parity tests — 3 paths identical `{budget,cards}`; correction preserves; legacy row untouched (`result/route.test.ts` + liveStore resolve tests).

## Phase 4: Feed per-team rows + chips + pinned tests (S4)

- [x] 4.1 Extend `SummaryFeedRow` + `buildSummaryFeedRows` in `features/leagues/matchSummary.ts` — per-team incentives (budget+cards) + legacy single-row fallback (MVT-4).
- [x] 4.2 Update `SummaryFeedRowView` incentives case + `key` (type+side) in `features/leagues/MatchView.tsx`; chip pill `2× Sobornos` (IND-4).
- [x] 4.3 Update pinned `matchSummary.test.ts` + `MatchView.test.tsx` assertions (per-team rows; walkover omit; MVP not duplicated).
