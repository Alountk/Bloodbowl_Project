# match-result Specification

## Purpose

Load and correct match results with BB2025 post-match resolution: scores, winnings, fan factor, PE, injuries/deaths, and petty cash in one transaction, with authorization, idempotency, and audit.

## Requirements

### Requirement: Result Authorization

The result route MUST accept the league admin, a `leagues.manage` holder (developer/admin), or either fixture captain (owner of the home or away team). Corrections MUST be accepted from the league admin, a `leagues.manage` holder, OR either of the two participant coaches; forfeit/award-walkover MUST remain admin-only or a `leagues.manage` holder. An absent session MUST return 401 with no write. An authenticated non-captain, non-admin (and non-privileged) MUST receive 404 with no fixture data leaked.
(Previously: corrections by a captain returned 403 — admin-only.)
(Previously: the result route accepted only admin/captain, with no privileged override.)

#### Scenario: Captain loads a result

- GIVEN a fixture whose home team is owned by the session user
- WHEN they POST the result
- THEN it is accepted and persisted

#### Scenario: Foreign user hidden

- GIVEN an authenticated user who is neither captain nor admin
- WHEN they POST a result
- THEN it returns 404 and no fixture data leaks

#### Scenario: Unauthenticated rejected

- GIVEN no session
- WHEN a result request hits the route
- THEN it returns 401 and performs no DB write

#### Scenario: Captain correction allowed

- GIVEN a played fixture
- WHEN a participant captain POSTs a correction
- THEN it returns 200 and the correction is applied

#### Scenario: Privileged loads a result on a foreign fixture

- GIVEN a `developer`/`admin` session and a fixture in a foreign league
- WHEN they POST the result
- THEN it is accepted and persisted

#### Scenario: Plain user still hidden

- GIVEN a plain `user` who is neither captain nor admin nor privileged
- WHEN they POST a result
- THEN it returns 404 and no fixture data leaks

### Requirement: Score Validation

The sum of per-player TD credits for a team MUST equal that team's final score; a mismatch MUST return 400 with no mutation. The winner MUST be derived from the final scores (equal scores → draw, no winner).

#### Scenario: Valid scores accepted

- GIVEN two home players credited with one TD each and `homeScore: 2`
- WHEN the result is validated
- THEN it is accepted and the winner is derived from the scores

#### Scenario: Mismatched scores rejected

- GIVEN player TDs summing to 3 but `homeScore: 2`
- WHEN the result is validated
- THEN it returns 400 and nothing is persisted

### Requirement: Atomic Result Transaction

Loading a result MUST persist, in ONE transaction: fixture scores and winner, winnings per the bb2025-rules formula, post-match FF changes, PE awards (including MJP 4 PE), injury outcomes, and petty cash equal to the team-value difference awarded to the lower-TV team and persisted in the report, PLUS the per-side inducement snapshot (`scores.home|away.inducements = { budget, cards: [{name,count}] }`) resolved from the lower-TV cart at close. Any failure MUST roll back all changes.
(Previously: the report persisted only the top-level `pettyCash`, with no per-side inducement snapshot.)

#### Scenario: All rewards applied atomically

- GIVEN a valid result payload
- WHEN it is loaded
- THEN scores, winnings, FF, PE, injuries, petty cash, and inducements are all persisted together or none are

#### Scenario: Petty cash from TV difference

- GIVEN team A TV 1.200.000 and team B TV 1.050.000
- WHEN the result loads
- THEN the report records 150.000 petty cash for team B

#### Scenario: Per-side inducements persisted

- GIVEN a live match whose lower-TV coach purchased a cart
- WHEN the result closes (result POST, resolveLiveMatch, or runWizardClose)
- THEN `scores.home.inducements` and `scores.away.inducements` carry per-side `{ budget, cards }` with names resolved from the catalog

### Requirement: Already-Played Guard and Idempotency

A result MUST NOT be loaded twice: a second POST on a fixture with a committed result MUST return 409 with no re-award. Retrying an identical request after a committed result MUST NOT double-award PE or winnings. The result route MUST return 409 on a forfeited fixture.

