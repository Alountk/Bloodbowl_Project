# Delta for create-team

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Jugadores Disponibles Availability Table

When a race is selected, Step 2 MUST render a "Jugadores disponibles" rulebook-style table with columns POSICIÓN | COSTE | MV | FU | AG | PS | AR | HABILIDADES Y RASGOS | DISP. Each row shows a positional's name with an "(Raza, RolEs)" subtext, its `formatRulebookCost` cost, stats, Spanish skills (fallback to English, "Ninguna" if empty), and a DISP. cell with a `{n}/{max}` counter plus a button `aria-label="Add {positional.name}"` labeled "+ Add". The availability container MUST keep an outer scroll wrapper and add a nested `overflow-x-auto` wrapper with an inner panel of `min-w-[640px] md:min-w-0` so the nine-column table scrolls horizontally on mobile; sticky headers MUST be preserved.
(Previously: the table had a `max-h-[55vh] overflow-auto` outer container and a `max-w-[900px]` inner panel, with no horizontal-scroll wrapper.)

#### Scenario: Rulebook headers and subtext

- GIVEN a race is selected on step 2
- WHEN the availability table renders
- THEN the nine rulebook headers appear
- AND each row shows "{positional.name} · ({race.name}, {roleEs})" in POSICIÓN

#### Scenario: Add and counter

- GIVEN a race with positionals
- WHEN the availability table renders
- THEN the DISP. cell shows "{n}/{max}"
- AND an "Add {positional.name}" button is present for every available positional

#### Scenario: Horizontal scroll on mobile

- GIVEN a viewport below `md`
- WHEN the availability table renders
- THEN an inner `overflow-x-auto` wrapper and `min-w-[640px] md:min-w-0` panel are present

#### Scenario: Disappearing row at max

- GIVEN a positional has reached its max count
- WHEN the availability table renders
- THEN that row (including its Add button) is NOT rendered

#### Scenario: Over-budget Add disabled

- GIVEN adding a positional would exceed the 1,000,000 gc budget
- WHEN the availability table renders
- THEN its Add button is disabled but the row stays visible
