# Delta for match-result

## ADDED Requirements

### Requirement: Derived Acta Prefill Carries Every Event Kind

Result prefill MUST translate every live event kind (touchdowns, completions, interceptions, casualties with pending rolls, fouls/sent-offs, throw-team-mate, landed-safe) into acta actions instead of keeping only touchdowns (`features/leagues/resultPrefill.ts:68-86` today).

#### Scenario: Casualties and completions survive prefill

- GIVEN a live match with 2 TDs, 1 completion, 1 casualty and 1 foul
- WHEN the acta prefill runs
- THEN all five events appear in the pre-filled acta actions

#### Scenario: No double entry

- GIVEN a pre-filled acta
- WHEN the coach reviews it
- THEN no captured event requires re-keying and only missing data (pending rolls, MVP, fans) is asked
