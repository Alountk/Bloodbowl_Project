# match-share-link Specification

## Purpose

Fixed per-fixture public read-only link (`/watch/[token]`) showing score, clock, and timeline only. Token is stable, derived-expiry, RBAC-generated; no private data ever leaves the reduced surfaces.

## Requirements

### Requirement: MSL-1 · Share Token Lifecycle

`Fixture` MUST gain `shareToken String? @unique` holding a 192-bit base64url value generated with `randomBytes(24).toString("base64url")` (URL-safe, no dots). The token MUST be generated lazily on first share, MUST be idempotent (existing token returned, never regenerated), and MUST NEVER be rotated. The token MUST live on `Fixture` (not `LiveMatch`, which reset deletes).

#### Scenario: First share mints the token

- GIVEN a fixture with `shareToken == null`
- WHEN a share is requested
- THEN a 192-bit base64url token persists on the Fixture and is returned

#### Scenario: Repeat share is idempotent

- GIVEN a fixture with an existing `shareToken`
- WHEN share is requested again
- THEN the same token is returned and no new value is generated

### Requirement: MSL-2 · Share Endpoint RBAC

`POST /api/leagues/[id]/fixtures/[fixtureId]/share` MUST return `{ token }` only for the home/away team owner, the league owner, or a `live.manage` holder; unauthenticated → 401, a spectator member → 403, a foreign non-member → 404 (no existence leak).

#### Scenario: Participant, owner, or admin shares

- GIVEN a home/away owner, league owner, or developer/admin session
- WHEN POST share runs
- THEN it returns 200 with `{ token }`

#### Scenario: Spectator member denied

- GIVEN a league member who is not a participant, owner, or admin
- WHEN POST share runs
- THEN it returns 403 and no token is minted

#### Scenario: Anonymous and foreign denied

- GIVEN no session, or an authenticated non-member
- WHEN POST share runs
- THEN it returns 401 (anonymous) or 404 (foreign)

### Requirement: MSL-3 · Derived Expiry and Generic 404

Token validity MUST be DERIVED: valid iff `homeScore`, `awayScore`, `winnerId`, and `result` are all null. A played fixture and an unknown token MUST return the identical generic 404 (`"Este link ya no está disponible"`); the system MUST NOT distinguish expired from unknown.

#### Scenario: Valid while unresolved

- GIVEN a fixture with no official result (pending/scheduled/ready/live/finished-live-unresolved)
- WHEN `GET /api/watch/[token]` runs
- THEN it returns 200 with the reduced DTO

#### Scenario: Played fixture closes the link

- GIVEN a fixture whose result has loaded (`played`)
- WHEN `GET /api/watch/[token]` runs
- THEN it returns the same generic 404 as an unknown token

#### Scenario: Unknown token

- GIVEN a token that resolves to no fixture
- WHEN `GET /api/watch/[token]` runs
- THEN it returns the generic 404 with no existence leak

### Requirement: MSL-4 · Public Read Route and Reduced DTO

`GET /api/watch/[token]` MUST resolve the fixture FROM the token (no `leagueId` in the URL) and return a reduced DTO. It MUST include only the fields below and MUST exclude every private field; the existing member fixture GET and `resolveLiveAccess` MUST remain untouched.

| Include | Exclude (private) |
|---|---|
| fixture `{id, round, status, scheduledAt, homeScore, awayScore, winnerId}` | `result`; team `user`/`email`; `roster`, `coaching` |
| teams `{id, name, raceId, emblem}` | player `pe/skills/injuries/valueBonus/missNextMatch` |
| reduced `live` `{seq, status, half, turnNumber, activeSide, homeScore, awayScore, startedAt, finishedAt, elapsed, homeTurnMs, awayTurnMs, paused, viewerSide:null, events}` | `mvpNominations`, `resolutionState`, `inducements`, `inducementBudget`, `pendingCasualty`, `concedeProposedBy`, `journeymen`, `mvpGrantees`, `liveWinnings`, `homeConsented/awayConsented` |

A finished live match WITHOUT a `MatchResult` MUST derive its summary from `live` + display events (LM-16), never from `result`.

#### Scenario: Reduced read

- GIVEN a valid token
- WHEN `GET /api/watch/[token]` runs
- THEN it returns 200 with the fixture, team `{id,name,raceId,emblem}`, and reduced `live` only

#### Scenario: No private fields

- GIVEN the reduced DTO
- WHEN it is inspected
- THEN no roster, coaching, PE, MVP, resolution, inducement, consent, or winnings data is present

### Requirement: MSL-5 · Guest SSE Read

`GET /api/watch/[token]/live` MUST gate by token, subscribe via `liveHub.subscribe({ coachId: null, activeCoachId: null, onGraceExpired: undefined })`, and REDUCE every frame (snapshot AND hub publish) through `reduceWatchFrame` before enqueueing; the reduced `viewerSide` MUST be `null`.

#### Scenario: Every frame reduced

- GIVEN a valid token and an active live match
- WHEN the SSE stream publishes snapshot and hub frames
- THEN every frame on the wire is reduced (no `mvpNominations`/`resolutionState`/`inducements`)

#### Scenario: No grace handler

- GIVEN a guest SSE subscription
- WHEN the guest disconnects
- THEN the guest route arms no pause handler (`onGraceExpired` unset); coach grace behavior is unchanged

### Requirement: MSL-6 · Guest Watch Page

`/watch/[token]` MUST be a public page that renders WITHOUT the AppShell chrome and forces `viewerSide: null`, so all coach controls disappear via their existing `viewerSide != null` gates.

#### Scenario: Guest page renders lean

- GIVEN a guest with a valid token
- WHEN `/watch/[token]` renders
- THEN score, clock, and timeline show with no sidebar/nav and no coach controls

### Requirement: MSL-7 · Share UI

`MatchView` MUST render a "Compartir" affordance for participants/owner/admin (mirroring `canResetLive`), triggering POST share and copying `${origin}/watch/${token}` via the clipboard with a "Copiado" state; copy MUST exist in both es/en dictionaries.

#### Scenario: Participant shares

- GIVEN a participant, owner, or admin viewing the match
- WHEN they activate share
- THEN the stable link is copied and a "Copiado" state appears

#### Scenario: Non-eligible viewer has no share

- GIVEN a spectator member (no side, not owner/admin)
- WHEN the page renders
- THEN no share control appears
