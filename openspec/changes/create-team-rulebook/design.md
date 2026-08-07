# Design: Create Team Rulebook Form (Config 4 Wizard)

## Technical Approach

Rework `CreateTeamForm` into a **2-step wizard** (user-approved Config 4): a light book panel ("Paso 1 · Datos del equipo") collects the team name and race, then a navy `#12225a` hero step 2 shows the roster builder. Step 2 renders (1) a "Plantilla" section with the editable `RosterTable` at the top plus the budget bar, (2) a new rulebook-style "Jugadores disponibles" availability table with Add actions and disappearing rows at max, (3) the Coaching Staff section, and (4) the Create Team submit. Default player naming reverts from positional-named to `Player N`. The editable `RosterTable` POSICIÓN cell now shows a subtext `{positional.name} · ({race.name}, {roleEs})` (read-only unchanged). Implements the reworked `create-team` spec + `roster-table` delta spec.

This rework SUPERSEDES the prior table-first + default-positional-naming implementation delivered on this branch.

## Architecture Decisions

| # | Decision | Options | Tradeoff | Decision |
|---|---|---|---|---|
| D1 | Wizard structure | single view vs 2-step | two-step isolates data entry from roster building | **2-step** (`step: 1 | 2` in the hook) |
| D2 | Availability table | new `PlayerAvailabilityTable` component vs inline | dedicated component is independently testable and reusable | **new component** `features/teams/create/PlayerAvailabilityTable.tsx` |
| D3 | Row at max | disable Add (`(n/max)`) vs disappear | user explicitly required rows to disappear at a positional's max | **disappear** (`count >= max` → row returns null); over-budget disables Add but keeps row visible |
| D4 | Default naming | positional-name vs `Player N` | `Player N` matches the independent-name roster; user approved revert | **`Player ${players.length + 1}`** |
| D5 | Editable POSICIÓN subtext | keep `(Raza, RolEs)` vs prefix with positional name | prefix identifies the position in the roster; read-only detail view must not change | **prefix positional name in editable only** |
| D6 | Palette/sections | TeamDetailView book grammar | consistency | navy `#12225a` hero, book h2s with `#d11938` border, light fields, `formatGold`/`formatRulebookCost` preserved |

## Data Flow

`CreateTeamForm → useCreateTeamForm` owns `step`, name, race, players, coaching, league, errors, and submit. `CreateTeamForm → RosterTable` (Plantilla, editable) and → `PlayerAvailabilityTable` (Jugadores disponibles) both derive from `form.players` and `form.race`/`race`. The availability table receives `totalCost` (roster + coaching) to gate over-budget Adds and `maxPlayers` for the roster cap. Budget bar and coaching derive from `formatGold`; the availability cost column uses `formatRulebookCost`.

Step transitions: `step 1` → (name + race + "Siguiente") → `step 2`; `step 2` → ("Editar nombre/raza") → `step 1` with state preserved.

## File Changes

| File | Action | Description |
|---|---|---|
| `features/teams/create/useCreateTeamForm.ts` | Modify | Revert addPlayer to `Player N`; add `step`, `nextStep`, `backStep`, `goToStep`; add `errors.race` validation |
| `features/teams/create/CreateTeamForm.tsx` | Modify | Rewrite to 2-step wizard; step 2 hero, Plantilla, Jugadores disponibles, Coaching, submit |
| `features/teams/create/PlayerAvailabilityTable.tsx` | Create | Rulebook availability table (columns, Add, disappearing rows, over-budget disable) |
| `features/teams/roster-table/RosterTable.tsx` | Modify | Editable POSICIÓN subtext includes positional name; read-only unchanged; keep 11/10 col, scroll container |
| `features/teams/create/useCreateTeamForm.test.ts` | Modify | Revert naming asserts to "Player 1"/"Player 2"; add step tests |
| `features/teams/create/CreateTeamForm.test.tsx` | Rewrite | Wizard flow tests |
| `features/teams/create/PlayerAvailabilityTable.test.tsx` | Create | Availability table behavior tests |
| `features/teams/roster-table/RosterTable.test.tsx` | Modify | Editable subtext expectations; read-only unchanged |
| `app/teams/create/page.test.tsx` | Modify | Wizard flow + availability table assertions |
| `e2e/create-team.spec.ts` | Rewrite | Wizard flow across all 14 scenarios |

## Layout Order (step 2 content)

1. Navy hero `#12225a`: team name (large) + "{race.name} · Paso 2" + "Editar nombre/raza" button
2. `section aria-label="Plantilla"`: book h2 "Plantilla", editable `RosterTable` (TOP), budget bar (`formatGold` texts), progress bar
3. `section aria-label="Jugadores disponibles"`: book h2, `PlayerAvailabilityTable`
4. `section aria-label="Coaching Staff"`: English labels, `{X}k gc` totals
5. Errors `role="alert"` + navy "Create Team" submit

Class vocabulary matches the shipped rulebook-light grammar (`#12225a`, `#d11938`, `#e2e8f0`/`#f1f5f9`, slate text, `bg-white`).

## Availability Table Column Contract

| POSICIÓN | COSTE | MV | FU | AG | PS | AR | HABILIDADES Y RASGOS | DISP. |
|---|---|---|---|---|---|---|---|---|
| name + "· ({race.name}, {roleEs})" | `formatRulebookCost` | ma | st | ag | pa | av | ES skills/"Ninguna" | `{n}/{max}` + "+ Add" button |

Row disappears at `count >= max`; Add disabled when `totalCost + cost > STARTING_TREASURY` or at `MAX_PLAYERS`.

## Testing Strategy

| Layer | What | How |
|---|---|---|
| Unit — hook | `Player N` naming; step 1→2/blocked/back | `useCreateTeamForm.test.ts` (revert + add step tests) |
| Unit — table | editable subtext; readOnly unchanged; 11/10 cols; scroll | `RosterTable.test.tsx` (update editable position cell) |
| Unit — availability | headers, subtext, cost, skills, counters, disappearing rows, over-budget disable | `PlayerAvailabilityTable.test.tsx` (new) |
| Integration — form | wizard step flow; sections; validation; race dialog; coaching | `CreateTeamForm.test.tsx` (rewrite) + `app/teams/create/page.test.tsx` |
| E2E | wizard journey + budget math + max + race change + over-budget | `e2e/create-team.spec.ts` (rewrite, 14 scenarios) |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

The previous implementation on this branch is superseded; the resulting diff reworks it to the wizard. Single PR; rollback = `git revert`.

## Open Questions

None — the Config 4 wizard design is user-approved and is the source of truth for this apply.
