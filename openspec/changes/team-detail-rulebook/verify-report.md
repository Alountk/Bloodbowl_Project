```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:43451abf9594b01f35a6a674bc0ed3a07ed2fd91f83ba8bc2d916a9b35ddec28
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 9/9
scenarios: 22/22
test_command: pnpm test
test_exit_code: 0
test_output_hash: sha256:98ae9b808d417f04dda20a1c439fc2cd25ccf01d73f375d8999eba3930b37811
build_command: npx tsc --noEmit
build_exit_code: 0
build_output_hash: sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

## Verification Report

**Change**: team-detail-rulebook (COMPLETE change — PR1 RosterTable readOnly + PR2 TeamDetailView Style A)
**Version**: N/A (delta specs team-detail-view + roster-table)
**Mode**: Strict TDD
**Branch**: feat/detail-roster-format

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 13 (1.1–1.5 PR1, 2.1–2.4 PR2, 3.1–3.2 Phase3, 4.1 Phase4) |
| Tasks complete | 13/13 |
| Tasks incomplete | 0 |
| Verification scope | Full change (PR1 + PR2) — all phases checked in tasks.md and apply-progress |

### Build & Tests Execution
**Build (type-check)**: ✅ Passed — `npx tsc --noEmit` exit 0, silent (empty output hash `e3b0c442…855`)

**Lint**: ✅ Passed — `pnpm lint` exit 0 (ESLint clean, no warnings)

**Tests (unit)**: ✅ 396 passed / 0 failed / 0 skipped — `pnpm test` (vitest run), exit 0
```text
Test Files  18 passed (18)
Tests       396 passed (396)
```
Includes: `TeamDetailView.test.tsx` 11/11, `RosterTable.test.tsx` 32/32, `format.test.ts` 3/3, `page.test.tsx` 4/4 (hero h1 "Test Team"), `not-found.test.tsx` 2/2.

**E2E**: ✅ 14 passed / 0 failed — `pnpm test:e2e` (playwright, create-team.spec.ts), exit 0 — create-team editable path untouched and green

**Coverage**: ➖ Not available (no coverage tool configured in this project)

### Spec Compliance Matrix
| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| team-detail-view: Identity Display | Displaying a valid team | `TeamDetailView.test.tsx > "renders the Style A hero: team name, bold race, league label, and tags"` | ✅ COMPLIANT |
| team-detail-view: Identity Display | League type display labels | `TeamDetailView.test.tsx > "maps exhibition league to its Spanish label and never shows raw tokens"` (raw `open`/`exhibition` null) | ✅ COMPLIANT |
| team-detail-view: Roster Display | Valid roster display | `TeamDetailView.test.tsx > "renders readOnly player names and no remove buttons"`; `TeamDetailView.tsx:71` passes only `readOnly players race` (no bannerText/apothecary) | ✅ COMPLIANT |
| team-detail-view: Roster Display | Read-only rulebook presentation | `RosterTable.test.tsx > "renders exactly 10 read-only headers…"`; `TeamDetailView.test.tsx > "renders the RosterTable footer suppressed"` (no banner/rename/remove) | ✅ COMPLIANT |
| team-detail-view: Roster Display | Read-only totals preserved | `RosterTable.test.tsx > reader-only totals "<n> jugadores · Coste total"` + `TeamDetailView` no budget text | ✅ COMPLIANT |
| team-detail-view: Coaching Staff Display | Coaching breakdown | `TeamDetailView.test.tsx > "renders coaching breakdown rows with unit and total; apothecary NO when absent"` (4 rows, ES labels, Apotecario NO) | ✅ COMPLIANT |
| team-detail-view: Coaching Staff Display | Apothecary present | `TeamDetailView.test.tsx > "shows Apotecario SÍ with total 50 000 and total row = items + 50 000 when present"` (total 160 000) | ✅ COMPLIANT |
| team-detail-view: Coaching Staff Display | No apothecary | `TeamDetailView.test.tsx > "shows total cuerpo técnico = items sum when no apothecary"` (total 110 000) | ✅ COMPLIANT |
| team-detail-view: Derived Treasury Display | Treasury calculation | `TeamDetailView.test.tsx > "renders three treasury cards with rulebook-formatted values"` (150 000 / 100 000 / 750 000) | ✅ COMPLIANT |
| team-detail-view: Derived Treasury Display | Apothecary included | `TeamDetailView.test.tsx > "includes apothecary in the coaching card and reduces remaining treasury"` (150 000 / 700 000) | ✅ COMPLIANT |
| roster-table: Rulebook Column Set and Order | Header order (read-only) | `RosterTable.test.tsx > "renders exactly 10 read-only headers in rulebook order without CANT. or a blank cell"` | ✅ COMPLIANT |
| roster-table: Rulebook Column Set and Order | Editable remove column | `RosterTable.test.tsx > "appends CANT. and a blank header cell in editable mode (12 columns)"` | ✅ COMPLIANT |
| roster-table: Qty Derivation | Explicit minimum | `RosterTable.test.tsx > "shows min-max using an explicit min in editable mode"` (2-4) | ✅ COMPLIANT |
| roster-table: Qty Derivation | Default minimum | `RosterTable.test.tsx > "defaults min to 0 when absent in editable mode"` (0-16) | ✅ COMPLIANT |
| roster-table: Qty Derivation | Hidden in read-only | `RosterTable.test.tsx > "does not render a quantity cell in read-only mode"` | ✅ COMPLIANT |
| roster-table: Banner | Banner provided with players (editable) | `RosterTable.test.tsx > "renders the banner text only when bannerText is provided and the roster is non-empty (editable)"` | ✅ COMPLIANT |
| roster-table: Banner | Read-only suppresses banner | `RosterTable.test.tsx > "suppresses the banner in read-only mode even when bannerText is provided"` | ✅ COMPLIANT |
| roster-table: Banner | Banner absent or empty roster | `RosterTable.test.tsx > "does not render a banner when bannerText is absent"` + `"does not render a banner for an empty roster even when bannerText is provided"` | ✅ COMPLIANT |
| roster-table: Rulebook Footer | Footer with apothecary status | `RosterTable.test.tsx > "renders reroll opportunity and apothecary text…"` + `"shows Apotecario: SÍ…"` + `"spans the footer columns correctly (4+6 readOnly, 5+6+1 editable)"` | ✅ COMPLIANT |
| roster-table: Rulebook Footer | Footer absent | `RosterTable.test.tsx > "does not render the footer when the apothecary prop is absent"` | ✅ COMPLIANT |
| roster-table: Totals Row | Read-only totals | `RosterTable.test.tsx > "shows a navy ES totals row with player count and total cost in rulebook format, spanning 10 columns (readOnly)"` (2 jugadores · Coste total, 140 000, sum 10) | ✅ COMPLIANT |
| roster-table: Totals Row | Editable totals preserved | `RosterTable.test.tsx > "keeps formatGold budget text in editable totals and spans 12 columns"` ("2 players", "690k left", sum 12) | ✅ COMPLIANT |

**Compliance summary**: 22/22 scenarios compliant

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| TeamDetailView Style A hero (navy #12225a, name h1, `<b>Race</b> · Liga Abierta/Exhibición`, tags) | ✅ Implemented | `TeamDetailView.tsx:44-59` — hero bg `#12225a`, h1 name, bold race, LEAGUE_LABELS mapping, "Equipo listo" + gold "Tesorería: N" tag |
| LEAGUE_LABELS exact mapping | ✅ Implemented | `TeamDetailView.tsx:13-16` — `open→"Liga Abierta"`, `exhibition→"Exhibición"` |
| Raw league tokens never in DOM | ✅ Implemented | meta line renders `LEAGUE_LABELS[t] ?? t` (line 49); tests assert `queryByText(/exhibition|open/)` is null |
| 3 Spanish book sections (Plantilla/Cuerpo técnico/Tesorería) | ✅ Implemented | `TeamDetailView.tsx:63-69, 76-82, 139-145` — heading border `#d11938`, text `#12225a` |
| readOnly RosterTable WITHOUT bannerText/apothecary | ✅ Implemented | `TeamDetailView.tsx:71` — `<RosterTable readOnly players={team.roster} race={race} />`; footer-suppression test green |
| Coaching table (Concepto/Cantidad/Coste unitario/Total, navy header, zebra) | ✅ Implemented | `TeamDetailView.tsx:83-135` — navy thead, zebra `#f1f5f9`, numeric tabular-nums |
| Apotecario row always (SÍ green/NO, unit 50 000, total 50 000/0) | ✅ Implemented | `TeamDetailView.tsx:116-127` — green `text-green-600` for SÍ; unit/total via `formatRulebookCost` |
| Total row bg #e2e8f0 = computeCoachingCost incl. apothecary | ✅ Implemented | `TeamDetailView.tsx:128-133` — `bg-[#e2e8f0] font-bold`, total `computeCoachingCost(race, team.coaching)` |
| 3 treasury cards (Coste plantilla / Cuerpo técnico / Tesorería restante) | ✅ Implemented | `TeamDetailView.tsx:146-165` — 3 cards, `formatRulebookCost` values; treasury = STARTING − roster − coaching |
| format.ts shared formatRulebookCost (directive-free) + 3 unit cases | ✅ Implemented | `format.ts:1-4` no `"use client"`; `format.test.ts` 3/3 passing (50 000 / 170 000 / 5 000 / 900) |
| RosterTable readOnly 10 cols (no CANT.), inert footer 4+6=10 | ✅ Implemented | `RosterTable.tsx:41,75,88,101,191-200` — RULEBOOK_HEADERS(10), CANT. gated editable, Qty gated, footer colSpan 4+6 |
| Navy totals "{n} jugadores · Coste total" colSpan 7+1+2=10 | ✅ Implemented | `RosterTable.tsx:170-177` — bg `#12225a`, colSpan 7+1+2, formatRulebookCost |
| Editable unchanged (12 cols, CANT., English totals, budget) | ✅ Implemented | `RosterTable.tsx:42,178-189` — EDITABLE_HEADERS(11)+blank th=12, "players" + formatGold budget sum 12 |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| `formatRulebookCost` moved to `features/teams/format.ts` (directive-free) | ✅ Yes | 4-line module, no directive; imported from `../format` in RosterTable + TeamDetailView; format.test.ts covers it; no local duplicate |
| LEAGUE_LABELS local const (`open→"Liga Abierta"`, `exhibition→"Exhibición"`) with defensive `??` fallback | ✅ Yes | `TeamDetailView.tsx:13-16,49` — exact match |
| readOnly footer kept with colSpans 4+6=10 | ✅ Yes | inert path (no readOnly `apothecary` consumer); tested span sum 10 |
| readOnly totals navy #12225a, label colSpan 7 + cost 1 + empty 2 = 10 | ✅ Yes | `RosterTable.tsx:170-177` exact match |
| Banner mode-gate `!readOnly && bannerText !== undefined && bannerText.length > 0` | ✅ Yes | `RosterTable.tsx:62` exact match |
| Editable totals budget/footer unchanged | ✅ Yes | 12-col sum asserted; editable tests green; create-team e2e (14) green |
| Treasury cards: "Tesorería restante" value **gold `#d11938`** (`.gold .v text-[#d11938]`) | ❌ No | Implementation renders amber-tag "Tesorería: N" in hero gold, but the 3rd treasury card's value uses `text-[#12225a]` (navy) — not gold `#d11938` as spec/design mandate. Cosmetic deviation; no runtime scenario asserts color, all value/label behavior correct |
| Coaching table Apotecario SÍ green `#16a34a` | ✅ Yes | `TeamDetailView.tsx:118` — `text-green-600` (Tailwind v4 resolves green-600 ≈ #16a34a); acceptable |

### TDD Compliance (Strict)
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | apply-progress (Engram #148) has formal RED/GREEN/TRIANGULATE/SAFETY NET column-table for tasks 2.1/2.2; PR1 cycles checkmarked in tasks.md (1.1/1.2 RED, 1.3/1.4 GREEN) |
| All tasks have tests | ✅ 13/13 | PR1 via `format.test.ts` + `RosterTable.test.tsx`; PR2 via `TeamDetailView.test.tsx`; page/not-found via `page.test.tsx`/`not-found.test.tsx` |
| RED confirmed (tests exist) | ✅ | Test files exist in HEAD and pass (format 3, RosterTable 32, TeamDetailView 11, page 4, not-found 2) |
| GREEN confirmed (tests pass) | ✅ | Full suite 396 passes on execution; PR2 apply-progress records 11/11 TeamDetailView GREEN after 10/11 RED |
| Triangulation adequate | ✅ | Distinct values: open+exhibition, SÍ+NO apothecary, qty 0-16/2-4, treasury 750k/700k, spans 10/12, format 50 000/170 000/5 000/900 |
| Safety Net for modified files | ✅ | TeamDetailView.test.tsx (reused) safety net 7/7; RosterTable.test.tsx reused with full-suite green; create-team e2e untouched |
| Assertion quality | ✅ | No tautologies, ghost loops, orphan empty checks, smoke-only renders, CSS-class assertions in changed tests |

**TDD Compliance**: 7/7 checks passed

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | 396 (vitest) | 18 | vitest + @testing-library/react + jsdom |
| E2E | 14 | 1 | @playwright/test |
| **Total** | **410** | **19** | |

### Changed File Coverage
➖ Coverage analysis skipped — no coverage tool detected (no coverage script/plugin configured)

### Assertion Quality
**Assertion quality**: ✅ All assertions verify real behavior
- No tautologies, ghost loops, orphan empty checks, smoke-only renders, or CSS-class assertions in any changed test.
- `getByText`/`getAllByText` presence assertions are behavioral; colSpan-sum, count, and `.textContent` value assertions measure real rendered structure.
- `queryByText(/open|exhibition/)` null-checks directly prove the raw-league-token-never-renders spec claim.

### Quality Metrics
**Linter**: ✅ No errors (exit 0)
**Type Checker**: ✅ No errors (`npx tsc --noEmit` exit 0, empty output)

### Issues Found
**CRITICAL**: None

**WARNING**:
1. **"Tesorería restante" treasury card value is not gold `#d11938`** — spec (`Derived Treasury Display`) and design (`.gold .v text-[#d11938]`) mandate gold for the third card's value, but `TeamDetailView.tsx:162` renders `text-[#12225a]` (navy) like the other two cards. Cosmetic deviation; all behavioral aspects (labels, `formatRulebookCost` values, treasury derivation) are correct and tested. One-class change (`#12225a`→`#d11938` on the third card's value) to align with spec/design.

**SUGGESTION**: None.

### Verdict
PASS WITH WARNINGS
Complete change (PR1 + PR2) verified: 9/9 requirements and 22/22 spec scenarios across both delta specs are compliant with passing runtime evidence. `pnpm test` 396/396, `pnpm test:e2e` 14/14, `pnpm lint` exit 0, `npx tsc --noEmit` exit 0. Strict TDD cycle fully evidenced (RED→GREEN with test files existing and passing). Single warning is a cosmetic color deviation on the "Tesorería restante" card value (navy instead of gold `#d11938`) — a one-line style fix, not a behavioral defect, with zero blockers and zero critical findings.
