# live-match-recovery Specification

## Purpose

Recovery for a `LiveMatch` row that would otherwise strand its fixture forever (no delete path exists today): a manual reset (league owner or developer/admin) deletes the match, and a lazy 8h auto-close freezes an abandoned `live` match as played — frozen scoreboard counts for the league, but progression stays deferred to the resolution wizard. Forfeit also clears the orphan LiveMatch it previously leaked.

## Requirements

### Requirement: LMR-1 · Manual Reset Authorization

A reset MUST authorize the league owner OR a developer/admin holding the new `live.manage` permission. The owner check MUST run FIRST (`ownerId === userId`), else `requirePermission("live.manage")` (401 without a session, 403 otherwise — `requirePermission` is all-or-nothing). A foreign non-member MUST get 404 with no existence leak. A fixture in a finished league MUST get 409.

#### Scenario: Owner resets

- GIVEN a started league owned by the session user and a fixture with a LiveMatch
- WHEN they POST reset
- THEN it returns 200 and the reset proceeds

#### Scenario: Developer resets a foreign league

- GIVEN a developer who is not the owner and a fixture with a LiveMatch
- WHEN they POST reset
- THEN the owner check fails but `live.manage` authorizes, returning 200

#### Scenario: Participant, spectator, or foreign denied

- GIVEN a participant, spectator member, or foreign non-member
- WHEN they POST reset
- THEN participant/spectator get 403, a foreign user 404, with no mutation

#### Scenario: Finished league rejected

- GIVEN a fixture in a finished league
- WHEN reset is POSTed
- THEN it returns 409 and nothing changes

### Requirement: LMR-2 · Manual Reset Effect

Reset MUST delete the fixture's LiveMatch (LiveEvents cascade) in one transaction, null `winnerId`/`homeScore`/`awayScore`, and leave `scheduledAt` untouched so the fixture derives `scheduled` (or `pending` when `scheduledAt` is null). The fixture is replayable. It MUST 409 when the fixture is already `played`, has no LiveMatch, or the league is finished.

#### Scenario: Reset returns the fixture to scheduled

- GIVEN a fixture whose LiveMatch is `pending|ready|live` and which had `scheduledAt`
- WHEN reset commits
- THEN the LiveMatch and its events are deleted, scores/winner null, and the fixture derives `scheduled` and is replayable

#### Scenario: Pending fixture stays pending

- GIVEN a LiveMatch on a fixture with no `scheduledAt`
- WHEN reset commits
- THEN the fixture derives `pending`

#### Scenario: Already played rejected

- GIVEN a fixture already `played` (scores or result present)
- WHEN reset is POSTed
- THEN it returns 409 and nothing changes

#### Scenario: No LiveMatch rejected

- GIVEN a fixture with no LiveMatch row
- WHEN reset is POSTed
- THEN it returns 409

### Requirement: LMR-3 · Lazy Auto-Close Predicate

`expireStaleLiveMatches` MUST close ONLY LiveMatches whose `status` is `live` and whose `startedAt` is more than 8 hours wall-clock in the past. It MUST run lazily at the top of `GET /api/leagues/[id]` and `GET .../fixtures/[fixtureId]`; no cron/job MUST be used. `pending`/`ready`/`finished` rows MUST NOT be swept.

#### Scenario: Stale live match swept

- GIVEN a `live` LiveMatch with `startedAt` 8h+ in the past
- WHEN a league or fixture GET runs
- THEN the sweep closes it

#### Scenario: Fresh or non-live rows untouched

- GIVEN a `live` row under 8h, or a `pending`/`ready`/`finished` row
- WHEN a GET runs
- THEN it is never auto-closed

### Requirement: LMR-4 · Auto-Close Freeze (No Progression)

The sweep MUST set the LiveMatch to `finished` (`finishedAt = now`), record the frozen scoreboard (`homeScore`/`awayScore` from the LiveMatch) on the fixture, derive the winner from that scoreboard (null on a draw), and run `maybeCloseLeague`. It MUST NOT award PE, winnings, MVP, or FF — progression stays deferred to the resolution wizard (Option A, documented).

#### Scenario: Frozen scoreboard counts for the league

- GIVEN a stale `live` match at 2-1
- WHEN the sweep closes it
- THEN the fixture records 2-1, the winner is the 2-goal team, and `maybeCloseLeague` runs

#### Scenario: Draw leaves no winner

- GIVEN a stale `live` match level
- WHEN the sweep closes it
- THEN the fixture is played with `winnerId` null

#### Scenario: No progression awarded

- GIVEN a sweep close
- WHEN progression is computed
- THEN no PE, winnings, MVP, or FF are awarded (wizard-only)

### Requirement: LMR-5 · Sweep Idempotency and Seq Guard

The sweep MUST be seq-guarded and idempotent: a concurrent reader that loses the optimistic guard MUST no-op, and a re-run over an already-finished row MUST do nothing.

#### Scenario: Concurrent sweep losers no-op

- GIVEN two GETs sweeping the same stale row
- WHEN they race
- THEN one commits and the loser no-ops without error

#### Scenario: Re-run is a no-op

- GIVEN a row already auto-closed
- WHEN the sweep runs again
- THEN no state changes

### Requirement: LMR-6 · Forfeit Deletes the Orphan LiveMatch

The forfeit transaction MUST delete the fixture's LiveMatch (events cascade) in the SAME transaction as the walkover so a played walkover never shows a live badge.

#### Scenario: Forfeit clears the live row

- GIVEN a fixture with a stale LiveMatch and an admin forfeit
- WHEN the walkover commits
- THEN the LiveMatch and its events are deleted and no EN VIVO badge remains

### Requirement: LMR-7 · Reset UI and Confirmation

A reset control MUST render in the match card/view ONLY for the league owner or a developer/admin, MUST open a confirmation modal, and MUST expose ES/EN copy. It MUST NOT render for participants/spectators or on a finished league.

#### Scenario: Authorized user sees and confirms reset

- GIVEN the owner (or dev/admin) viewing a fixture with a live match
- WHEN they open the reset control and confirm
- THEN the reset fires and the live view clears

#### Scenario: Hidden from others

- GIVEN a participant, spectator, or a finished league
- WHEN the card renders
- THEN no reset control appears
