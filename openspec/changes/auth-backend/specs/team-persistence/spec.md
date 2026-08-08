# team-persistence Specification

## Purpose

Per-user persistent team storage in PostgreSQL via Prisma (User + Team models), backed by a DB-driven `ApiTeamStore` that implements the existing `TeamStore` interface (list/save/remove). Teams become user-scoped through session-checked `/api/teams` routes. A one-time per-browser migration imports legacy `bb_teams_v1` localStorage teams into the signed-in user's account.

## Requirements

### Requirement: Persistent Schema

The system MUST persist teams via Prisma against PostgreSQL. The User model MUST have id, email (unique), passwordHash, optional name, and createdAt. The Team model MUST have id, userId (FK to User), name, raceId, leagueType, roster (Json), coaching (Json), and createdAt. Deleting a User MUST cascade-delete their Teams.

#### Scenario: Team persisted to DB

- GIVEN an authenticated user
- WHEN a team is created
- THEN a Team row with the user's userId and full roster/coaching JSON is stored

### Requirement: User-Scoped Team API

The system MUST expose `/api/teams` (GET list, POST create) and `/api/teams/[id]` (DELETE) that require a valid session (401 when unauthenticated) and scope every query to the session user's id. A user MUST NOT read or delete another user's team (foreign team id → 404).

#### Scenario: Unauthenticated API call

- GIVEN no session
- WHEN a request hits any `/api/teams` route
- THEN it returns 401 and performs no DB mutation

#### Scenario: List only own teams

- GIVEN two users each with teams
- WHEN a user calls GET `/api/teams`
- THEN only that user's teams are returned

#### Scenario: Foreign team denied

- GIVEN a team owned by another user
- WHEN a user requests or deletes it by id
- THEN it returns 404 and no mutation occurs

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
