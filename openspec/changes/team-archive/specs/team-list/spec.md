# Delta for team-list

## ADDED Requirements

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
