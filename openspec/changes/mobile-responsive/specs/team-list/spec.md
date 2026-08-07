# Delta for team-list

## MODIFIED Requirements

### Requirement: Home Heading with Create Action

The home section MUST render a heading row: h2 "Teams" in navy `#12225a` with a red `#d11938` underline (book section style) and, on the right, a navy "Create New Team" link pointing to `/teams/create`. Below `md` the heading row MUST wrap (`flex-wrap`) so the h2 and CTA stack instead of overflowing at 375px, and the CTA MUST have a tap target of at least 40px (e.g. `py-2.5`). The card grid remains single-column by default.
(Previously: the heading row was `flex items-end justify-between` with the CTA at `px-4 py-2`, which squeezed the h2 and button at narrow widths.)

#### Scenario: Heading row renders

- GIVEN the home page renders
- WHEN the section heading row renders
- THEN h2 "Teams" shows navy text with a red underline
- AND a "Create New Team" link to `/teams/create` appears on the right

#### Scenario: Heading row wraps on mobile

- GIVEN a viewport below `md`
- WHEN the heading row renders
- THEN it uses `flex-wrap` so the CTA sits below the h2 instead of overflowing
- AND the CTA maintains a ≥40px vertical tap target

#### Scenario: CTA navigates to create

- GIVEN the user activates "Create New Team"
- WHEN navigation completes
- THEN the create-team form route loads
