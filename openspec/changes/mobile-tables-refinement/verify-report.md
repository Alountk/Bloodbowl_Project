```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:a60d3d286f08535d402f2b3773e656ab5177e8c3e8a720572c0aa1aa7198bb3a
verdict: pass
blockers: 0
critical_findings: 0
requirements: 11/11
scenarios: 29/29
test_command: pnpm test
test_exit_code: 0
test_output_hash: sha256:a60d3d286f08535d402f2b3773e656ab5177e8c3e8a720572c0aa1aa7198bb3a
build_command: npx tsc --noEmit
build_exit_code: 0
build_output_hash: sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

# Verification Report

**Change**: mobile-tables-refinement
**Version**: RE-verify after bugfix `9c9d342` — horizontal-overflow fix (desktop scroll wrappers gated to desktop branch; coaching mobile stacked branch; `md:min-w-0` removed; new mobile Playwright project) — stacked row-cards + native select chevron/16px + `useIsDesktop`
**Mode**: Strict TDD (`pnpm test`, vitest) — branch `feat/mobile-tables-refinement`

## Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 18 (Phase 1–6; tasks.md rows 1.1…6.3) |
| Tasks complete | 18 (all `[x]`) |
| Tasks incomplete | 0 |

All tasks checked `[x]` and independently confirmed (RED test files exist + GREEN on execution). Bugfix `9c9d342` is a follow-up fix whose changed tests (desktop `md:min-w-0` removal) are green on execution. Full verification gate is open.

## Build & Tests Execution
**Build (type-check)**: ✅ Passed
```text
npx tsc --noEmit → exit 0 (empty output)
```
**Lint**: ✅ Clean (`pnpm lint` → eslint, no output, exit 0)
**Unit tests**: ✅ 446 passed (21 files), exit 0
```text
pnpm test → Test Files 21 passed (21), Tests 446 passed, exit 0
  RosterTable.test.tsx 45 | PlayerAvailabilityTable.test.tsx 15 | CreateTeamForm.test.tsx 19
  useIsDesktop.test.tsx 6 | TeamDetailView.test.tsx 12 | useCreateTeamForm.test.ts 28 | races 217
