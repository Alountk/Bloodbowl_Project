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
The system MUST preserve existing behaviors such as search filtering and roster summaries on the team cards.

#### Scenario: Preserved search filtering
- GIVEN a list of teams with links
- WHEN the user types in the search filter
- THEN the list filters correctly as before
