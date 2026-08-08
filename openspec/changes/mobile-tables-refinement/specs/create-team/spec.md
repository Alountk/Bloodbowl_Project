# Delta for create-team

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Jugadores Disponibles Availability Table

When a race is selected, Step 2 MUST render a "Jugadores disponibles" rulebook-style table with columns POSICIÓN | COSTE | MV | FU | AG | PS | AR | HABILIDADES Y RASGOS | DISP. On the DESKTOP branch each row shows a positional's name with "(Raza, RolEs)" subtext, `formatRulebookCost` cost, stats, Spanish skills (fallback to English, "Ninguna" if empty), and a DISP. cell with a `{n}/{max}` counter plus a button `aria-label="Add {positional.name}"` labeled "+ Add". The desktop container keeps an outer scroll wrapper and a nested `overflow-x-auto` wrapper with an inner panel `min-w-[640px] md:min-w-0`; sticky headers MUST be preserved. Below `md`, the MOBILE branch MUST render stacked rows per the "Mobile Availability Stacked Rows" requirement.
(Previously: the horizontal-scroll wrapper applied on mobile; mobile now renders stacked rows instead.)

#### Scenario: Desktop book table preserved

- GIVEN a race selected on step 2 at or above `md`
- WHEN the availability table renders
- THEN the nine rulebook headers appear and each row shows "{positional.name} · ({race.name}, {roleEs})"
- AND the `overflow-x-auto` wrapper and `min-w-[640px] md:min-w-0` panel are present

#### Scenario: Disappearing row at max

- GIVEN a positional has reached its max count
- WHEN the availability table renders
- THEN that row (including its Add button) is NOT rendered

#### Scenario: Over-budget Add disabled

- GIVEN adding a positional would exceed the 1,000,000 gc budget
- WHEN the availability table renders
- THEN its Add button is disabled but the row stays visible
