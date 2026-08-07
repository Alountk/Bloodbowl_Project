```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:26a1d67be9ccb12e821daa4544c37ca15931dadde5de74edc2fd62a4bfa7e761
verdict: pass
blockers: 0
critical_findings: 0
requirements: 13/13
scenarios: 31/31
test_command: pnpm test
test_exit_code: 0
test_output_hash: sha256:fb4318493f5c8d545dba339f8494fc5a60656c62cf88fe4860011a6e2bf1ca24
build_command: npx tsc --noEmit
build_exit_code: 0
build_output_hash: sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

## Verification Report

**Change**: table-design-rulebook — COMPLETE (PR1 data + PR2 UI)
**Version**: spec deltas reconciled to v2 model (REQ-RACE-07 two-array; roster-table ES headers/access cols/cost/banner/footer; team-detail-view readOnly+banner+apothecary)
**Mode**: Strict TDD
**Branch**: feat/table-rulebook-ui (stacked on main — PR1 00d0eda merge + PR2 acc62d6/62feb14/522901e)
**Scope**: Complete change — 30 races / 144 positionals data (PR1), RosterTable rulebook UI + consumers + tests + spec reconciliation (PR2), audit finalized (Phase 4).

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 12 (Phases 1–4) |
| Tasks complete | 12/12 |
| Tasks incomplete | 0 |

All tasks `[x]` in `tasks.md`. Phase 4 reconciliation (4.1 spec deltas, 4.2 audit) confirmed complete. No apply work-unit pending.

### Build & Tests Execution

**Build/Type-check**: ✅ Passed
```text
npx tsc --noEmit → exit 0, no output (hash e3b0c442…). All consumers compile with required accessPrimary/accessSecondary.
```

**Tests (unit)**: ✅ 391 passed (17 files), 0 failed, 0 skipped
```text
pnpm test → exit 0 (hash fb431849…). RosterTable.test.tsx 34/34, races-access.test.ts 9/9, TeamDetailView.test.tsx 7/7, CreateTeamForm.test.tsx 19/19, races.test.ts 217/217, roster.test.ts 22/22, skills.test.ts 5/5, etc.
```

**Coverage**: ➖ Not available (no coverage tool configured); informational only per strict module.

**Lint**: ✅ Clean (exit 0)

**E2E**: ✅ 14/14 passed (create-team.spec.ts untouched — consumer contracts preserved)

**Data scan (programmatic, independent)**: ✅ 30 races, 144 positionals, both access arrays present (144 accessPrimary + 144 accessSecondary); letters ⊆ {G,A,P,S,M,F}; canonical order; min ≤ max (all 0-N per OCR).

### Spec Compliance Matrix

**roster-table (11 requirements, 22 scenarios)**

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Light Theme Isolation | Table on dark page | `RosterTable.tsx` light classes (`bg-white max-w-[900px]`, `text-[#1a1a1a]`); exercised by render tests | ✅ COMPLIANT |
| Rulebook Column Set/Order | Header order (read-only) | `RosterTable.test.tsx > "renders the 11 Spanish headers in exact rulebook order"` (`toEqual(ES_HEADERS)`) | ✅ COMPLIANT |
| | Editable remove column | `RosterTable.test.tsx > "appends a blank header cell in editable mode"` (12) | ✅ COMPLIANT |
| Qty Derivation | Explicit minimum | `RosterTable.test.tsx > "shows min-max using an explicit min"` → "2-4" (synthetic `min:2`) | ✅ COMPLIANT |
| | Default minimum | `RosterTable.test.tsx > "defaults min to 0 when absent"` → "0-16" | ✅ COMPLIANT |
| Position Cell / Role Subtitle | Read-only position cell | `RosterTable.test.tsx > "renders player.name plus the (Raza, RolEs) subtitle"` → "(Human, Línea)" | ✅ COMPLIANT |
| | Editable rename preserved | `RosterTable.test.tsx > "editable inputs with preserved aria-label"` (`getByLabelText("Player name for Grak")`) | ✅ COMPLIANT |
| | Unknown role fallback | `RosterTable.test.tsx > "maps an unknown role to the Otro subtitle fallback"` → "(Human, Otro)" | ✅ COMPLIANT |
| Spanish Skill Names | Translated skill | `RosterTable.test.tsx > "renders the Spanish translation … never adds a category suffix"` → "Esquivar", no "(general)"/"(agility)" | ✅ COMPLIANT |
| | Missing translation | `RosterTable.test.tsx > "falls back to the English name"` → "Block" | ✅ COMPLIANT |
| | No starting skills | `RosterTable.test.tsx > "renders Ninguna for a positional with no starting skills"` | ✅ COMPLIANT |
| Access Column Rendering | Access letters present | `RosterTable.test.tsx > "renders PRIMARIAS letters joined by spaces"` → "G F"; `> "renders SECUNDARIAS letters"` → "A" | ✅ COMPLIANT |
| | Access missing | `RosterTable.test.tsx > "renders an em dash for an empty access array"` (≥2 "—") | ✅ COMPLIANT |
| Cost Format | Cost formatting | `RosterTable.test.tsx > "50 000"` (row+totals ≥2); `formatRulebookCost` unit tests ("50 000","170 000","5 000","900") | ✅ COMPLIANT |
| | Editable budget keeps compact | `RosterTable.test.tsx > "keeps formatGold budget text"` → "690k left" | ✅ COMPLIANT |
| Banner | Banner provided with players | `RosterTable.test.tsx > "renders the banner text only when bannerText is provided"` | ✅ COMPLIANT |
| | Banner absent or empty roster | `RosterTable.test.tsx > "does not render a banner when bannerText is absent"` / empty roster | ✅ COMPLIANT |
| Rulebook Footer | Footer with apothecary status | `RosterTable.test.tsx > "renders reroll opportunity and apothecary text"` ("0-8 Segundas oportunidades: 50 000 M.O.", "Apotecario: NO/SÍ") | ✅ COMPLIANT |
| | Footer absent | `RosterTable.test.tsx > "does not render the footer when the apothecary prop is absent"` | ✅ COMPLIANT |
| Totals Row | Totals with new columns | `RosterTable.test.tsx > "shows player count and total cost in rulebook format"` ("2 players","140 000"); colSpan sum 12 | ✅ COMPLIANT |
| Accessibility & Consumers | Editable controls labeled | `RosterTable.test.tsx` remove button + player-name aria-label | ✅ COMPLIANT |
| | Consumer contracts intact | `CreateTeamForm.test.tsx` (19) + e2e `create-team.spec.ts` (14) green — region names, counters, "Add X", budget texts | ✅ COMPLIANT |

**team-detail-view (1 requirement, 3 scenarios)**

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Roster Display (MODIFIED) | Valid roster display | `TeamDetailView.tsx:51` readOnly + bannerText=team.name + apothecary; `TeamDetailView.test.tsx` | ✅ COMPLIANT |
| | Read-only rulebook presentation | ES column set via RosterTable; light theme; no inputs (TeamDetailView.test readOnly) | ✅ COMPLIANT |
| | Read-only totals preserved | `TeamDetailView.test.tsx:88` `getAllByText("50 000")` (row+total), no budget | ✅ COMPLIANT |

**race-data-bb2025 (1 requirement REQ-RACE-07, 6 scenarios)**

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| REQ-RACE-07 Qty Min + Skill Access | High-confidence subset verified first | `races-access.test.ts` Human(p180)/Orc(p189)/Dwarf(p175) exact arrays | ✅ COMPLIANT |
| | Out-of-set letters normalized/flagged | `races-access.test.ts > "restricts every access letter to {G,A,P,S,M,F}"` | ✅ COMPLIANT |
| | Missing access data → `[]` | `races-access.test.ts > "declares both access arrays on every positional"` (all 144; empties `[]`) | ✅ COMPLIANT |
| | Canonical order per column | `races-access.test.ts > "orders each access array canonically G→A→P→S→M→F"`; dedupe test | ✅ COMPLIANT |
| | Min defaults to zero | `races-access.test.ts` min≤max + default-0 invariants; `RosterTable.test.tsx > "defaults min to 0"` → "0-16" | ✅ COMPLIANT |
| | Min defined explicitly | `RosterTable.test.tsx > "shows min-max using an explicit min"` → "2-4" (synthetic `min:2`) | ✅ COMPLIANT |

**Compliance summary**: 31/31 scenarios compliant; 13/13 requirements satisfied.

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| `Positional` + `min?`, `accessPrimary`, `accessSecondary` | ✅ Implemented | `types.ts:14-19`; exact design interface |
| 30 races / 144 positionals both arrays | ✅ Implemented | Programmatic: 144/144 each; 30 race ids |
| Letters ⊆ {G,A,P,S,M,F} (F=Fitness), dedup, canonical order | ✅ Implemented | Test-enforced; 0 out-of-set |
| `min` ≤ `max`, default 0 | ✅ Implemented | Invariant tests + RosterTable render |
| 11 ES headers exact order, +blank editable th | ✅ Implemented | `HEADERS` const, test-locked |
| `formatRulebookCost` space format; budget keeps `formatGold` | ✅ Implemented | cost col + totals; budget "690k left" |
| Role subtitle `(Raza, RolEs)` + `Otro` fallback | ✅ Implemented | `translateRole`/`ROLE_TRANSLATIONS` |
| Skills `es` array-find → `?? skill.name ?? skillId`, no suffix; `[]`→"Ninguna" | ✅ Implemented | `RosterTable.tsx:134-143` |
| Access `join(" ")`→"—" on empty | ✅ Implemented | `RosterTable.tsx:146-151` |
| Banner + footer (apothecary-gated), colSpan 11/12 | ✅ Implemented | Totals 10+1 / 10+1+1; footer 5+6 / 5+6+1 |
| Consumers wired (bannerText+apothecary) | ✅ Implemented | `CreateTeamForm.tsx:218-219`, `TeamDetailView.tsx:51` |
| Chinese/ES business logic | ✅ | — |

### Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| Spanish headers (locked decision 1; English REVOKED) | ✅ Yes | ES_HEADERS exact |
| `formatRulebookCost` (space, no locale dot); cost col + totals; budget keeps `formatGold` | ✅ Yes | Matches design; e2e budget "690k left" green |
| Two arrays `accessPrimary`+`accessSecondary` ⊆ {G,A,P,S,M,F}, F=Fitness, canonical order | ✅ Yes | v2 model reconciled everywhere |
| Local `ROLE_TRANSLATIONS` + `translateRole`, Otro fallback | ✅ Yes | Design 4 |
| Flat `bannerText?`/`apothecary?` props; footer gated on apothecary | ✅ Yes | Design 5 |
| Banner `form.name.trim() || race.name` (create); `team.name` (detail) | ✅ Yes | Design 6 |
| Totals above footer | ✅ Yes | Design 7 |
| Subtitle `(Raza, Rol)` decision 3 | ✅ Yes | "(Human, Línea)"; readOnly keeps player.name |
| Stats: center all except POSICIÓN + HABILIDADES (left) | ✅ Yes | `text-left` on those two, `text-center` rest |
| **Translations es array-find** (apply-noted deviation vs design shorthand `translations.es ?? name`) | ✅ Equivalent | Code uses `skill?.translations.find(t => t.id === "es")?.translation` then `?? skill?.name ?? skillId`. Identical behavior to `translations.es` shorthand and to the proposal (`translations.find(...)?.translation ?? skill.name`); array-find is the actual data-access form. No behavioral difference. |

No design deviations. The single apply-noted "deviation" (es array-find vs `translations.es` shorthand) is behaviorally equivalent and matches the accepted proposal approach; not a defect.

### Issues Found

**CRITICAL**: None
**BLOCKER**: None (change now complete)
**WARNING**: None
**SUGGESTION**:
- (non-blocking) Design Open Question "canonical order G→A→P→S→M→F assumed" remains formally open in design.md:97; data and tests already assume it. Recommend confirming at final review for doc closure.
- (non-blocking) Banner font-weight not confirmed against reference CSS (design.md:98); cosmetic only.

### TDD Compliance

| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | apply-progress (Engram #135) now has the formal RED/GREEN/TRIANGULATE/SAFETY NET column table |
| All tasks have tests | ✅ 12/12 | RosterTable.test.tsx (34), races-access.test.ts (9), TeamDetailView.test.tsx (7), CreateTeamForm.test.tsx (19) |
| RED confirmed (tests exist) | ✅ | All test files exist; RED-to-GREEN cycles reported per task |
| GREEN confirmed (tests pass) | ✅ | Rerun: 391/391 unit + 14/14 e2e pass on execution |
| Triangulation adequate | ✅ | RosterTable: cost(4)+role(2)+banner(3)+qty(2)+skills(4)+access(3)+footer(3)+colSpan(2)+totals(2); races-access: 6 invariant + 3 exact-reference |
| Safety Net for modified files | ✅ | apply-progress: RosterTable 13/13 baseline, CreateTeamForm 19/19, TeamDetailView 7/7 baselines; full suite green before/after |
| Assertion quality | ✅ | Value-derived (exact headers, exact arrays, exact cost strings, exact colSpan sums); no tautologies/ghost loops/orphan empties |
| Previously-PARTIAL scenario now fully covered | ✅ | REQ-RACE-07 "Min defined explicitly" → `RosterTable.test.tsx > "shows min-max using an explicit min"` ("2-4", synthetic min:2) passes at runtime |

**TDD Compliance**: 8/8 checks passed

### Assertion Quality

**Assertion quality**: ✅ All assertions verify real behavior. Every scenario in the matrix maps to a runtime value assertion (`toEqual(ES_HEADERS)`, `getByText("2-4")`, `getAllByText("50 000")`, `getByText("0-16")`, exact Human/Orc/Dwarf arrays from OCR, colSpan-sum reduction). No trivial/tautology/ghost-loop assertions found across RosterTable.test.tsx, races-access.test.ts, TeamDetailView.test.tsx.

### Test Layer Distribution

| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit (value/formatters) | ~115 | RosterTable (unit blocks), races-access, roster, races, skills, id, useCreateTeamForm | vitest |
| Integration (RTL render) | ~276 | RosterTable(render), CreateTeamForm, TeamDetailView, TeamList, pages, stores | @testing-library/react (jsdom) |
| E2E | 14 | 1 (create-team.spec.ts) | @playwright/test |
| **Total** | **391 unit/integration + 14 e2e** | **18** | |

### Quality Metrics

**Linter**: ✅ No errors (`pnpm lint` exit 0)
**Type Checker**: ✅ No errors (`npx tsc --noEmit` exit 0)

### Verdict

**PASS** — the change is complete and fully verified. All 12 tasks checked; **13/13 requirements and 31/31 scenarios** compliant with runtime evidence; 391 unit/integration + 14 e2e green; clean type-check and lint; data invariants hold across all 30 races / 144 positionals; the previously-structural-FAIL blockers are resolved (PR2 UI landed, REQ-RACE-07 spec reconciled to the two-array `{G,A,P,S,M,F}` v2 model, Dwarf audit rows added, previously-PARTIAL `{min}-{max}` scenario now covered by a passing synthetic `min:2` → "2-4" test; apply-progress now reports formal TDD evidence). 0 blockers, 0 CRITICAL, 0 WARNING. Archive-ready.
