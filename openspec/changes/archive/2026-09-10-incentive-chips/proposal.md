# Proposal: incentive-chips — Pre-Match Inducement Purchase + Per-Team Feed Chips

## Intent

Issue #98: the feed's "Incentivos" row hardcodes `{team:"home"}` with no cards; chips have no data source and no purchase flow exists. Add a rules-faithful pre-match purchase (LiveMatch `ready`) plus snapshot-derived per-team rows with structured chips `{name,count}` (`2× Soborno`), per the v7 preview.

## Scope

**In**: structured catalog with gp costs (v7 cards seeded) · ready-phase purchase, lower-TV coach only (budget = |ΔTV|; equal → 0) · cart on LiveMatch, carried to MatchResult at close across all 3 scoreboard paths + PUT copy-forward · ready purchase UI + per-team feed rows with chips.

**Out**: engine effects · higher/equal-TV purchases, treasury top-ups, resolve/in-match buying · full rulebook catalog · purchase timeline events (MV-6) · chips on classic non-live results (budget rows only) · legacy-snapshot backfill (single-row fallback stays).

## Capabilities

**New — inducements**: catalog (id, display name, cost gp), lower-TV eligibility/budget, cart validation, chip model.

**Modified**:
- **live-match-realtime**: `purchaseInducements` command valid only in `ready`; DTO exposes cart; begin unchanged.
- **match-result**: snapshot persists per-side `inducements` on result POST, resolveLiveMatch, runWizardClose; PUT preserves it.
- **match-view**: MVT-4 "Incentivos" per eligible team with budget + chips (code catches up to spec's per-team wording).

## Approach

Pure `lib/rules/inducements.ts` (client-safe, mirrors `winnings.ts`). New command `purchaseInducements` with `{id,count}[]` — replace-cart semantics, seq-guarded, restricted to the fixture coach of the lower-TV side while `ready` (403/404 parity); ids must exist and Σcost ≤ budget (TV server-side via `raceTvParts`/`computeTeamTv`). Cart stored in a new additive `LiveMatch.inducements Json?` column (row-scoped, like `winnings`/`journeymen`). At close the 3 builders copy per-side `{budget, cards}` into `scores.home|away.inducements` (additive JSON — no MatchResult migration); names resolve at close so the snapshot renders standalone. PUT correction copies it forward like winnings.

## Slices (chained PRs; 400-line risk: High)

| # | Scope | Est. |
|---|-------|------|
| S1 | Catalog + LiveMatch column + command + tests | ~350 |
| S2 | Ready purchase UI + e2e | ~380 |
| S3 | Snapshot carry + per-team split (3 paths + PUT) | ~330 |
| S4 | Feed per-team rows + chips + tests | ~340 |

Chain S1→S2→S3→S4; render (S4) waits on S3. Total ≈ 1.4k lines → chain recommended.

## Affected Areas

`lib/rules/inducements.ts` (new) · `prisma/schema.prisma` LiveMatch · `lib/liveStore.ts` (resolveLiveMatch, runWizardClose, dispatch) · `features/leagues/api.ts` (LiveCommand, DTO, MatchScoreboard) · `result/route.ts` (POST + PUT) · `features/leagues/matchSummary.ts`, `MatchView.tsx` · pinned tests: matchSummary.test.ts, MatchView.test.tsx, result/route.test.ts.

## Risks

| Risk | L | Mitigation |
|------|---|-----------|
| 3 scoreboard builders drift | Med | Shared copy helper + S3 parity tests |
| PUT drops chips | Med | Copy-forward list extended + test |
| Pinned tests fix single-row | High | Deliberate updates; keep order/omit-if-null |
| No catalog precedent | Low | Single source; spec pins BB2025 costs |
| Heavy live e2e | High | S2 local-mode e2e, reuse consent/begin helpers |

## Rollback Plan

All additive: revert slice PRs in chain order; old readers ignore unknown JSON keys; existing rows untouched; S1 revert leaves the unused column null — no data loss.

## Dependencies

None. Context: Engram `sdd/incentive-chips/explore` #783.

## Success Criteria

- [ ] Lower-TV coach buys within budget in `ready`; begin still works when skipped or budget = 0.
- [ ] Closed live match shows per-team budget rows + chips; classic/legacy unchanged; full suite green.
