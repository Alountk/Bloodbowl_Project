# Tasks: Create Team Rulebook Form (Config 4 Wizard)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 420–500 (rework of prior wizard to user-approved Config 4) |
| 400-line budget risk | Medium–High (rework supersedes prior implementation) |
| Chained PRs recommended | No — this is the final approved design on the existing PR branch |
| Suggested split | single PR (rework) |
| Delivery strategy | exception-ok — rework reuses the branch's existing PR; user-approved final design |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

Rework is an exception-to-normal-batch change on the existing `feat/create-team-rulebook` PR branch; scope is the user-approved final wizard.

## Phase 1: Hook — Player N naming + step state (TDD RED→GREEN)

- [x] 1.1 RED: In `useCreateTeamForm.test.ts` revert naming asserts to "Player 1"/"Player 2"; add step tests (initial step 1, nextStep requires name+race, backStep preserves state).
- [x] 1.2 GREEN: In `useCreateTeamForm.ts` revert `addPlayer` default to `Player ${players.length + 1}`; add `step`, `nextStep()` (validates name+race → step 2), `backStep()`, `goToStep`, `errors.race`; export all.
- [x] 1.3 Run `pnpm test` — `useCreateTeamForm.test.ts` green.

## Phase 2: RosterTable editable POSICIÓN subtext (TDD RED→GREEN)

- [x] 2.1 RED: In `RosterTable.test.tsx` add editable-subtext expectations ("Lineman · (Human, Línea)") and keep readOnly "(Human, Línea)" unchanged.
- [x] 2.2 GREEN: In `RosterTable.tsx` render editable subtext `{positional.name} · ({race.name}, {roleEs})`; readOnly unchanged; keep 11/10 cols + scroll container.
- [x] 2.3 Run `pnpm test` — `RosterTable.test.tsx` green.

## Phase 3: PlayerAvailabilityTable (new component, TDD RED→GREEN)

- [x] 3.1 RED: Create `PlayerAvailabilityTable.test.tsx` — headers, subtext, cost, skills, counters, disappearing rows at max, over-budget disable.
- [x] 3.2 GREEN: Create `PlayerAvailabilityTable.tsx` (rulebook style) with Add buttons, `{n}/{max}`, row-disappear at max, over-budget/roster-cap disable.
- [x] 3.3 Run `pnpm test` — `PlayerAvailabilityTable.test.tsx` green.

## Phase 4: CreateTeamForm wizard (TDD RED→GREEN)

- [x] 4.1 RED: Rewrite `CreateTeamForm.test.tsx` for the wizard (step 1 name/race/Siguiente; Siguiente with data → step 2; Editar preserves; step 2 sections; budget texts; race-change dialog; coaching labels).
- [x] 4.2 GREEN: Rewrite `CreateTeamForm.tsx` to the 2-step wizard (step 1 light panel + navy Siguiente; step 2 navy hero + Plantilla + Jugadores disponibles + Coaching + submit).
- [x] 4.3 Run `pnpm test` — `CreateTeamForm.test.tsx` green.

## Phase 5: Page tests (Integration)

- [x] 5.1 Update `app/teams/create/page.test.tsx` to the wizard flow (availability-table positionals, step gating, submit).
- [x] 5.2 Run `pnpm test` — full suite green (408 unit / 19 files).

## Phase 6: E2E rewrite

- [x] 6.1 Rewrite `e2e/create-team.spec.ts` — all 14 scenarios to the wizard flow (step 1 → Siguiente → availability Add → budget → max rows → race-change → over-budget → full create). Keep the console-error test.
- [x] 6.2 Run `pnpm test:e2e` — 14/14 green.

## Phase 7: Docs + gates

- [x] 7.1 Update `openspec/changes/create-team-rulebook/specs/{create-team,roster-table}/spec.md`, `design.md`, and `tasks.md` to the final wizard design.
- [x] 7.2 `pnpm lint` clean; `npx tsc --noEmit` clean.

## Key Learnings

1. The user-approved Config 4 wizard supersedes the earlier table-first + positional-default-naming implementation on the same branch.
2. Reverting default naming to `Player N` is required by the approved spec (`useCreateTeamForm.addPlayer`).
3. The availability table rows disappear at a positional's max (explicit user requirement) instead of merely disabling the Add button.
4. The editable `RosterTable` POSICIÓN subtext is prefixed with the positional name, while read-only detail rendering is unchanged.
