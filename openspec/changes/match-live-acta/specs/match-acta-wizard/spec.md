# Delta for match-acta-wizard

## ADDED Requirements

### Requirement: MAW-10 · Single Closure Surface

Match closure MUST run from the Acta en Vivo sheet as ONE surface replacing the `MatchResolveModal` / `MatchActaWizard` duplication. The derived acta MUST ask only for missing data (pending casualty rolls, MVP, fan factor/winnings inputs), never for events already captured live. Every guard preserved by MAW-1 MUST remain in force.

#### Scenario: Closure asks only missing data

- GIVEN a fully captured live match with one pending casualty roll and no MVP assigned
- WHEN the coach closes the match
- THEN the closure surface asks only for the pending roll, MVP and fans, and the result posts from derived data

#### Scenario: Guards preserved

- GIVEN a fixture that is not playable by the current viewer
- WHEN the closure surface is requested
- THEN it is denied exactly as the MAW-1 guards require