```
**E2E**: ✅ 19/19 passed (`pnpm exec playwright test`, exit 0)
```text
14 chromium (Desktop Chrome 1280, ignore **/mobile.spec.ts) + 5 mobile (viewport 375x812, **/mobile.spec.ts) = 19 passed.
Mobile: home/detail/create-step2 no horizontal overflow · drawer open+scrim close · native race select.
```
**Coverage**: ➖ Not available — `@vitest/coverage-v8` not installed; no coverage gate configured (info-only, never blocking).

## Spec Compliance Matrix (all runtime evidence — every scenario exercised by a passing test)

### roster-table /spec.md (delta, updated post-bugfix)
| Requirement | Scenario | Covering Test (all passed) | Result |
|---|---|---|---|
| Mobile Stacked Row-Cards (ADDED) | Read-only mobile card | `RosterTable.test.tsx > mobile > renders each player as a stacked card (no book table)` + subtitle + chips + cost + labeled sections | ✅ COMPLIANT |
| Mobile Stacked Row-Cards (ADDED) | Editable mobile card keeps controls | `RosterTable.test.tsx > mobile > keeps editable name input and remove button working on mobile` (onRename/onRemove) | ✅ COMPLIANT |
| Mobile Stacked Row-Cards (ADDED) | No skills fallback | `RosterTable.test.tsx > mobile > renders SKILLS 'Ninguna' fallback` | ✅ COMPLIANT |
| Mobile Stacked Row-Cards (ADDED) | Desktop untouched | RosterTable desktop suite (jsdom default → book table) + chromium e2e 14 (1280 real browser) | ✅ COMPLIANT |
| Scrollable Roster Table (MODIFIED) | Height cap and sticky header | `RosterTable.test.tsx > scroll container > caps the table height with internal scroll and preserves the sticky header` | ✅ COMPLIANT |
| Scrollable Roster Table (MODIFIED) | Desktop horizontal scroll preserved | `RosterTable.test.tsx > scroll container > nests an overflow-x-auto wrapper and min-width panel…` (asserts `min-w-[640px]` + `overflow-x-auto`; no `md:min-w-0` anywhere) | ✅ COMPLIANT |
| Scrollable Roster Table (MODIFIED) | Mobile uses stacked cards, no scroll wrapper | `RosterTable.test.tsx > mobile > stacked card (queryByRole("table") null)` + source (mobile branch has no overflow-x-auto/min-w) + mobile e2e "team detail…no overflow" | ✅ COMPLIANT |

### create-team /spec.md (delta, updated post-bugfix)
| Requirement | Scenario | Covering Test (all passed) | Result |
|---|---|---|---|
| Native Select Wrapper with Chevron (ADDED) | Race select has wrapper+chevron | `CreateTeamForm.test.tsx > wraps the Race select in a relative div with a pointer-events-none chevron and 16px font` (wrapper `relative`, chevron `span[aria-hidden]` `pointer-events-none`, `changeRace` intact) + mobile e2e "native race select works" | ✅ COMPLIANT |
| Native Select Wrapper with Chevron (ADDED) | League type select has wrapper+chevron | `CreateTeamForm.test.tsx > wraps the League type select…preserves its aria-label` (`aria-label="League type"` + change handler) | ✅ COMPLIANT |
| Mobile Availability Stacked Rows (ADDED) | Mobile availability row content | `PlayerAvailabilityTable.test.tsx > mobile > renders stacked availability rows (no book table) with name, subtitle and cost` + `shows stats chips and labeled SKILLS/PRIMARIAS/SECUNDARIAS rows on mobile` | ✅ COMPLIANT |
| Mobile Availability Stacked Rows (ADDED) | Add always visible on mobile | `PlayerAvailabilityTable.test.tsx > mobile > shows the counter and an always-visible Add button with the preserved aria-label` (`2/4` + `Add Lineman`) + mobile e2e "Add Lineman visible" | ✅ COMPLIANT |
| Mobile Availability Stacked Rows (ADDED) | Row disappears at max | `PlayerAvailabilityTable.test.tsx > mobile > hides a row entirely once its positional reaches its max on mobile` | ✅ COMPLIANT |
| Mobile Availability Stacked Rows (ADDED) | Over-budget Add disabled on mobile | `PlayerAvailabilityTable.test.tsx > mobile > disables the Add button when over budget but keeps the row visible on mobile` | ✅ COMPLIANT |
| Jugadores Disponibles Availability Table (MODIFIED) | Desktop book table preserved | `PlayerAvailabilityTable.test.tsx > renders all positional rows with rulebook headers…` (9 headers, `min-w-[640px]`+`overflow-x-auto`) + chromium e2e 14 | ✅ COMPLIANT |
| Jugadores Disponibles Availability Table (MODIFIED) | Disappearing row at max | `PlayerAvailabilityTable.test.tsx > hides a row entirely…at max` (desktop) + chromium e2e "enforces positional maximums and removes a row at the limit" | ✅ COMPLIANT |
| Jugadores Disponibles Availability Table (MODIFIED) | Over-budget Add disabled | `PlayerAvailabilityTable.test.tsx > disables the Add button when the purchase would exceed the budget but keeps the row visible` (desktop) | ✅ COMPLIANT |

### team-detail-view /spec.md (delta, updated post-bugfix — coaching now has mobile stacked branch)
| Requirement | Scenario | Covering Test (all passed) | Result |
|---|---|---|---|
| Mobile ReadOnly Roster Inherits Row-Cards (ADDED) | Mobile detail roster is stacked | `RosterTable.test.tsx > mobile > stacked card (readOnly=true, matchMedia false)` + `TeamDetailView.tsx` passes `<RosterTable readOnly …/>` no banner/apothecary → no banner/footer + mobile e2e "team detail…(stacked rows)" (`Player 1` visible) | ✅ COMPLIANT |
| Mobile ReadOnly Roster Inherits Row-Cards (ADDED) | Desktop detail roster unchanged | `TeamDetailView.test.tsx` (12 readOnly tests) + `RosterTable.test.tsx` desktop readOnly suite | ✅ COMPLIANT |
| Coaching Staff Display (MODIFIED) | Coaching breakdown | `TeamDetailView.test.tsx > renders coaching breakdown rows with unit and total; apothecary NO when absent` (Segundas oportunidades/Fanáticos/Entrenadores/Animadoras + Apotecario) | ✅ COMPLIANT |
| Coaching Staff Display (MODIFIED) | Apothecary present | `TeamDetailView.test.tsx > shows Apotecario SÍ with total 50 000 and total row = items + 50 000` | ✅ COMPLIANT |
| Coaching Staff Display (MODIFIED) | No apothecary | `TeamDetailView.test.tsx > shows total cuerpo técnico = items sum when no apothecary` | ✅ COMPLIANT |
| Coaching Staff Display (MODIFIED) | Horizontal scroll on mobile | Desktop part: `TeamDetailView.test.tsx > coaching table horizontal scroll > wraps…overflow-x-auto…min-width panel` (`min-w-[640px]`; no `md:min-w-0`). Mobile part: mobile e2e "team detail…(stacked rows + coaching)" (`Segundas oportunidades` visible + `expectNoHorizontalOverflow` at 375px) + source (mobile branch = `divide-y` stacked rows, no table/min-w/overflow). | ✅ COMPLIANT |

### use-is-desktop /specs/use-is-desktop/spec.md (new main capability, supports the change)
| Requirement | Scenario | Covering Test (all passed) | Result |
|---|---|---|---|
| SSR-safe Desktop Default | First render is desktop | `useIsDesktop.test.tsx > defaults to true (desktop) when matchMedia is unavailable` | ✅ COMPLIANT |
| SSR-safe Desktop Default | jsdom default stays desktop | `useIsDesktop.test.tsx > defaults to true…` (no matchMedia → stays true) | ✅ COMPLIANT |
| matchMedia Effect | Mobile viewport flips to mobile | `useIsDesktop.test.tsx > flips to false when matchMedia reports a mobile-width viewport` | ✅ COMPLIANT |
| matchMedia Effect | Desktop viewport stays desktop | `useIsDesktop.test.tsx > stays true when matchMedia reports a desktop-width viewport` | ✅ COMPLIANT |
| matchMedia Effect | matchMedia guarded | `useIsDesktop.test.tsx > defaults to true…` (effect guard `typeof window.matchMedia !== "function"`) | ✅ COMPLIANT |
| Listener Cleanup | Listener removed on unmount | `useIsDesktop.test.tsx > removes its change listener when the hook unmounts` (+ change up/down) | ✅ COMPLIANT |
| Single-Branch Consumer Usage | Exactly one branch renders | RosterTable/PlayerAvailability mobile `queryByRole("table")` null AND desktop suite asserts table present; mobile e2e (375px, stacked) + chromium e2e (1280, table) | ✅ COMPLIANT |

**Compliance summary**: 29/29 scenarios compliant — fully mapped to passing runtime tests (unit + desktop & mobile e2e); 0 UNTESTED, 0 FAILING.

## Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| Horizontal-overflow bugfix (9c9d342) | ✅ Implemented | `md:min-w-0` gone from `features` and `app` (grep: none). `overflow-x-auto` only in desktop branches: `RosterTable.tsx:145`, `PlayerAvailabilityTable.tsx:69`, `TeamDetailView.tsx:86` — all inside `isDesktop ? …` with early-return mobile (`mx-auto max-w-[900px] > space-y-3` / coaching `divide-y`), no table/min-w/overflow wrapper. |
| Coaching mobile stacked branch (NEW) | ✅ Implemented | `TeamDetailView.tsx:143-177` renders stacked rows (`divide-y divide-[#e2e8f0]`) with label + `{n} × unit`, total right, Apotecario SÍ/NO, bold total row; no table/min-w/overflow below `md`. |
| `useIsDesktop` hook | ✅ Implemented | `useState(true)` + matchMedia effect w/ guard + add/removeEventListener + legacy fallback + cleanup (matches design). |
| `mockMatchMedia` util | ✅ Implemented | Stub + `setMatches()` dispatches `change`. |
| RosterTable single-branch | ✅ Implemented | Desktop: `max-h-[55vh] overflow-auto > overflow-x-auto > min-w-[640px]` + table + sticky `top-0 z-10` + banner/footer. Mobile: stacked cards, no wrapper/table. |
| PlayerAvailabilityTable single-branch | ✅ Implemented | Desktop: outer scroll + overflow-x-auto + `min-w-[640px]` + 9 headers. Mobile: stacked rows, Add `disabled={overBudget||atMaxPlayers}`, row filtered at max. |
| Select wrappers | ✅ Implemented | `SelectWithChevron` wraps Race + League type in `relative` div, `pointer-events-none` chevron `span[aria-hidden]`, `appearance-auto text-[16px]`, `aria-label="League type"` + `changeRace` preserved. |
| New mobile e2e project | ✅ Implemented | `playwright.config.ts` `mobile` project (375x812, chromium, `testMatch: **/mobile.spec.ts`); `chromium` project `testIgnore: **/mobile.spec.ts`. `e2e/mobile.spec.ts` 5 tests all pass. |

## Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| Viewport source `useState(true)` + matchMedia effect | ✅ Yes | Exact design snippet in `useIsDesktop.ts`. |
| Hook (single branch) over CSS | ✅ Yes | One boolean gates exactly one render branch in all consumers. |
| `mockMatchMedia` per-test stub + `setMatches` | ✅ Yes | `features/teams/test/matchMedia.ts` reused. |
| Separate chevron `span` element (`pointer-events-none`), not background-image | ✅ Yes | `SelectWithChevron` in `CreateTeamForm.tsx`. |
| Desktop branch byte-identical behavior | ✅ Yes | Desktop classes/structure preserved (scroll wrapper, `overflow-x-auto`, `min-w-[640px]`, sticky headers, banner, `Apotecario` footer, totals). All 421 baseline unit tests green unchanged + chromium e2e 14 green. |

**Design deviation (WARNING)**: `design.md` and `proposal.md` declared coaching "out of scope / unchanged / keep horizontal scroll on mobile". Bugfix `9c9d342` converted coaching to a mobile stacked branch and the spec was updated to require it (spec > design). The implementation matches the (updated) spec, but the **design artifact was not updated** to reflect the coaching mobile change; it still describes the old out-of-scope behavior. Benign-to-verdict (no spec is broken) but the design doc is stale.

Documented deviations persist from apply-progress (both benign):
1. `text-[16px]` asserted via className (jsdom can't resolve Tailwind computed style) — source class contract intact.
2. Mobile availability subtitle renders `(race, rol)` + cost as sibling text nodes within one subtitle line — visually joined by ` · `; no behavioral difference.

## TDD Compliance (Strict TDD)
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | `apply-progress.md` "TDD Cycle Evidence" table present. |
| All tasks have tests | ✅ | 18/18 tasks map to RED test files on disk (`useIsDesktop.test.tsx`, `RosterTable.test.tsx`, `PlayerAvailabilityTable.test.tsx`, `CreateTeamForm.test.tsx`). |
| RED confirmed (tests exist) | ✅ | All test files verified on disk. |
| GREEN confirmed (tests pass) | ✅ | 45+15+19+6+12 relevant files all pass; 446/446 unit + 19/19 e2e (incl. 5 new mobile). |
| Triangulation adequate | ✅ | Hook 6 cases; RosterTable 10 mobile + desktop scroll cases; Availability 7 mobile cases; selects 2 cases — distinct expected values, no ghost loops. |
| Safety Net for modified files | ✅ | RosterTable 35, Availability 8, CreateTeamForm 17 baseline green before + after; bugfix-only change to e2e config + desktop assertions green. |

**TDD Compliance**: 6/6 checks passed.

## Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit (hook/util/roster/availability/selects/detail) | 446 total | 21 | vitest + @testing-library/react |
| E2E chromosome (desktop) | 14 | `e2e/create-team.spec.ts` | Playwright (Desktop Chrome 1280) |
| E2E mobile | 5 | `e2e/mobile.spec.ts` | Playwright (Chromium 375×812) |
| **Total** | **446 unit + 19 e2e** | **21 + 2** | |

## Changed File Coverage
Coverage analysis skipped — no coverage tool detected (`@vitest/coverage-v8` absent). Not a failure; informational only.

## Assertion Quality (Step 5f)
- **Mobile e2e** (`e2e/mobile.spec.ts`): assertions verify real browser behavior — `expectNoHorizontalOverflow` compares `document.scrollingElement.scrollWidth - innerWidth` to ≤1 (real page-level overflow check at 375×812); drawer visibility + scrim close; native select value. No tautologies, no ghost loops.
- **RosterTable/Availability mobile unit tests**: exercise the mobile branch via `mockMatchMedia(false)` AND assert `queryByRole("table")` null (desktop-only node absent) + stacked content; real `disabled` property assertions. No trivial assertions.
- **Select wrapper tests**: assert wrapper `relative`, chevron `span[aria-hidden]` + `pointer-events-none`, `text-[16px]` class, and preserved behavior (`changeRace` → Orc, league value). The className-based 16px assertion is WARNING-grade (documented deviation; only jsdom-stable representation).
- **Hook tests**: behavioral value assertions (default/flip/change up/down/guard); cleanup asserts listener add/remove (implementation-coupling but direct spec scenario, only jsdom-verifiable expression).
- **No banned patterns**: none found across all touched test files.
- Note: the coaching mobile stacked branch is covered at runtime by the mobile e2e (real 375px browser, no-overflow assertion) rather than a targeted mobile unit test; its stack rendering is confirmed by source inspection. A dedicated `mockMatchMedia(false)` coaching-unit test would harden future regressions (SUGGESTION, not blocking — real-browser evidence exists).

**Assertion quality**: ✅ All assertions verify real behavior (2 benign WARNING-grade couplings documented; class-level 16px check is the only jsdom-stable option).

## Quality Metrics
**Linter**: ✅ No errors (`pnpm lint` exit 0)
**Type Checker**: ✅ No errors (`npx tsc --noEmit` exit 0)

## Issues Found
**CRITICAL**: None
**WARNING**:
- Design doc stale: `design.md`/`proposal.md` still describe coaching as "out of scope / keep horizontal scroll on mobile", but bugfix `9c9d342` added a mobile stacked coaching branch that the updated spec requires. Implementation matches the spec; design artifact was not updated. Not blocking (spec > design).
- `text-[16px]` asserted via className (jsdom can't compute Tailwind) — benign, documented.
- Hook cleanup test uses `vi.fn()` call-count assertions — implementation-coupling, but verbatim spec scenario and only jsdom-verifiable expression; acceptable.
**SUGGESTION**:
- Coaching mobile stacked branch has no dedicated `mockMatchMedia(false)` unit test (covered by mobile e2e + source inspection; a unit test would harden).
- Coverage tooling (`@vitest/coverage-v8`) not installed — per-branch coverage gate would harden future changes; not blocking.

No pre-existing failures encountered (all safety nets green). Pre-existing `act(...)` warnings in `AppShell.test.tsx`/`TeamList.test.tsx` are unrelated (files not touched) and non-failing.

## Verdict
**PASS** — 29/29 spec scenarios compliant with passing runtime evidence (446 unit + 19 e2e including 5 new mobile at 375px), tsc + lint clean, horizontal-overflow bugfix confirmed in source (no `md:min-w-0`, scroll wrappers desktop-only, coaching mobile stacked), single-branch render on both viewport paths, 0 blockers, 0 critical findings.
