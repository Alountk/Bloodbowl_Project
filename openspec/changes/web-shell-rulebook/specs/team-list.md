# Delta for team-list

## ADDED Requirements

### Requirement: Home Heading with Create Action

The home section MUST render a heading row: h2 "Teams" in navy `#12225a` with a red `#d11938` underline (book section style) and, on the right, a navy "Create New Team" link pointing to `/teams/create`.

#### Scenario: Heading row renders

- GIVEN the home page renders
- WHEN the section heading row renders
- THEN h2 "Teams" shows navy text with a red underline
- AND a "Create New Team" link to `/teams/create` appears on the right

#### Scenario: CTA navigates to create

- GIVEN the user activates "Create New Team"
- WHEN navigation completes
- THEN the create-team form route loads

### Requirement: Empty States

The list MUST render empty states as light book panels with square corners. With no teams, the panel MUST show "No teams yet. Create your first team." and a navy "Create New Team" button to `/teams/create`. When a search query matches nothing, the panel MUST show "No teams match your search." without a CTA.

#### Scenario: No-teams panel with CTA

- GIVEN no teams exist and hydration is complete
- WHEN the list renders
- THEN a light panel shows "No teams yet. Create your first team."
- AND a navy "Create New Team" button links to `/teams/create`

#### Scenario: No-match panel without CTA

- GIVEN teams exist but the search query matches none
- WHEN the list renders
- THEN a light panel shows "No teams match your search."
- AND no create CTA appears inside the panel

### Requirement: Rulebook Card Presentation

Each team card MUST use square corners (`rounded-none`) on a white card: a `h-[6px]` navy `#12225a` top band with a `2px` red `#d11938` bottom border; team name navy `#12225a`, 15px, weight 800; race slate-500, 12px; roster summary slate-400, 11px, separated by a top border. The card grid, link-to-detail, and keyboard focus behavior MUST remain unchanged.

#### Scenario: Rulebook card layout

- GIVEN teams are listed
- WHEN a card renders
- THEN it shows the navy band with red border, navy team name, race, and roster summary

#### Scenario: Card navigation preserved

- GIVEN a team card renders
- WHEN it is activated
- THEN it navigates to `/teams/${id}` and remains keyboard-focusable

## Test Coverage

| Requirement | Automated coverage |
|---|---|
| Heading + Create CTA | New assertion opportunity: `getByRole("link", { name: /create new team/i })` with `href="/teams/create"` |
| Empty states | `app/page.test.tsx` (`/no teams yet/i`); `TeamList.test.tsx` (`/no teams yet/i`, `/no teams match your search/i`, hydration gate) |
| Rulebook cards | `TeamList.test.tsx` (names, race, roster summaries, links, focus); e2e `create-team.spec.ts` (home "Reikland Reavers"/"Human"); square/light styling via visual review |
