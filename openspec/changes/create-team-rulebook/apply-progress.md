# Apply Progress: Create Team Rulebook Form (Config 4 Wizard)

**Status**: Complete (all rework tasks done)
**Mode**: Strict TDD
**Delivery**: single PR — `feat/create-team-rulebook` (existing PR #16, not re-created)
**Branch**: `feat/create-team-rulebook`

## Summary

Reworked the implementation to the user-approved **Config 4 two-step wizard**, superseding the prior table-first + default-positional-naming implementation. Step 1 is a light book panel ("Paso 1 · Datos del equipo") with team name + race + navy "Siguiente →"; Step 2 is a navy hero with Plantilla (editable RosterTable + budget bar), a new "Jugadores disponibles" availability table (rows disappear at max, Add disables when over budget), Coaching Staff, and Create Team submit. Default player naming reverted to `Player N`; editable `RosterTable` POSICIÓN subtext is now prefixed with the positional name (read-only unchanged).

## Completed Tasks

See `tasks.md` — all Phase 1–7 tasks are marked `[x]`.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1–1.2 hook naming + step | `useCreateTeamForm.test.ts` | Unit | ✅ 24 existing | ✅ Written (naming revert + 5 step tests) | ✅ Passed (28) | ✅ step1/valid/name-block/race-block/back-preserve | ✅ Step state isolated in hook |
| 2.1–2.2 RosterTable subtext | `RosterTable.test.tsx` | Unit | ✅ 32 existing | ✅ Written (editable + readOnly unchanged + Otro fallback) | ✅ Passed (34) | ✅ editable, readOnly, unknown-role | ➖ Clean (readOnly path preserved) |
| 3.1–3.2 availability table | `PlayerAvailabilityTable.test.tsx` | Unit | N/A (new) | ✅ Written (7 tests) | ✅ Passed | ✅ headers/subtext/cost/skills/max/budget/roster-cap | ✅ Rendered name+subtext as single node |
| 4.1–4.2 wizard form | `CreateTeamForm.test.tsx` | Integration | ✅ prior 21 replaced | ✅ Rewritten (17 tests) | ✅ Passed | ✅ step1/step2/Editar/max/race-dialog/coaching | ✅ Step gating by `form.step` not race presence |
| 5.1 page tests | `app/teams/create/page.test.tsx` | Integration | ✅ 6 existing | ✅ Updated | ✅ Passed (6) | ✅ sections, submit, budget | ✅ No unused params |
| 6.1–6.2 e2e | `e2e/create-team.spec.ts` | E2E | ✅ 14 existing | ✅ Rewritten (14 scenarios) | ✅ Passed (14) | ✅ full journey, math, max, race-change, over-budget | ✅ Alert role for validation |

### Test Summary
- Total tests written (new/changed): 7 availability + 5 hook step + 2 RosterTable subtext + rewritten form (17) + page (6) + e2e (14) covering the wizard
- Total suite: **408 unit** (19 files) + **14 e2e**
- Layers used: Unit (hook, RosterTable, availability), Integration (CreateTeamForm, page), E2E (create-team.spec)
- Pure functions created: 0 (component + hook state; existing pure helpers reused)

## Work Unit Evidence

| Unit | Focused test command & result | Runtime harness & result | Rollback boundary |
|------|-------------------------------|--------------------------|-------------------|
| 1. Hook (Player N + step) | `npx vitest run features/teams/create/useCreateTeamForm.test.ts` → 28 passed | Form-level harness in CreateTeamForm tests covers step flow; `N/A` standalone runtime. | `useCreateTeamForm.ts` + its test |
| 2. RosterTable subtext | `npx vitest run features/teams/roster-table/RosterTable.test.tsx` → 34 passed | Covered by form/e2e rendering the editable table. | `RosterTable.tsx` + test |
| 3. Availability table | `npx vitest run features/teams/create/PlayerAvailabilityTable.test.tsx` → 7 passed | e2e adds players via Add buttons; rows disappear at max. | `PlayerAvailabilityTable.tsx` + test |
| 4. Wizard form | `npx vitest run features/teams/create/CreateTeamForm.test.tsx app/teams/create/page.test.tsx` | `pnpm test:e2e` → 14 passed (full journey) | `CreateTeamForm.tsx` + tests |

## Deviations from Design

- **Race-change dialog placement**: design sketch put the dialog "in step 2"; since the race select only exists in step 1 (reached via "Editar nombre/raza"), the dialog is rendered whenever `pendingRaceId !== null` so it appears adjacent to the step-1 race controls. Behavior (Confirm clears roster, Cancel preserves) unchanged.
- **Availability POSICIÓN rendering**: rendered name + subtext as a single text node on one line to match the design's combined string example; the subtext-class two-line treatment used elsewhere was not needed here.

## Issues Found

- e2e placeholder ambiguity: `getByText("Select a race")` also matched the placeholder option — resolved by asserting the `role="alert"` element instead.
- Step-2 conditional initially keyed on race presence (would have jumped to step 2 on race select); corrected to key on `form.step === 2`.

## Commits

(Work-unit commits listed in the final return envelope.)

## Gates (final)

- `pnpm test` → 408 passed (19 files)
- `pnpm test:e2e` → 14 passed (rewritten spec)
- `pnpm lint` → clean
- `npx tsc --noEmit` → clean
