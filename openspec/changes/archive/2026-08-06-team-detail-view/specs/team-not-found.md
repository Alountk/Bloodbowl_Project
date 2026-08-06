# team-not-found Specification

## Purpose

A segment-level error page for invalid team IDs that renders when a team lookup fails.

## Requirements

### Requirement: Post-Hydration Trigger
The system MUST only trigger the not-found segment after hydration is complete and the team is confirmed missing.

#### Scenario: Triggering not found UI
- GIVEN the store is fully hydrated
- WHEN the user accesses an unknown team ID
- THEN the `not-found.tsx` segment is rendered

#### Scenario: Known team ID
- GIVEN the store is fully hydrated
- WHEN the user accesses a known team ID
- THEN the `not-found.tsx` segment never renders

### Requirement: Error Message and Navigation
The system MUST display a clear error message indicating the team was not found and provide a link back to the root `/`.

#### Scenario: Displaying the error
- GIVEN the `not-found.tsx` segment is rendered
- WHEN the user views the page
- THEN the UI shows a clear error message
- AND includes a link element targeting `/`
