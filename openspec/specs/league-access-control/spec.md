# league-access-control Specification

## Purpose

DB-authoritative role-based owner-equivalent override for `developer`/`admin` (`leagues.manage`). A privileged actor is treated as the league owner for READ and every owner action on ANY league, including foreign STARTED and FINISHED leagues. Plain `user` and member behavior stays unchanged.

## Requirements

### Requirement: LAC-1 · leagues.manage Permission

The system MUST add `leagues.manage` to the typed `PERMISSIONS` union and grant it to the `developer` and `admin` roles ONLY (`user` holds no permissions). The guard MUST resolve the caller's role from the DATABASE (`requirePermission` / `can(user.role, ...)`), never from the JWT — a user promoted after sign-in is granted immediately without re-login. An absent session MUST return 401.

#### Scenario: Developer and admin hold the permission

- GIVEN a user row with role `developer` or `admin`
- WHEN `can(role, "leagues.manage")` runs
- THEN it returns true; a role `user` returns false

#### Scenario: Role read from the database

- GIVEN a session whose JWT role snapshot is stale
- WHEN a guarded route resolves the caller's role
- THEN the authoritative role is the DB `User.role`, not the JWT claim

#### Scenario: Unauthenticated denied

- GIVEN no session
- WHEN any `leagues.manage`-guarded route runs
- THEN it returns 401 and performs no mutation

### Requirement: LAC-2 · Owner-Equivalent Access Resolution

The system MUST provide a shared server helper that resolves a caller's relationship to a league as `owner` | `privileged` | `member` | `foreign`, checking the owner relation FIRST and only then `leagues.manage`. A pure client predicate (`isOwnerEquivalent(league, userId, role)`) MUST mirror the same decision for UI gating. `privileged` (developer/admin) MUST resolve identically to `owner` for authorization.

#### Scenario: Owner resolves first

- GIVEN a caller who owns the league
- WHEN access resolves
- THEN it returns `owner` regardless of role

#### Scenario: Privileged actor is owner-equivalent

- GIVEN a `developer` or `admin` who does not own the league
- WHEN access resolves
- THEN it returns `privileged`, treated as `owner` by every guarded route

#### Scenario: Plain user and member fall through

- GIVEN a plain `user` or a non-owner member
- WHEN access resolves
- THEN it returns `member`/`foreign` and the existing owner/member logic applies unchanged

### Requirement: LAC-3 · Privileged Owner-Equivalent Override

A `leagues.manage` holder MUST be treated as the league owner for READ (list and detail) and for every owner action — start, expel member, delete league, fixture visibility, forfeit, load result, correct result, propose, and accept — on ANY league, including foreign STARTED and FINISHED leagues. The override MUST NOT exceed the owner: every lifecycle guard (409 on started/finished immutability) still applies to a privileged actor exactly as to the owner.

#### Scenario: Override spans read and all owner actions

- GIVEN a `developer`/`admin` session and any league
- WHEN they list, read detail, start, expel, delete, forfeit, load/correct a result, or propose/accept
- THEN each is authorized exactly as if they owned the league

#### Scenario: Override never exceeds the owner

- GIVEN a `developer`/`admin` session
- WHEN they attempt an action the owner would be denied (e.g. delete a STARTED league)
- THEN it returns the same 409 the owner would receive

### Requirement: LAC-4 · No Existence Leak

A nonexistent league or fixture id MUST still return 404 to EVERY caller, including a `leagues.manage` holder. Privilege MUST NOT reveal whether an id exists.

#### Scenario: Missing league id 404 for privileged

- GIVEN a `developer`/`admin` session
- WHEN they GET or DELETE a league id that does not exist
- THEN it returns 404 with no existence leak

#### Scenario: Missing fixture id 404 for privileged

- GIVEN a `developer`/`admin` session
- WHEN they hit a fixture route for a nonexistent fixture id
- THEN it returns 404 with no existence leak

### Requirement: LAC-5 · UI Owner-Equivalent Rendering

The client predicate MUST gate the league list/dashboard split and the detail controls so a `developer`/`admin` lands in the owner split ("Mis Ligas") and sees the owner-only controls; a plain `user` sees today's split and controls unchanged. No new section or role label is introduced.

#### Scenario: Privileged lands in the owner split

- GIVEN a `developer`/`admin` viewing the league list or dashboard
- WHEN the split computes
- THEN their foreign leagues appear under "Mis Ligas" (no new section)

#### Scenario: Owner controls render for privileged

- GIVEN a `developer`/`admin` viewing a foreign league detail
- WHEN it renders
- THEN the owner-only controls (start, expel, delete, forfeit, result) are visible

#### Scenario: Plain user unchanged

- GIVEN a plain `user` viewing the list or a foreign league
- WHEN the split and controls compute
- THEN the existing owner/member split and hidden owner controls are unchanged
