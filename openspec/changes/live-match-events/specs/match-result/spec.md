# Delta for match-result

## ADDED Requirements

### Requirement: MVP Event Write on Result Load

When a result is loaded for a fixture that has a `LiveMatch`, the result route MUST append TWO `mvp` events (home grantee, away grantee) to that LiveMatch's event list inside the result transaction, using the MJP-computed grantee `rosterPlayerId` per team. The next `seq` MUST be read as `max(seq)` inside the transaction and bumped consistently so the `@@unique([liveMatchId, seq])` constraint cannot collide. A fixture with NO LiveMatch (legacy/walkover) MUST NOT write any `mvp` event.

#### Scenario: Home and away MVP appended

- GIVEN a fixture with a finished LiveMatch and a valid result payload
- WHEN the result POST commits
- THEN two `mvp` events (home + away grantee) are appended with monotonic seq

#### Scenario: Concurrent seq writes never collide

- GIVEN two transactions appending events to the same LiveMatch
- WHEN both read `max(seq)` inside their transaction
- THEN no `@@unique([liveMatchId, seq])` collision occurs and both persist distinct seqs

#### Scenario: No LiveMatch, no MVP

- GIVEN a legacy or walkover fixture without a LiveMatch
- WHEN a result POST commits
- THEN no `mvp` event is written and the fixture is unchanged
