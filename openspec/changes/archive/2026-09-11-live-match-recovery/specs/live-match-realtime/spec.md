# Delta for live-match-realtime

## MODIFIED Requirements

### Requirement: LM-3 · Match Lifecycle and Start Guard

A live match MUST enter the lifecycle only from a `scheduled` fixture with no result; consent on a played or result-loaded fixture MUST return 409 and create no LiveMatch. The match MUST NOT become `live` until the first turn begins. Second-half end MUST mark the LiveMatch finished without creating a MatchResult. A LiveMatch MAY also exit the lifecycle early via a manual reset (deletes the row — `live-match-recovery` LMR-2) or a lazy 8h auto-close (freezes to `finished` — `live-match-recovery` LMR-4).
(Previously: a single start command immediately set the match `live` and started the clock.)

#### Scenario: Consent on scheduled fixture

- GIVEN a scheduled fixture without a result
- WHEN a coach consents
- THEN a LiveMatch is created awaiting the second consent and subscribers receive it

#### Scenario: Replay rejected

- GIVEN a played fixture or one with a result
- WHEN consent is attempted
- THEN it returns 409 and no LiveMatch is created

#### Scenario: Live only via the first turn

- GIVEN a `ready` match with both consents
- WHEN the first turn begins
- THEN the status becomes `live`; until then no clock runs

#### Scenario: Reset exits the lifecycle

- GIVEN a fixture whose LiveMatch is `pending|ready|live`
- WHEN the owner or a developer/admin resets it
- THEN the LiveMatch row is deleted and the fixture returns to `scheduled`/`pending` (`live-match-recovery` LMR-2)

#### Scenario: Expiry exits the lifecycle

- GIVEN a `live` match with `startedAt` 8h+ in the past
- WHEN a league or fixture GET runs
- THEN the match is frozen to `finished` with its scoreboard and the fixture is played (`live-match-recovery` LMR-4)

## ADDED Requirements

### Requirement: LM-31 · Recovery SSE Frames

A manual reset MUST publish `{ seq, live: null }`; a lazy auto-close MUST publish a finished state frame. Both frames MUST carry a `seq` greater than the subscriber's `snapshotSeq` so the route does not drop them. (`live-match-recovery` LMR-7 cross-references the client affordance.)

#### Scenario: Reset publishes live null

- GIVEN connected subscribers and a committed reset
- WHEN the reset publishes
- THEN subscribers receive `live: null` and render no live view

#### Scenario: Auto-close publishes finished

- GIVEN connected subscribers and a committed auto-close
- WHEN the sweep publishes
- THEN subscribers receive a finished frame with `seq > snapshotSeq`
