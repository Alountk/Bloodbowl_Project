# Delta for user-profile

> Reconciliation: the consolidated `user-profile` spec omits `locale`, which already shipped in code (RAU-58). This delta reconciles `Current User API` against the real contract in `app/api/me/route.ts` and adds `theme`.

## ADDED Requirements

### Requirement: Theme Field on User (UP-7)

The system MUST persist `User.theme String @default("vintage")` via an additive Prisma migration. The value MUST be restricted to `vintage`/`scoreboard` at the API boundary; a fresh user MUST default to `vintage`.

#### Scenario: Fresh user defaults to vintage

- GIVEN a newly registered user
- WHEN their profile is read
- THEN `theme` is `vintage`

#### Scenario: Additive migration

- GIVEN the existing `User` table
- WHEN the migration runs
- THEN a `theme` column is added with `NOT NULL DEFAULT 'vintage'` and no data is destroyed

## MODIFIED Requirements

### Requirement: Current User API

Req ID: UP-4. GET `/api/me` MUST return the session user's `id`, `name`, `email`, `avatar`, `locale`, and `theme` (401 unauthenticated). PATCH `/api/me` MUST accept only `name` (free text), `avatar`, `locale` (`"es"`|`"en"`), and `theme` (`"vintage"`|`"scoreboard"`), where `avatar` MUST be exactly `null` (clear) or the adapter-issued value previously returned. Any other field, an invalid `locale`/`theme`, or a `data:`/external `avatar` MUST return 400.
(Previously: GET returned only id/name/email/avatar and PATCH accepted only name/avatar; the shipped `locale` field was omitted from the spec.)

#### Scenario: Read own profile

- GIVEN an authenticated session
- WHEN GET `/api/me` is called
- THEN the response contains id, name, email, avatar, locale, and theme

#### Scenario: Update display name

- GIVEN an authenticated user
- WHEN they PATCH `{ "name": "Nuevo" }`
- THEN 200 returns the updated name

#### Scenario: Clear avatar with null

- GIVEN a user with an avatar
- WHEN they PATCH `{ "avatar": null }`
- THEN 200 returns `avatar: null` (the stored file MAY be deleted)

#### Scenario: External avatar URL rejected

- GIVEN a PATCH submitting a `data:` URI or external URL as `avatar`
- WHEN it is submitted
- THEN it returns 400 and the stored avatar is unchanged

#### Scenario: Update locale

- GIVEN an authenticated user
- WHEN they PATCH `{ "locale": "en" }`
- THEN 200 returns `locale: "en"`

#### Scenario: Update theme

- GIVEN an authenticated user
- WHEN they PATCH `{ "theme": "scoreboard" }`
- THEN 200 returns `theme: "scoreboard"`

#### Scenario: Invalid theme rejected

- GIVEN a PATCH submitting `{ "theme": "grimdark" }`
- WHEN it is submitted
- THEN it returns 400 and the stored theme is unchanged
