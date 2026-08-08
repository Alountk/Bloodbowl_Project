# Delta for team-persistence

## ADDED Requirements

### Requirement: Archived Team Table State

The Team model MUST persist a nullable `archivedAt DateTime?` column that is `null` while a team is active and set to the archive timestamp once archived. Archived teams MUST remain stored (soft delete) and MUST be recoverable by clearing `archivedAt`.

#### Scenario: Archive flag stored

- GIVEN a Team row
- WHEN it is archived via the API
- THEN the row keeps its data and `archivedAt` is set to the archive time

## MODIFIED Requirements

### Requirement: Persistent Schema

The system MUST persist teams via Prisma against PostgreSQL. The User model MUST have id, email (unique), passwordHash, optional name, and createdAt. The Team model MUST have id, userId (FK to User), name, raceId, leagueType, roster (Json), coaching (Json), a nullable `archivedAt DateTime?`, and createdAt. Deleting a User MUST cascade-delete their Teams. Existing rows and writes gain an `archivedAt: null` default; no gameplay column is lost.
(Previously: Team had no `archivedAt` column and was hard-deleted via `prisma.team.delete`.)

#### Scenario: Team persisted to DB

- GIVEN an authenticated user
- WHEN a team is created
- THEN a Team row with the user's userId, full roster/coaching JSON, and `archivedAt: null` is stored

#### Scenario: Archived team still persisted

- GIVEN a team that has been archived
- WHEN its row is read from the DB
- THEN the row still exists with its original data intact

### Requirement: User-Scoped Team API

The system MUST expose `/api/teams` (GET list, POST create) and `/api/teams/[id]` (DELETE) that require a valid session (401 when unauthenticated) and scope every query to the session user's id. A user MUST NOT read or delete another user's team (foreign team id → 404). `DELETE` MUST archive (set `archivedAt = now()`) rather than hard-delete. `GET /api/teams` MUST list only non-archived (`archivedAt: null`) teams owned by the user. A foreign or already-inactive team id MUST still return 404 with no mutation.
(Previously: `DELETE` hard-deleted via `prisma.team.delete`; `GET` listed all user teams with no archive filter.)

#### Scenario: Unauthenticated API call

- GIVEN no session
- WHEN a request hits any `/api/teams` route
- THEN it returns 401 and performs no DB mutation

#### Scenario: List only own non-archived teams

- GIVEN two users each with teams, some archived
- WHEN a user calls GET `/api/teams`
- THEN only that user's non-archived teams are returned

#### Scenario: Foreign team denied

- GIVEN a team owned by another user
- WHEN a user requests or deletes it by id
- THEN it returns 404 and no mutation occurs

#### Scenario: Archive is a soft delete

- GIVEN a team owned by the session user
- WHEN the user DELETEs it by id
- THEN the row is updated with `archivedAt = now()` (not deleted) and 204 is returned

#### Scenario: Archived detail is not found

- GIVEN a team already archived by the session user
- WHEN a client lists teams or references it by id
- THEN it does not appear in the list and detail resolution treats it as not-found

## Future Invariant (deferred, leagues)

### Requirement: League-Active Teams Not Archivable

Once leagues exist, a team assigned to an active league MUST NOT be archivable; it MUST be expelled from the league first and only archived after the league ends. This guard is NOT implemented in this change (no league code exists) and is recorded so enforcement lands with the league feature.
