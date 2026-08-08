```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:1ab75ddcc649358aee80af19c3b45bb15d001c02491aadacdfdd7ec5d4d26748
verdict: pass
blockers: 0
critical_findings: 0
requirements: 11/11
scenarios: 29/29
test_command: pnpm test
test_exit_code: 0
test_output_hash: sha256:1ab75ddcc649358aee80af19c3b45bb15d001c02491aadacdfdd7ec5d4d26748
build_command: npx tsc --noEmit
build_exit_code: 0
build_output_hash: sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

# Verification Report

**Change**: mobile-tables-refinement
**Version**: Stacked row-cards (RosterTable + PlayerAvailabilityTable) + native select chevron/16px fix + `useIsDesktop`
**Mode**: Strict TDD (`pnpm test`, vitest) — branch `feat/mobile-tables-refinement`

## Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 18 (Phase 1–6; tasks.md rows 1.1…6.3) |
| Tasks complete | 18 (all `[x]`) |
| Tasks incomplete | 0 |

All tasks checked and independently confirmed below (RED test files exist + GREEN on execution). Full verification gate is open.

## Build & Tests Execution
**Build (type-check)**: ✅ Passed
```text
npx tsc --noEmit → exit 0 (empty output)
```
**Lint**: ✅ Clean (`pnpm lint` → eslint, no output, exit 0)
**Unit tests**: ✅ 446 passed (21 files), exit 0
```text
pnpm test → Test Files 21 passed (21), Tests 446 passed, Duration 9.52s
  RosterTable.test.tsx 45 | PlayerAvailabilityTable.test.tsx 15 | CreateTeamForm.test.tsx 19
  useIsDesktop.test.tsx 6 | TeamDetailView.test.tsx 12 | useCreateTeamForm.test.ts 28 | races 217 | roster 22 | …
