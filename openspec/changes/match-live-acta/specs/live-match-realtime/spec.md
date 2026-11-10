# Delta for live-match-realtime

## ADDED Requirements

### Requirement: LM-13 · Unified Event Vocabulary

LiveEvent kinds MUST cover the acta action set so the match report derives from live capture without re-entry: touchdown, pass/completion, interception, casualty (with pending injury-roll state), foul/sent-off, throw-team-mate, landed-safe, and every SPP-relevant action modeled in `bb2025-rules`. Result prefill MUST carry every kind, not only touchdowns.

#### Scenario: Prefill carries every kind

- GIVEN a live match with touchdowns, a completion, an interception, a casualty and a foul recorded
- WHEN the match report is derived
- THEN every recorded kind appears in the acta without re-entry

#### Scenario: Pending roll survives derivation

- GIVEN a casualty whose injury roll is pending
- WHEN the match report is derived
- THEN the pending roll remains pending and is asked for in the closure surface
