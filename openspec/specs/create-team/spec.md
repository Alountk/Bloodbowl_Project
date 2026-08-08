# create-team Specification

## Purpose

Contract for the `CreateTeamForm` **2-step wizard** (Config 4, user-approved): a light book panel for team data (Step 1), then a navy rulebook hero with the roster builder, rulebook availability table, coaching staff, and submit (Step 2). Supports default `Player N` naming, editable `POSICIÓN` subtext, and a rulebook-style `Jugadores disponibles` table where rows disappear at a positional's max and Add buttons disable when over budget.

## Requirements

### Requirement: Two-Step Wizard Navigation

The form MUST present two distinct steps. Step 1 collects the team name and race in a light book panel titled "Paso 1 · Datos del equipo" with a navy "Siguiente →" button. Submitting step 1 (with a name and race) advances to step 2. A user may return to step 1 via an "Editar nombre/raza" action while preserving all entered state.

#### Scenario: Initial step is 1

- GIVEN the form renders fresh
- WHEN it renders
- THEN it shows the "Paso 1 · Datos del equipo" panel with team name and race controls and a "Siguiente →" button

#### Scenario: Advance to step 2 with valid data

- GIVEN a name and race are entered on step 1
- WHEN "Siguiente →" is clicked
- THEN step 2 renders with a navy hero showing the team name and a "{race.name} · Paso 2" subline
- AND step 2 exposes Plantilla, Jugadores disponibles, and Coaching Staff

#### Scenario: Validation blocks step advance

- GIVEN a missing name OR missing race on step 1
- WHEN "Siguiente →" is clicked
- THEN the form stays on step 1 and shows a validation alert ("Team name is required" and/or "Select a race")

#### Scenario: Return to step 1 preserves state

- GIVEN step 2 is active with a name, race, and roster
- WHEN "Editar nombre/raza" is clicked
- THEN step 1 re-renders with the previously entered name and race intact

### Requirement: Responsive Step 2 Hero and Panels

Below the `md` breakpoint the step-2 navy hero and the wizard panels MUST scale down for mobile: the step-2 hero text MUST use responsive tokens (e.g. `text-2xl md:text-[28px]`) and the hero/panel horizontal padding MUST tighten (e.g. `px-4 sm:px-6`). Content MUST remain legible and not overflow at 375px.

#### Scenario: Hero text scales fluidly

- GIVEN a step-2 hero on a mobile viewport
- WHEN the hero heading renders
- THEN it uses a smaller base token that steps up at `md`

#### Scenario: Panel padding tightens on mobile

- GIVEN the wizard renders below `md`
- WHEN the step panels render
- THEN their horizontal padding is reduced relative to desktop and nothing overflows

### Requirement: Step 2 Plantilla Section

Step 2 MUST render a "Plantilla" section containing the editable `RosterTable` at the top, followed by the budget bar (using `formatGold` strings "{n} player(s) · {cost}k / 1,000k gc", "{X}k remaining", "Over budget by {X}k"). An empty roster MUST show the table's empty-state message ("No players in roster yet.").

#### Scenario: Empty roster message

- GIVEN step 2 renders with no players
- WHEN the Plantilla section renders
- THEN the "No players in roster yet." message is visible

#### Scenario: Budget bar contract

- GIVEN a roster costing 690k of 1,000k
- WHEN the budget bar renders
- THEN it shows "5 players · 690k / 1,000k gc"
- AND over budget shows "Over budget by 110k"

### Requirement: Native Select Wrapper with Chevron Element

In `CreateTeamForm`, the Race select (step 1) and the League type select (coaching) MUST each be wrapped in a relative-positioned div containing a separate chevron element with `pointer-events: none` — NOT a background-image — so the chevron renders on Samsung Android. The native `select` MUST use `font-size: 16px` to prevent iOS auto-zoom. Labels, handlers, and `aria-label="League type"` MUST be preserved.

#### Scenario: Race select has wrapper+chevron

- GIVEN step 1 renders the Race select
- WHEN its wrapper renders
- THEN a wrapper div with a child chevron (`pointer-events: none`) is present
- AND the select has `font-size: 16px` and still calls `changeRace`

#### Scenario: League type select has wrapper+chevron

- GIVEN the coaching section renders the League type select
- WHEN its wrapper renders
- THEN a wrapper div with a child chevron element is present
- AND the `aria-label="League type"` and change handler are preserved

### Requirement: Mobile Availability Stacked Rows

Below `md` the "Jugadores disponibles" table MUST render stacked rows instead of the book table. Each row MUST show: name line, subtitle `({race.name}, {rol})` with rulebook cost, counter `{n}/{max}` with a "+ Add" button ALWAYS visible (`aria-label="Add {positional.name}"`), stats chips MV FU AG PS AR, and labeled rows SKILLS / PRIMARIAS / SECUNDARIAS. The row MUST disappear once the positional reaches its max; the Add button MUST disable (row stays visible) when a purchase would exceed budget or roster cap.

