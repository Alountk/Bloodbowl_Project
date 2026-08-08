# Delta for roster-table

## ADDED Requirements

### Requirement: Mobile Stacked Row-Cards

Below the `md` breakpoint (`useIsDesktop` false) RosterTable MUST render stacked row-cards instead of the book table — ONE card per player, no horizontal scroll, no chevron/expand. Each card MUST show: name line (read-only static span, or editable `<input aria-label="Player name for {name}">` with a remove button `aria-label="Remove {name}"`), subtitle `{positional.name} · ({race.name}, {roleEs})`, stats chips MV FU AG PS AR, labeled rows SKILLS (Spanish, "Ninguna" fallback) / PRIMARIAS / SECUNDARIAS, and a cost line. Editable mode MUST keep rename and remove working.

#### Scenario: Read-only mobile card

- GIVEN a readOnly roster below `md`
- WHEN a player card renders
- THEN it shows the player name as static text with subtitle `{name} · (Race, Rol)`
- AND cost, stats chips, and labeled SKILLS/PRIMARIAS/SECUNDARIAS rows are all visible without horizontal scroll

#### Scenario: Editable mobile card keeps controls

- GIVEN an editable roster below `md`
- WHEN a player card renders
- THEN the name input keeps `aria-label="Player name for {name}"`
- AND a remove button `aria-label="Remove {name}"` is present and renames/removes still work

#### Scenario: No skills fallback

- GIVEN a positional with an empty `skills` array below `md`
- WHEN the SKILLS row renders
- THEN it displays "Ninguna"

#### Scenario: Desktop untouched

- GIVEN a viewport at or above `md`
- WHEN the table renders
- THEN the book table renders with no stacked row-cards present

## MODIFIED Requirements

### Requirement: Scrollable Roster Table

The RosterTable container MUST cap its height with internal scrolling and a sticky header so the rest of the form (budget bar, availability section, coaching, submit) remains visible as the roster grows. The outer container MUST keep `max-h-[55vh] overflow-auto`. On the DESKTOP branch (at or above `md`), a nested `overflow-x-auto` wrapper MUST sit inside it with the inner table panel using `min-w-[640px]` and sticky `top-0 z-10` headers. Below `md`, the MOBILE branch MUST render stacked row-cards (see "Mobile Stacked Row-Cards") and MUST NOT render the book table, its horizontal-scroll wrapper, or any `min-w-[640px]` panel.
(Previously: the horizontal-scroll wrapper applied on mobile; mobile now renders stacked row-cards instead.)

#### Scenario: Height cap and sticky header

- GIVEN a growing roster
- WHEN the table renders
- THEN the outer container has `max-h-[55vh] overflow-auto`
- AND the header row sticks to the top (`sticky top-0 z-10`) on the desktop branch

#### Scenario: Desktop horizontal scroll preserved

- GIVEN a desktop viewport (at or above `md`)
- WHEN the book table renders
- THEN the nested `overflow-x-auto` wrapper and `min-w-[640px]` panel are present

#### Scenario: Mobile uses stacked cards, no scroll wrapper

- GIVEN a viewport below `md`
- WHEN the table renders
- THEN no book table, no `overflow-x-auto` wrapper, and no `min-w-[640px]` panel are present
- AND each player renders as a stacked row-card

## REMOVED Requirements

### Requirement: Horizontal scroll on mobile

(Reason: mobile now renders stacked row-cards instead of a horizontally-scrolling book table.)
(Migration: replaced by the "Mobile Stacked Row-Cards" requirement and the mobile scenario of "Scrollable Roster Table".)
