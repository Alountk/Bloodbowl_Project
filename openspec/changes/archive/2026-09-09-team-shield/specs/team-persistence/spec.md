# Delta for team-persistence

## MODIFIED Requirements

### Requirement: Persistent Schema

The system MUST persist teams via Prisma against PostgreSQL. The User model MUST have id, email (unique), passwordHash, optional name, and createdAt. The Team model MUST have id, userId (FK to User), name, raceId, roster (Json), coaching (Json), a nullable `archivedAt DateTime?`, a nullable `leagueId String?` (FK to League, onDelete SetNull), a nullable `emblem String?` (adapter-issued storage value), and createdAt. The `leagueType` column MUST NOT exist. Deleting a User MUST cascade-delete their Teams. Deleting a League MUST set its member teams' `leagueId` to null (SetNull). Existing rows and writes gain `archivedAt: null` and `emblem: null`; no gameplay column is lost.
(Previously: the Team model carried a `leagueType` string column and no `leagueId`; there was no League relation.)
(Previously: the Team model had no `emblem` field.)

#### Scenario: Team persisted to DB

- GIVEN an authenticated user
- WHEN a team is created
- THEN a Team row with the user's userId, full roster/coaching JSON, `archivedAt: null`, `leagueId: null`, and `emblem: null` is stored
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

#### Scenario: Existing team gains null emblem

- GIVEN a team created before the shield change
- WHEN the migration runs
- THEN its `emblem` is null and the placeholder renders
