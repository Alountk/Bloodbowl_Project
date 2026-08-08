# team-list Specification

## Purpose

Displays all stored teams as a searchable, filterable list. Each team card is a navigation link to its detail view.

## Requirements

### Requirement: Detail Navigation Link
The system MUST render each team card as a navigation link (`<Link>`) pointing to `/teams/${team.id}`.

#### Scenario: Team card navigation
- GIVEN a list of teams is displayed
- WHEN a team card is rendered
- THEN it is wrapped in an accessible `<a href="/teams/${id}">` element
- AND keyboard navigation correctly focuses the link
### Requirement: Preserved List Behavior

The system MUST preserve existing behaviors such as search filtering and roster summaries on the team cards. The list is fed by the store, and under an authenticated session the store is the user-scoped `ApiTeamStore`; therefore the list MUST display only the signed-in user's teams. The rendering behaviors (search, cards, navigation) MUST remain unchanged.
(Previously: the list presented all locally stored teams; there was no authentication and no user scope.)

#### Scenario: Preserved search filtering

- GIVEN a list of teams with links
- WHEN the user types in the search filter
- THEN the list filters correctly as before

#### Scenario: Only own teams listed

- GIVEN a signed-in user owns teams
- WHEN the home page renders
- THEN only that user's teams appear in the list
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
### Requirement: Per-Card Delete Control

Each team card in the home list MUST render a visible delete control (`aria-label="Delete {team.name}"`) that does not collide with the card's detail link (the delete control is a `<button>`, the card body remains a `<Link>`). The delete control MUST be keyboard-focusable and must not trigger card navigation when activated.

#### Scenario: Delete button present per card

- GIVEN a list of teams is displayed
- WHEN a team card renders
- THEN a button with accessible name `Delete {team.name}` is present and is keyboard-focusable

#### Scenario: Delete does not navigate

- GIVEN a team card with a delete button
- WHEN the delete button is activated
- THEN the card detail link does not navigate and a confirmation dialog opens instead

### Requirement: Confirmation Modal

The confirmation dialog MUST be a rulebook-styled modal (scrim + white panel) with `role="dialog"` and `aria-modal="true"` and focusable buttons. It MUST show the Spanish irreversible message "Esta acción no se puede deshacer. El equipo se archivará y se eliminará de tu lista." with two buttons: "Cancelar" (closes, no action) and "Eliminar" (destructive red, confirms and removes the team). Exactly one modal instance is controlled by list state tracking which team is pending. Confirming MUST call the store remove so the list refreshes; cancelling MUST keep the team and close the dialog.

#### Scenario: Modal opens on delete

- GIVEN the user activates a card's Delete button
- WHEN the dialog renders
- THEN a `role="dialog"` with `aria-modal="true"` shows the Spanish irreversible message and Cancelar/Eliminar buttons naming the team

#### Scenario: Cancelar keeps the team

- GIVEN the confirmation dialog is open
- WHEN the user activates "Cancelar"
- THEN the dialog closes and the team remains in the list

#### Scenario: Eliminar removes the team

- GIVEN the confirmation dialog is open
- WHEN the user activates the "Eliminar" button
- THEN the store removes the team and the list no longer shows it

### Requirement: Delete Flow List Refresh

After a confirmed delete, the team list MUST reflect the removed team without a full page reload, regardless of store (LocalStorage headless or API-backed).

#### Scenario: List refreshes after confirm

- GIVEN a team is confirmed for deletion
- WHEN `removeTeam(id)` resolves
- THEN the home list no longer renders that team
