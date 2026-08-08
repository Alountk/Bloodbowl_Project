# Delta for roster-table

## MODIFIED Requirements

### Requirement: Scrollable Roster Table

The RosterTable container MUST cap its height with internal scrolling and a sticky header so the rest of the form (budget bar, availability section, coaching, submit) remains visible as the roster grows. The outer container MUST keep `max-h-[55vh] overflow-auto`; a nested `overflow-x-auto` wrapper MUST be added inside it so the wide table scrolls horizontally on small viewports, with the inner table panel using `min-w-[640px] md:min-w-0` (the `md:min-w-0` prevents page-level overflow at 768–880px where the 240px sidebar plus a 640px panel exceed the viewport). Sticky `top-0 z-10` headers MUST be preserved.
(Previously: the inner panel was `max-w-[900px]` with only the outer `max-h-[55vh] overflow-auto` container; there was no horizontal-scroll wrapper.)

#### Scenario: Height cap and sticky header

- GIVEN a growing roster
- WHEN the table renders
- THEN the outer container has `max-h-[55vh] overflow-auto`
- AND the header row sticks to the top of the scroll container (`sticky top-0 z-10`)

#### Scenario: Horizontal scroll on mobile

- GIVEN a viewport below `md`
- WHEN the table renders
- THEN a nested `overflow-x-auto` wrapper is present between the outer container and the panel
- AND the inner panel carries `min-w-[640px] md:min-w-0`
