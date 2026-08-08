# team-persistence Specification

## Purpose

Per-user persistent team storage in PostgreSQL via Prisma (User + Team models), backed by a DB-driven `ApiTeamStore` that implements the existing `TeamStore` interface (list/save/remove). Teams become user-scoped through session-checked `/api/teams` routes. A one-time per-browser migration imports legacy `bb_teams_v1` localStorage teams into the signed-in user's account. Deleting a team archives it (soft delete) by setting a nullable `archivedAt` timestamp rather than hard-deleting the row.

## Requirements

### Requirement: Persistent Schema

The system MUST persist teams via Prisma against PostgreSQL. The User model MUST have id, email (unique), passwordHash, optional name, and createdAt. The Team model MUST have id, userId (FK to User), name, raceId, roster (Json), coaching (Json), a nullable `archivedAt DateTime?`, a nullable `leagueId String?` (FK to League, onDelete SetNull), and createdAt. The `leagueType` column MUST NOT exist. Deleting a User MUST cascade-delete their Teams. Deleting a League MUST set its member teams' `leagueId` to null (SetNull). Existing rows and writes gain `archivedAt: null`; no gameplay column is lost.
(Previously: the Team model carried a `leagueType` string column and no `leagueId`; there was no League relation.)

#### Scenario: Team persisted to DB

- GIVEN an authenticated user
- WHEN a team is created
- THEN a Team row with the user's userId, full roster/coaching JSON, `archivedAt: null`, and `leagueId: null` is stored
- AND no `leagueType` column is written

#### Scenario: Archived team still persisted

- GIVEN a team that has been archived
- WHEN its row is read from the DB
- THEN the row still exists with its original data intact

#### Scenario: Existing team starts unassigned

- GIVEN a team created before the leagues change
- WHEN the migration runs
- THEN its `leagueType` column is dropped and `leagueId` starts null (no value mapping)

#### Scenario: League delete nulls membership

- GIVEN a team assigned to a league
- WHEN that league is deleted
- THEN the team's `leagueId` is set to null and data survives

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

#### Scenario: Deletion blocked for league member

- GIVEN a team owned by the session user with `leagueId != null`
- WHEN the user DELETEs it by id
- THEN it returns 409 "expel from league first" and the row's `archivedAt` stays null

#### Scenario: Archived detail is not found

- GIVEN a team already archived by the session user
- WHEN a client lists teams or references it by id
- THEN it does not appear in the list and detail resolution treats it as not-found

### Requirement: ApiTeamStore Contract

The system MUST provide an `ApiTeamStore` implementing the `TeamStore` interface (list/save/remove) by calling the user-scoped API routes. `list()` MUST return the teams ordered oldest-first; `save()` MUST upsert via POST; `remove(id)` MUST delete via DELETE, idempotent (404 → no-op). Network/error responses MUST surface a recoverable error rather than silent data loss.

#### Scenario: Store lists via API

- GIVEN an authenticated AppProvider using ApiTeamStore
- WHEN the store hydrates
- THEN `list()` resolves with the user's teams from the API

#### Scenario: Store saves via API

- GIVEN an authenticated AppProvider using ApiTeamStore
- WHEN `save(team)` is called
- THEN a POST persists the team and the API-returned team is used

#### Scenario: Store remove is idempotent

- GIVEN a team id that does not exist
- WHEN `remove(id)` is called
- THEN it resolves without error (404 treated as no-op)

### Requirement: Existing Store Interface Preserved

The system MUST keep the `TeamStore` interface and the `LocalStorageTeamStore` + `InMemoryTeamStore` implementations intact so existing unit tests (446) continue to pass. AppProvider SHALL accept a store injection and swap between LocalStorage and Api based on session status.

#### Scenario: Tests unaffected

- GIVEN the existing InMemory and LocalStorage stores and their tests
- WHEN they run after this change
- THEN all still pass unchanged

### Requirement: localStorage Migration

On first login/signup per browser, the system MUST read the local `bb_teams_v1` teams, POST each into the signed-in user's account, and set the flag `bb_teams_migrated_v1` in localStorage. The system MUST NOT clear `bb_teams_v1` (rollback). The migration MUST be idempotent (runs once per browser).

#### Scenario: First login migrates once

- GIVEN localStorage contains `bb_teams_v1` and no `bb_teams_migrated_v1`
- WHEN the user logs in
- THEN each legacy team is POSTed to the account and `bb_teams_migrated_v1` is set

#### Scenario: Migration runs once

- GIVEN `bb_teams_migrated_v1` is already set
- WHEN the user logs in again
- THEN no migration runs and no duplicate teams are created

#### Scenario: Legacy data retained

- GIVEN a successful migration
- THEN `bb_teams_v1` still contains the original teams

#### Scenario: Migration failure is reported

- GIVEN a POST fails partway through migration
- THEN the failure is surfaced (non-blocking) and migration may be retried

### Requirement: Archived Team Table State

The Team model MUST persist a nullable `archivedAt DateTime?` column that is `null` while a team is active and set to the archive timestamp once archived. Archived teams MUST remain stored (soft delete) and MUST be recoverable by clearing `archivedAt`.

#### Scenario: Archive flag stored

- GIVEN a Team row
- WHEN it is archived via the API
- THEN the row keeps its data and `archivedAt` is set to the archive time
