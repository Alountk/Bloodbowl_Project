# Delta for team-detail-view

## MODIFIED Requirements

### Requirement: Roster Display

The system MUST display the team's roster using the `RosterTable` component configured as read-only, rendering the rulebook column set (`CANT. | POSICIÓN | COSTE | MV | FU | AG | PS | AR | HABILIDADES Y RASGOS | PRIMARIAS | SECUNDARIAS`) with the light theme and Spanish skill names as specified in the `roster-table` spec. The read-only view MUST pass the team name as the banner (`bannerText`) and the team's apothecary status (`apothecary`).

(Previously: rendered the `RosterTable` read-only without specifying column set, theme, or skill language.)

#### Scenario: Valid roster display

- GIVEN a valid team is found
- WHEN the detail view renders
- THEN the `RosterTable` is rendered with `readOnly={true}`
- AND it receives the correct `players`, `race`, `bannerText={team.name}`, and `apothecary={team.coaching.apothecary}` props
- AND it displays the empty roster fallback if no players exist

#### Scenario: Read-only rulebook presentation

- GIVEN a valid team with players is found
- WHEN the detail view renders
- THEN the roster table shows the Spanish rulebook column set in order
- AND it uses the light theme
- AND skill names render in Spanish with English fallback
- AND no rename inputs or remove buttons are shown

#### Scenario: Read-only totals preserved

- GIVEN a valid team with players is found
- WHEN the detail view renders
- THEN the totals row shows player count and total cost
- AND no budget text appears
