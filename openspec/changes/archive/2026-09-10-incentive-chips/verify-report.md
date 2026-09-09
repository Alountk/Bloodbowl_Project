```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:6d78f7b8efe65d0c73782c42c114bcfd3c66233162c1f122cc2039adb14de2ff
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 9/9
scenarios: 29/29
test_command: pnpm test
test_exit_code: 0
test_output_hash: sha256:d53103ef8cc219b032c210f0b4845c2a890b1b365ceb105d1b271b94e08d5c36
build_command: pnpm build
build_exit_code: 0
build_output_hash: sha256:f96c9332ffba128a4cab7fb1d66a5e18ff83d058ccf005d843abe5472c222151
```

## Verification Report

**Change**: incentive-chips
**Version**: delta specs (inducements / live-match-realtime / match-result / match-view) — revision 2
**Mode**: Standard (Strict TDD used at apply; full-runtime verification here)
**Evidence base**: `main` @ `7f7a311` (merge #205) — clean tree except untracked `openspec/changes/incentive-chips/`

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 19 |
| Tasks complete | 19 |
| Tasks incomplete | 0 |
| PRs merged | 7 stacked-to-main (#198–#205) |
| Requirements (spec headings) | 9 |
| Scenarios (spec headings) | 29 |

### Build & Tests Execution
**Unit/Integration**: ✅ 170 files / 2458 passed / 0 failed
```text
$ pnpm test
Test Files  170 passed (170)
     Tests  2458 passed (2458)
exit 0
```
**Lint**: ✅ `pnpm lint` → exit 0 (0 errors, 0 warnings)
**Type-check**: ✅ `npx tsc --noEmit` → exit 0 (clean)
**Build**: ✅ `pnpm build` → exit 0 (Next.js production build complete)
**Prisma**: ✅ `pnpm db:generate` → exit 0 (client v6.19.3); `prisma migrate status` → 29 migrations, "Database schema is up to date!" (migration `20260910120000_live_match_inducements` applied to dev DB :5433)
**Coverage**: ➖ Not available (no threshold configured in this project)

**E2E**: ⚠️ Documented limitation — not executed. `e2e/inducement-purchase.spec.ts` (S2) and the pinned MVT-4 assertion in `e2e/live-match.spec.ts:871-887` both live in the **auth suite** (`playwright.config.auth.ts`), which requires `AUTH_MODE=auth` + Docker Postgres and is out of scope by the change contract; local-mode reuse is unreliable because ports 3000/3001 are occupied by unknown-mode dev servers. The auth-suite pinned e2e remains valid by construction (no-purchase close → legacy single-row fallback → exactly one "Incentivos" row). Render/chip behavior is covered by component tests.

### Spec Compliance Matrix
| Requirement | Scenario | Covering test (passed in `pnpm test`) | Result |
|-------------|----------|---------------------------------------|--------|
| IND-1 · Common Inducement Catalog | Catalog lookup | `lib/rules/inducements.test.ts` "looks a valid entry up by id" | ✅ COMPLIANT |
| IND-1 | Effective cost by race rule | "applies the bribery-and-corruption override to bribes for goblins" (50k) | ✅ COMPLIANT |
| IND-1 | Unknown id | "returns undefined for an unknown id without throwing" | ✅ COMPLIANT |
| IND-2 · Lower-TV Eligibility and Budget | Lower-TV side gets the budget | "awards the budget to the lower-TV side (\|ΔTV\|)" + liveStore "gives the \|ΔTV\| budget to the lower side (away 150k)" + fixture GET "370k home budget" | ✅ COMPLIANT |
| IND-2 | Equal TVs give no budget | "gives equal-TV matches a zero budget" + liveStore "409s the higher-TV or equal-TV side" | ✅ COMPLIANT |
| IND-3 · Cart Validation | Within budget accepted | "accepts an eligible cart whose effective cost fits the budget" + store 3×bribes@50k=150k exact | ✅ COMPLIANT |
| IND-3 | Over budget rejected | "rejects a cart whose Σ effective cost exceeds the budget" + store 2×extra-training 200k>150k→400 | ✅ COMPLIANT |
| IND-3 | Limit exceeded rejected | "rejects a count above maxPerMatch" | ✅ COMPLIANT |
| IND-3 | Ineligible race rejected | "rejects a rule-gated entry for an ineligible race" (orc/plague-doctor) | ✅ COMPLIANT |
| IND-3 | Unknown id rejected | "rejects an unknown id with no mutation" | ✅ COMPLIANT |
| IND-4 · Chip Model | Chip renders count and name | `matchSummary.test.ts` per-team rows + `MatchView.test.tsx` "renders per-team Incentivos rows with budget + chip pills" ("2× Sobornos") | ✅ COMPLIANT |
| IND-5 · Race Special Rules | Rule-gated catalog resolves | "allows a rule-gated entry only for races carrying that rule" + store plague-doctor/goblin→400 | ✅ COMPLIANT |
| IND-5 | Cost override applies | "applies the bribery-and-corruption override to the biased referee for snotlings" (80k) | ✅ COMPLIANT |
| LM-30 · Inducement Purchase Command | Lower-TV coach buys in ready | `live/route.test.ts` "wires a lower-TV purchase through the store (200 view)" + liveStore persist + hub publish | ✅ COMPLIANT |
| LM-30 | Non-ready status rejected | liveStore "409s unless the match is ready" (pending/live) | ✅ COMPLIANT |
| LM-30 | Non-eligible side rejected | route "409s a side-less admin", "409s a coach who targets the RIVAL side", liveStore 409 higher/equal-TV + control gate LM-2 tests (route.test.ts:573 foreign→404, :582 spectator member→403) | ✅ COMPLIANT |
| LM-30 | Replace-cart and seq guard | liveStore "REPLACES the side's cart while preserving the rival side's", "An EMPTY list clears", "409s on a stale seq" | ✅ COMPLIANT |
| LM-30 | Begin with empty cart or zero budget | Existing begin suite unchanged + green; resolve/wizard/result no-cart tests assert no inducements key; pinned no-purchase e2e | ✅ COMPLIANT |
| Atomic Result Transaction (MODIFIED) | All rewards applied atomically | result/route.test.ts transaction suite + "carries the lower-TV cart into scores.*.inducements" | ✅ COMPLIANT |
| Atomic Result Transaction | Petty cash from TV difference | `computePettyCash` tests (unchanged, green) + liveStore resolve petty-cash assertions | ✅ COMPLIANT |
| Atomic Result Transaction | Per-side inducements persisted | result POST route test (:729) + resolve.test.ts (:635) + wizard.test.ts (:643) | ✅ COMPLIANT |
| Inducement Snapshot Parity and Copy-Forward (ADDED) | All three paths persist the same shape | shared `buildInducementSnapshot` + path assertions: resolve.test.ts :635, wizard.test.ts "runWizardClose persists the SAME per-side inducement snapshot … (parity)", result/route.test.ts :729 | ✅ COMPLIANT |
| Inducement Snapshot Parity | Correction preserves inducements | result/route.test.ts PUT "copies the prior per-side inducements forward — a correction never drops the chips" | ✅ COMPLIANT |
| Inducement Snapshot Parity | Legacy row untouched | result/route.test.ts PUT "leaves legacy rows WITHOUT per-side inducements unaffected" + resolve/wizard no-cart tests + inducements.test.ts helpers | ✅ COMPLIANT |
| MVT-4 · Finished-Feed Summary Rows (MODIFIED) | Summary rows from snapshot | matchSummary.test.ts "builds the four summary rows from a snapshot" + reported precedes cards (e2e pinned) | ✅ COMPLIANT |
| MVT-4 | Per-team incentive chips render | matchSummary.test.ts :263 + MatchView.test.tsx :1706 (away 150.000 + "2× Sobornos", home zero/no chips) | ✅ COMPLIANT |
| MVT-4 | Legacy single-row fallback | matchSummary legacy fixture single `{team:"home",budget,cards:[]}` row + MatchView pinned "Incentivos 150.000" (no "×") | ✅ COMPLIANT |
| MVT-4 | Walkover omits summary rows | matchSummary.test.ts "returns an empty array for a walkover (no snapshot, MV-2 guard)" | ✅ COMPLIANT |
| MVT-4 | MVP not duplicated | matchSummary.test.ts "limits rows to the four summary kinds — MVP stays event-derived" + MatchView MVP tests | ✅ COMPLIANT |

**Compliance summary**: 29/29 scenarios compliant · 9/9 requirements implemented.

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| IND-1 | ✅ Implemented | `lib/rules/inducements.ts` — the 16 IND-1-table entries verbatim (Sobornos 100k/B&C 50k, Chef 300k/100k, Árbitro 120k/80k, kegs 50k, wizard 150k, mercenarios reserved `dynamicCost`); NO invented 50k/80k/60k defaults from the first version remain; display names/costs appear nowhere else (single source). |
| IND-2 | ✅ Implemented | `budgetForSide` + `inducementBudgetOf`; server TV via `raceTvParts`+`computeTeamTv` over persisted rows (never client input); fixture GET exposes `live.inducementBudget`; store re-derives and enforces. |
| IND-3 | ✅ Implemented | `validateCart` — exists/purchasable/maxPerMatch/count≥1/eligibility/Σ effective cost ≤ budget; replace-cart semantics in store (`updateMany` touching only `inducements` + seq). |
| IND-4 | ✅ Implemented | Snapshots store `{name,count}` resolved from catalog at close (`buildInducementSnapshot`); chips render `{count}× {name}` via i18n `quantity` key. |
| IND-5 | ✅ Implemented (debt open) | `RACE_SPECIAL_RULES` covers all 8 races/5 rules of the initial map + `NO_APOTHECARY_RACES` seam (empty — see Warning W1) + reserved `wizard-type`. |
| LM-30 | ✅ Implemented | Command + DTO/SSE cart exposure + fixture-GET budget; route maps 404/409/400 with the LM-2 gate (spectator 403, foreign 404) tested. |
| Atomic Result Transaction | ✅ Implemented | Same one-transaction persistence; inducements added to the scoreboard snapshot on all three close paths. |
| Snapshot Parity & Copy-Forward | ✅ Implemented | Shared `buildInducementSnapshot` (one helper), identical conditional spreads; PUT forward-only copy `inducements != null`; legacy omit-if-absent. |
| MVT-4 | ✅ Implemented | Per-team `incentives` rows + chip pills, `rowKey` type+side; single-row legacy fallback; walkover `[]`; MVP stays event-derived. |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| Pure `lib/rules/inducements.ts` (not roster-catalog) | ✅ Yes | Mirrors `winnings.ts`; exported via `lib/rules/index.ts`. |
| `LiveMatch.inducements Json?` row-scoped cart | ✅ Yes | Additive column + migration `20260910120000_live_match_inducements`; no backfill. |
| Live command `purchaseInducements` (not fixture POST) | ✅ Yes | seq-guarded, hub fan-out, `begin` untouched. |
| Server-derived budget (IND-2) | ✅ Yes | Same `raceTvParts`/`computeTeamTv` derivation as result-route petty cash. |
| Shared `buildInducementSnapshot` helper | ✅ Yes | Parity by construction across result POST / resolveLiveMatch / runWizardClose. |
| Mercenarios excluded (reserved) | ✅ Yes | `dynamicCost` → `validateCart` rejects as not purchasable. |
| Wizard base 150k all races, types deferred | ✅ Yes | Per design; `wizard-type` reserved marker. |
| Slices S1→S4 chained (7 PRs #198–#205) | ✅ Yes | All ≤ 400-line review budget; final S4 = 208 changed lines. |

### Issues Found
**CRITICAL**: None
**WARNING**:
- **W1 — IND-5 verification debt now shipping in the purchase UI**: spec IND-5 says the definitive `no-apothecary` race set and per-race `wizard` types "MUST be finalized against BB2025 before the purchase UI ships". The purchase UI (S2) and feed (S4) ARE in main, while `NO_APOTHECARY_RACES` remains empty and `wizard` ships at a flat 150k for every race. The `apothecary-eligible` model ("unless no-apothecary") and the reserved `wizard-type` seam are implemented, and the IND-1 table itself defers wizard types — so no scenario is failing — but the finalization clause is unmet. Recommend a small follow-up change to pin both sets against BB2025 before promoting the feature to real play. Tracked consistently in spec/design/tasks/apply-progress.
**SUGGESTION**:
- **S1 — side-less admin and rival-side coach receive 409** (route) / **409** (store higher/equal-TV) rather than a distinct code. The spec scenario pins only spectator→403 and foreign→404 (both satisfied by the LM-2 control gate); the 409 mapping for the admin/coach cases matches the recorded design and is covered by tests. Informational only.

### Verdict
**PASS WITH WARNINGS** — 19/19 tasks complete; 29/29 scenarios green under passing covering tests; full harness green (`pnpm test` 2458/0, lint 0, `tsc` clean, `pnpm build` 0, `db:generate` 0, migration applied). No blockers or critical findings. One open, fully documented verification debt (IND-5 apothecary/wizard finalization, W1) precedes archive approval.