```
**E2E**: ✅ 14/14 passed (`npx playwright test`, Desktop Chrome 1280×720 — real browser confirms desktop book-table branch + single-branch DOM)
**Coverage**: ➖ Not available — `@vitest/coverage-v8` not installed; no coverage gate configured (additive markup/hook change; info-only, never blocking).

## Spec Compliance Matrix (all runtime evidence — every scenario exercised by a passing test)

### roster-table /spec.md (delta)
| Requirement | Scenario | Covering Test (all passed) | Result |
|---|---|---|---|
| Mobile Stacked Row-Cards | Read-only mobile card | `RosterTable.test.tsx > mobile … > renders each player as a stacked card (no book table)` + `shows the positional subtitle` + `shows stats chips MV FU AG PS AR, cost line and labeled sections` + `shows stats chip values` | ✅ COMPLIANT |
| Mobile Stacked Row-Cards | Editable mobile card keeps controls | `RosterTable.test.tsx > mobile … > keeps editable name input and remove button working on mobile` (onRename/onRemove asserted) | ✅ COMPLIANT |
| Mobile Stacked Row-Cards | No skills fallback | `RosterTable.test.tsx > mobile … > renders SKILLS 'Ninguna' fallback` (mobile) + desktop `renders Ninguna for a positional with no starting skills` | ✅ COMPLIANT |
| Mobile Stacked Row-Cards | Desktop untouched | RosterTable desktop suite (35, jsdom default → book table) + e2e 14 (1280 real browser) | ✅ COMPLIANT |
| Scrollable Roster Table (MODIFIED) | Height cap and sticky header | `RosterTable.test.tsx > scroll container > caps the table height with internal scroll and preserves the sticky header` | ✅ COMPLIANT |
| Scrollable Roster Table (MODIFIED) | Desktop horizontal scroll preserved | `RosterTable.test.tsx > scroll container > nests an overflow-x-auto wrapper and min-width panel…` | ✅ COMPLIANT |
| Scrollable Roster Table (MODIFIED) | Mobile uses stacked cards, no scroll wrapper | `RosterTable.test.tsx > mobile … > renders each player as a stacked card (no book table) on mobile` (`queryByRole("table")` null → no `overflow-x-auto`, no `min-w-[640px]`) | ✅ COMPLIANT |

### create-team /spec.md (delta)
| Requirement | Scenario | Covering Test (all passed) | Result |
|---|---|---|---|
| Native Select Wrapper with Chevron | Race select has wrapper+chevron | `CreateTeamForm.test.tsx > wraps the Race select in a relative div with a pointer-events-none chevron and 16px font` (wrapper `relative`, chevron `span[aria-hidden]` `pointer-events-none`, select `text-[16px]`, `changeRace` → Orc step 2) | ✅ COMPLIANT |
| Native Select Wrapper with Chevron | League type select has wrapper+chevron | `CreateTeamForm.test.tsx > wraps the League type select in a relative div with a chevron and preserves its aria-label` (`aria-label="League type"` + change handler intact) | ✅ COMPLIANT |
| Mobile Availability Stacked Rows | Mobile availability row content | `PlayerAvailabilityTable.test.tsx > mobile … > renders stacked availability rows (no book table) with name, subtitle and cost` (name, `(Human, Línea)`, cost `50 000`) + `shows stats chips and labeled SKILLS/PRIMARIAS/SECUNDARIAS rows on mobile` | ✅ COMPLIANT |
| Mobile Availability Stacked Rows | Add always visible on mobile | `PlayerAvailabilityTable.test.tsx > mobile … > shows the counter and an always-visible Add button with the preserved aria-label` (`2/4` + `Add Lineman`) | ✅ COMPLIANT |
| Mobile Availability Stacked Rows | Row disappears at max | `PlayerAvailabilityTable.test.tsx > mobile … > hides a row entirely once its positional reaches its max on mobile` | ✅ COMPLIANT |
| Mobile Availability Stacked Rows | Over-budget Add disabled on mobile | `PlayerAvailabilityTable.test.tsx > mobile … > disables the Add button when over budget but keeps the row visible on mobile` | ✅ COMPLIANT |
| Jugadores Disponibles Availability Table (MODIFIED) | Desktop book table preserved | `PlayerAvailabilityTable.test.tsx > renders all positional rows with rulebook headers and a subtext in POSICIÓN` (9 headers, desktop default) + e2e 14 | ✅ COMPLIANT |
| Jugadores Disponibles Availability Table (MODIFIED) | Disappearing row at max | `PlayerAvailabilityTable.test.tsx > hides a row entirely once its positional reaches its max` (desktop default) | ✅ COMPLIANT |
| Jugadores Disponibles Availability Table (MODIFIED) | Over-budget Add disabled | `PlayerAvailabilityTable.test.tsx > disables the Add button when the purchase would exceed the budget but keeps the row visible` (desktop default) | ✅ COMPLIANT |

### team-detail-view /spec.md (delta)
| Requirement | Scenario | Covering Test (all passed) | Result |
|---|---|---|---|
| Mobile ReadOnly Roster Inherits Row-Cards | Mobile detail roster is stacked | Inherited from `RosterTable.test.tsx > mobile … > renders each player as a stacked card` (readOnly=true, `matchMedia false`); `TeamDetailView.tsx` passes `<RosterTable readOnly …/>` with no `bannerText`/`apothecary` → no banner/footer on either branch (`TeamDetailView.test.tsx > renders the RosterTable footer suppressed (no apothecary prop passed)`) | ✅ COMPLIANT |
| Mobile ReadOnly Roster Inherits Row-Cards | Desktop detail roster unchanged | `TeamDetailView.test.tsx` (12: readOnly names, 10-col, no remove) + `RosterTable.test.tsx` desktop readOnly suite | ✅ COMPLIANT |
| Coaching Staff Display (MODIFIED) | Coaching breakdown | `TeamDetailView.test.tsx > renders coaching breakdown rows with unit and total; apothecary NO when absent` | ✅ COMPLIANT |
| Coaching Staff Display (MODIFIED) | Apothecary present | `TeamDetailView.test.tsx > shows Apotecario SÍ with total 50 000 and total row = items + 50 000 when present` | ✅ COMPLIANT |
| Coaching Staff Display (MODIFIED) | No apothecary | `TeamDetailView.test.tsx > shows total cuerpo técnico = items sum when no apothecary` | ✅ COMPLIANT |
| Coaching Staff Display (MODIFIED) | Horizontal scroll on mobile | `TeamDetailView.test.tsx > coaching table horizontal scroll > wraps the coaching table in an overflow-x-auto wrapper and min-width panel` (scroll preserved; coaching not converted to stacked rows) | ✅ COMPLIANT |

### use-is-desktop /specs/use-is-desktop/spec.md (new main capability)
| Requirement | Scenario | Covering Test (all passed) | Result |
|---|---|---|---|
| SSR-safe Desktop Default | First render is desktop | `useIsDesktop.test.tsx > defaults to true (desktop) when matchMedia is unavailable` (`useState(true)`) | ✅ COMPLIANT |
| SSR-safe Desktop Default | jsdom default stays desktop | `useIsDesktop.test.tsx > defaults to true … when matchMedia is unavailable` (no matchMedia → remains `true`, no flip) | ✅ COMPLIANT |
| matchMedia Effect | Mobile viewport flips to mobile | `useIsDesktop.test.tsx > flips to false when matchMedia reports a mobile-width viewport` | ✅ COMPLIANT |
| matchMedia Effect | Desktop viewport stays desktop | `useIsDesktop.test.tsx > stays true when matchMedia reports a desktop-width viewport` | ✅ COMPLIANT |
| matchMedia Effect | matchMedia guarded | `useIsDesktop.test.tsx > defaults to true … when matchMedia is unavailable` (effect guard `typeof window.matchMedia !== "function"` → no error, state remains true) | ✅ COMPLIANT |
| Listener Cleanup | Listener removed on unmount | `useIsDesktop.test.tsx > removes its change listener when the hook unmounts` (addEventListener + removeEventListener on unmount) + change-event flip tests `reacts to a matchMedia change event (mobile→desktop / desktop→mobile)` | ✅ COMPLIANT |
| Single-Branch Consumer Usage | Exactly one branch renders | RosterTable mobile `queryByRole("table")` null AND desktop tests assert book table present; PlayerAvailability mobile `queryByRole("table")` null; e2e 1280 renders book table live | ✅ COMPLIANT |

**Compliance summary**: 29/29 scenarios compliant — fully mapped to passing runtime tests; 0 UNTESTED, 0 FAILING.

## Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| `useIsDesktop` hook | ✅ Implemented | `useState(true)`; effect guards `typeof window.matchMedia !== "function"`, uses `matchMedia("(min-width: 768px)")`, `addEventListener("change")` + legacy `addListener` fallback, cleanup returns remove. Matches design signature exactly. |
| `mockMatchMedia` util | ✅ Implemented | `Object.defineProperty(window,"matchMedia")` + `setMatches()` dispatches `change` to listeners — matches design interface. |
| RosterTable single-branch | ✅ Implemented | `isDesktop ? (overflow-x-auto + min-w panel + book table + banner/footer) : (space-y-3 stacked cards, shared `buildPlayerData`/StatsChips/SkillAccessRows)`. `overflow-x-auto`/`min-w`/`sticky top-0 z-10` present on desktop only. Banner gated `!readOnly`. |
| PlayerAvailabilityTable single-branch | ✅ Implemented | Shared `rows` (incl. hide-at-max filter); `isDesktop ? book table (9 headers) : stacked rows`. Add button `disabled={overBudget||atMaxPlayers}`, row filtered at max. |
| Select wrappers | ✅ Implemented | `SelectWithChevron` wraps Race + League type in `relative` div with `pointer-events-none` chevron `span[aria-hidden]`; select `appearance-auto text-[16px]`; `aria-label="League type"` + `changeRace` preserved. |
| TeamDetailView readOnly roster | ✅ Implemented | `<RosterTable readOnly …/>`, no `bannerText`/`apothecary` passed → banner/footer suppressed on both branches. Coaching table untouched (out of scope). |

## Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| Viewport source `useState(true)` + matchMedia effect | ✅ Yes | Exact design snippet present in `useIsDesktop.ts`. |
| Hook (single branch) over CSS | ✅ Yes | One boolean gates exactly one render branch in both consumers. |
| `mockMatchMedia` per-test stub + `setMatches` | ✅ Yes | Colocated util `features/teams/test/matchMedia.ts`; used by RosterTable/Availability/hook tests. |
| Separate chevron `span` element (`pointer-events-none`), not background-image | ✅ Yes | `SelectWithChevron` in `CreateTeamForm.tsx`. |
| Desktop branch byte-identical behavior | ✅ Yes | Desktop classes/structure preserved (`overflow-x-auto`, `min-w-[640px] md:min-w-0`, sticky headers, 4+6/4+6+1 colSpans, banner, `Apotecario` footer, totals). All 421 baseline tests green unchanged + e2e 14 green. |

Documented deviations (both benign, match apply-progress):
1. `text-[16px]` asserted via className (jsdom cannot resolve Tailwind computed style) — source is `appearance-auto text-[16px]`, spec contract intact.
2. Mobile availability subtitle renders `(race, rol)` + cost as sibling text nodes within one subtitle line (both individually queryable; visually joined by ` · `) — no behavioral difference from the combined-string subtitle.

## TDD Compliance (Strict TDD)
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | `apply-progress.md` "TDD Cycle Evidence" table present (per task rows). |
| All tasks have tests | ✅ | 18/18 tasks map to RED test files that exist on disk (`useIsDesktop.test.tsx`, `RosterTable.test.tsx`, `PlayerAvailabilityTable.test.tsx`, `CreateTeamForm.test.tsx`). |
| RED confirmed (tests exist) | ✅ | 5/5 test files verified on disk (hook 1 + util-colocated + 3 modified). |
| GREEN confirmed (tests pass) | ✅ | 45+15+19+6+12 relevant files all pass on `pnpm test` (446/446 total). |
| Triangulation adequate | ✅ | Hook 6 cases (default true/false/change up/change down/cleanup); RosterTable 10 mobile cases; Availability 7 mobile cases; selects 2 cases — each behavior has distinct expected values, no ghost loops. |
| Safety Net for modified files | ✅ | 35/35 RosterTable, 8/8 Availability, 17/17 CreateTeamForm baseline green before + after. |

**TDD Compliance**: 6/6 checks passed.

## Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit (hook/util/roster/availability/selects) | 85 new-relevant + baseline | 4 (`useIsDesktop.test.tsx`, `RosterTable.test.tsx`, `PlayerAvailabilityTable.test.tsx`, `CreateTeamForm.test.tsx`; util colocated) | vitest + @testing-library/react |
| Integration | (CreateTeamForm/TeamDetailView render trees = integration) | — | @testing-library/react |
| E2E | 14 | 1 (`e2e/create-team.spec.ts`) | Playwright (Desktop Chrome 1280) |
| **Total** | **446 unit + 14 e2e** | **21 + 1** | |

## Changed File Coverage
Coverage analysis skipped — no coverage tool detected (`@vitest/coverage-v8` absent). Not a failure; informational only.

## Assertion Quality (Step 5f)
- **RosterTable mobile tests**: genuinely exercise the mobile branch — `mockMatchMedia(false)` AND assert `queryByRole("table")` is `null` (a node that only exists on the desktop path), plus stacked-card-only subtitle/stats/sections. No tautologies, no ghost loops, no empty-only checks.
- **PlayerAvailabilityTable mobile tests**: same discipline — `queryByRole("table")` null + stacked-row name/subtitle/cost/counter/Add; real `disabled` property assertions (`addBlitzer.disabled`).
- **Select wrapper tests**: assert wrapper `relative`, chevron `span[aria-hidden]` + `pointer-events-none`, `text-[16px]` class, and preserved behavior (`changeRace` → Orc hero, league value change). The `text-[16px]` class assertion is a WARNING-grade implementation-detail check, but it is the only stable jsdom representation (documented deviation) — the same class contract is what ships; no alternative jsdom-verifiable assertion exists.
- **Hook tests**: behavioral value assertions (default `true`, flip `false`, change up/down). The cleanup test asserts `addEventListener("change", fn)` / `removeEventListener("change", fn)` mock-call counts — implementation-detail-ish, but it is the *direct* spec scenario ("Listener removed on unmount") and the only jsdom-verifiable expression of listener removal.
- **No banned patterns found**: no tautologies (`expect(true).toBe(true)`), no orphan empty-array checks, no ghost loops, no type-only-only assertions.

**Assertion quality**: ✅ All assertions verify real behavior (2 WARNING-grade class/mock-count couplings documented above; both are spec-driven or jsdom-limit-driven, not trivial).

## Quality Metrics
**Linter**: ✅ No errors (`pnpm lint` exit 0)
**Type Checker**: ✅ No errors (`npx tsc --noEmit` exit 0)

## Issues Found
**CRITICAL**: None
**WARNING**:
- `text-[16px]` asserted via className rather than resolved computed style (jsdom cannot compute Tailwind) — benign, documented in apply-progress; spec source class contract intact.
- Hook cleanup test uses `vi.fn()` call-count assertions (`addEventListener`/`removeEventListener`) — an implementation-coupling check, but it is the verbatim spec scenario and the only jsdom-verifiable expression; acceptable.
**SUGGESTION**:
- Coverage tooling (`@vitest/coverage-v8`) not installed — the mobile branches + hook are behaviorally verified by targeted mock-`matchMedia` tests, but a per-branch coverage gate would harden future changes. Not blocking.

No pre-existing failures encountered (all safety nets green). Pre-existing `act(...)` warnings in `AppShell.test.tsx`/`TeamList.test.tsx` are unrelated to this change (files not touched) and non-failing.

## Verdict
**PASS** — 29/29 spec scenarios compliant with passing runtime evidence, 446 unit + 14 e2e green, tsc + lint clean, single-branch render confirmed on both viewport paths, 0 blockers, 0 critical findings.