#### Scenario: Mobile availability row content

- GIVEN a race selected below `md`
- WHEN an availability row renders
- THEN the name shows with subtitle `({race.name}, {rol})` and cost, counter `{n}/{max}`, and a visible "+ Add" button (`aria-label="Add {positional.name}"`)

#### Scenario: Add always visible on mobile

- GIVEN a mobile row whose count is below max
- WHEN it renders
- THEN the "+ Add" button is always rendered (no expand/chevron needed)

#### Scenario: Row disappears at max

- GIVEN a positional has reached its max below `md`
- WHEN the availability list renders
- THEN that row (including its Add button) is NOT rendered

#### Scenario: Over-budget Add disabled on mobile

- GIVEN adding a positional would exceed the 1,000,000 gc budget below `md`
- WHEN the availability row renders
- THEN its "+ Add" button is disabled but the row stays visible

### Requirement: Jugadores Disponibles Availability Table

When a race is selected, Step 2 MUST render a "Jugadores disponibles" rulebook-style table with columns POSICIÓN | COSTE | MV | FU | AG | PS | AR | HABILIDADES Y RASGOS | DISP. On the DESKTOP branch each row shows a positional's name with "(Raza, RolEs)" subtext, `formatRulebookCost` cost, stats, Spanish skills (fallback to English, "Ninguna" if empty), and a DISP. cell with a `{n}/{max}` counter plus a button `aria-label="Add {positional.name}"` labeled "+ Add". The desktop container keeps an outer scroll wrapper and a nested `overflow-x-auto` wrapper with an inner panel `min-w-[640px]`; sticky headers MUST be preserved. Below `md`, the MOBILE branch MUST render stacked rows per the "Mobile Availability Stacked Rows" requirement.
(Previously: the horizontal-scroll wrapper applied on mobile; mobile now renders stacked rows instead.)

#### Scenario: Desktop book table preserved

- GIVEN a race selected on step 2 at or above `md`
- WHEN the availability table renders
- THEN the nine rulebook headers appear and each row shows "{positional.name} · ({race.name}, {roleEs})"
- AND the `overflow-x-auto` wrapper and `min-w-[640px]` panel are present

#### Scenario: Disappearing row at max

- GIVEN a positional has reached its max count
- WHEN the availability table renders
- THEN that row (including its Add button) is NOT rendered

#### Scenario: Over-budget Add disabled

- GIVEN adding a positional would exceed the 1,000,000 gc budget
- WHEN the availability table renders
- THEN its Add button is disabled but the row stays visible

### Requirement: Default Player Naming

New players MUST default their name to "Player N" (incrementing per player added, e.g. "Player 1", "Player 2"), and the name input remains editable.

#### Scenario: First player

- GIVEN a fresh roster
- WHEN a player is added
- THEN its default name is "Player 1"

#### Scenario: Incrementing names

- GIVEN two players
- WHEN a second is added
- THEN its default name is "Player 2"

### Requirement: Editable POSICIÓN Subtext

In editable mode the `RosterTable` POSICIÓN cell MUST render a subtext of "{positional.name} · ({race.name}, {roleEs})" (e.g. "Hobgoblin Lineman · (Chaos Dwarf, Línea)"). Read-only mode MUST retain the existing "({race.name}, {roleEs})" subtext unchanged.

#### Scenario: Editable subtext includes positional name

- GIVEN an editable roster
- WHEN a row's POSICIÓN cell renders
- THEN the subtext shows the positional name, race name, and Spanish role

#### Scenario: Read-only subtext unchanged

- GIVEN a read-only roster
- WHEN a row's POSICIÓN cell renders
- THEN the subtext shows only "({race.name}, {roleEs})"

### Requirement: Coaching Staff English Labels

The Coaching Staff section MUST keep English labels (Rerolls, Dedicated Fans, Assistant Coaches, Cheerleaders, Apothecary, League type), light styling, unchanged `formatGold` `{X}k gc` strings, and region `aria-label="Coaching Staff"`.

#### Scenario: Labels and cost strings

- GIVEN the Coaching Staff renders
- THEN the six English labels appear reachable via `getByLabel`
- AND the total is shown in `{X}k gc` format

### Requirement: Submit Team

Step 2 MUST render a navy "Create Team" submit button. On submit the form reuses the existing validation (name required, at least 3 players, budget not exceeded) and clears the form on success.

#### Scenario: Submit valid

- GIVEN step 2 with a valid roster
- WHEN "Create Team" is clicked
- THEN the team is created and the form resets to step 1

#### Scenario: Submit blocked when over budget

- GIVEN a roster over the 1,000,000 gc budget
- WHEN "Create Team" is clicked
- THEN the submission is blocked and "Roster exceeds the 1,000,000 gc budget" is shown