#### Scenario: Repeat load rejected

- GIVEN a fixture with a committed result
- WHEN a second POST arrives
- THEN it returns 409 and PE, winnings, and scores are unchanged

#### Scenario: Forfeited fixture blocked

- GIVEN a fixture resolved by walkover
- WHEN a result is POSTed
- THEN it returns 409 and no mutation occurs

### Requirement: Correction Authorization with Audit

Corrections MUST be accepted from the league admin, a `leagues.manage` holder (developer/admin), OR the two participant coaches; any other actor MUST receive 403 (foreign users 404). Forfeit/award-walkover MUST remain admin-only or a `leagues.manage` holder: a non-admin, non-privileged participant attempting it MUST receive 403 and no mutation. Each correction MUST record an audit entry with before/after snapshot, actor, and `correctedAt`, and MUST re-run the PE rules against the corrected payload. PE already spent MUST NOT be revoked by a correction.
(Previously: corrections were admin-only; participants could not correct, while forfeit was already admin-only.)
(Previously: corrections were admin/captain only and forfeit admin-only, with no privileged override.)

> **Rename note** (from RENAMED requirement): `Admin-Only Correction with Audit` → `Correction Authorization with Audit`. Reason: corrections are no longer admin-only — the two participant coaches may correct; forfeit stays admin-only. Migration: match-report e2e and ResultModal tests asserting captain-403 for correction must flip to captain-200; forfeit assertions stay 403 for non-admin. The full updated block is this one.

#### Scenario: Correction audited

- GIVEN an admin or participant coach corrects a played result
- WHEN the correction commits
- THEN an audit row stores the before/after snapshot, actor, and `correctedAt`, with PE deltas re-run

#### Scenario: Forfeit denied to non-admin participants

- GIVEN a played fixture and a non-admin participant
- WHEN they attempt forfeit/award-walkover
- THEN it returns 403 and no mutation occurs

#### Scenario: Spent PE never revoked

- GIVEN a player spent 6 PE before a correction
- WHEN the re-run awards fewer PE
- THEN previously spent PE is not revoked by the correction

#### Scenario: Participant correction e2e

- GIVEN the auth-suite match-report e2e
- WHEN it corrects a played result
- THEN the correction is driven by a participant coach and succeeds

#### Scenario: Privileged corrects a result

- GIVEN a `developer`/`admin` session and a played result
- WHEN they PUT a correction
- THEN it returns 200, the correction applies, and the audit row records the actor

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

Affected: slice 1 (MatchResult audit + Fixture score fields) · slice 2 (route) · slice 3 (ResultModal Spanish UI) · slice 5 (e2e updates).

### Requirement: Inducement Snapshot Parity and Copy-Forward

The THREE close paths (result POST, `resolveLiveMatch`, `runWizardClose`) MUST each write the SAME per-side `scores.home|away.inducements` shape (additive JSON inside `scores`, no `MatchResult` migration), so a resolved live match and a wizard-closed match persist inducements identically. A result correction (PUT) MUST copy the prior per-side `inducements` forward exactly as it does `winnings` (forward-only: copied when present, omitted when absent); a correction MUST NOT drop inducements a prior report persisted. Legacy rows without per-side inducements stay untouched (single-row `pettyCash` fallback).

#### Scenario: All three paths persist the same shape

- GIVEN a fixture with a finished LiveMatch carrying a lower-TV cart
- WHEN it closes via result POST, resolveLiveMatch, or runWizardClose
- THEN each path persists `scores.*.inducements` with identical `{ budget, cards }` values

#### Scenario: Correction preserves inducements

- GIVEN a played result with persisted per-side inducements
- WHEN a coach/admin corrects the result
- THEN the rebuilt `scores.*.inducements` are copied forward and not dropped

#### Scenario: Legacy row untouched

- GIVEN a legacy result with top-level `pettyCash` but no per-side inducements
- WHEN it is corrected or re-read
- THEN no inducements key is invented and the single-row fallback stays
