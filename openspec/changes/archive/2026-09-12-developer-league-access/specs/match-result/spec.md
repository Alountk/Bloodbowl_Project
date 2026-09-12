# Delta for match-result

## MODIFIED Requirements

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
