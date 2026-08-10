# user-profile Specification

## Purpose

Personal identity: avatar upload (1:1 crop, stored as a single 256×256 WebP), `GET`/`PATCH /api/me`, a `/profile` page (Spanish), an English "My Profile" nav entry, and owner avatars on match cards. The session/JWT contract is untouched.

## Requirements

### Requirement: Avatar Field on User

The system MUST persist `User.avatar String?` via an additive Prisma migration. The stored value MUST be adapter-issued (`/uploads/...` path or adapter public URL) or `null`; a client-supplied URL MUST NEVER be persisted.

#### Scenario: Avatar persists across reload

- GIVEN an authenticated user who uploaded an avatar
- WHEN GET `/api/me` is called after a reload
- THEN the stored adapter-issued avatar value is returned

#### Scenario: Fresh user has no avatar

- GIVEN a newly registered user
- WHEN their profile is read
- THEN `avatar` is `null`

### Requirement: Profile Page with Crop UX

The system MUST provide `/profile` (Spanish copy) showing the current avatar and an upload control built on react-easy-crop (1:1 square, pan + zoom). The client MUST send the CROPPED image — a canvas `toBlob()` export capped at 1024px in the `avatar` multipart field — never crop coordinates or the original file.

#### Scenario: Crop and upload

- GIVEN the user picks an image on `/profile`
- WHEN they adjust the 1:1 crop and submit
- THEN a cropped blob is uploaded and the avatar preview updates

#### Scenario: Client-side export cap

- GIVEN a crop whose 1024px export would exceed 2MB
- WHEN the client exports the canvas
- THEN export stays capped at ≤1024px so the wire payload fits the 2MB cap

### Requirement: Avatar Upload API

POST `/api/me/avatar` MUST require a session (401). A payload over 2MB, or one whose magic bytes are not JPEG/PNG/WebP (MIME/extension never trusted), MUST return 400. Success MUST process with sharp to 256×256 cover-cropped WebP ONLY, store it under a server-issued key `<userId>-<uuid>.webp` via the storage adapter, return 200 with the adapter-issued value, and delete the previous file on replace.

#### Scenario: Valid upload stored as WebP

- GIVEN an authenticated user with a JPEG under 2MB
- WHEN they POST it to `/api/me/avatar`
- THEN 200 returns an adapter-issued value, only a 256×256 WebP is stored, and no original is kept

#### Scenario: Oversized upload rejected

- GIVEN a multipart payload over 2MB
- WHEN it is POSTed
- THEN it returns 400 and no file is stored

#### Scenario: Non-image rejected

- GIVEN an SVG (or other non-JPEG/PNG/WebP) file claiming a valid image MIME
- WHEN it is POSTed
- THEN magic-byte sniff fails, it returns 400, and no file is stored

#### Scenario: Replace deletes the old file

- GIVEN a user with an existing avatar
- WHEN they upload a new avatar
- THEN the new value replaces the old in the DB and the previous file is deleted via the adapter

#### Scenario: Unauthenticated upload

- GIVEN no session
- WHEN POST `/api/me/avatar` is hit
- THEN it returns 401 and performs no write

### Requirement: Current User API

GET `/api/me` MUST return the session user's `id`, `name`, `email`, and `avatar` (401 unauthenticated). PATCH `/api/me` MUST accept only `name` (free text) and `avatar`, where `avatar` MUST be exactly `null` (clear) or the adapter-issued value previously returned by the server. Any other field, or a `data:`/external `avatar`, MUST return 400.

#### Scenario: Read own profile

- GIVEN an authenticated session
- WHEN GET `/api/me` is called
- THEN the response contains id, name, email, and avatar

#### Scenario: Update display name

- GIVEN an authenticated user
- WHEN they PATCH `{ "name": "Nuevo" }`
- THEN 200 returns the updated name

#### Scenario: Clear avatar with null

- GIVEN a user with an avatar
- WHEN they PATCH `{ "avatar": null }`
- THEN 200 returns `avatar: null` (the stored file MAY be deleted)

#### Scenario: External avatar URL rejected

- GIVEN a PATCH submitting a `data:` URI or an external URL as `avatar`
- WHEN it is submitted
- THEN it returns 400 and the stored avatar is unchanged

### Requirement: My Profile Nav Entry

The shell nav MUST include an English "My Profile" link to `/profile` in the shared `NAV_ITEMS` array alongside "Teams" and "Ligas".

#### Scenario: Nav link renders and routes

- GIVEN the shell renders on any route
- WHEN the nav renders
- THEN a "My Profile" link to `/profile` is present alongside Teams and Ligas and activates the route

### Requirement: Match Card Owner Avatar

The league detail GET MUST carry each fixture owner's `avatar` (enrichFixture → FixtureOwnerRef → FixtureDraft). MatchCard's TeamSide MUST render the owner avatar image when present, and nothing when absent, keeping existing name fallbacks.

#### Scenario: Owner avatar rendered

- GIVEN a fixture whose home owner has an avatar
- WHEN the league detail renders MatchCard
- THEN the home TeamSide shows the avatar image beside the owner name

#### Scenario: Owner without avatar

- GIVEN a fixture owner with `avatar: null` or an unresolvable nested user
- WHEN the league detail renders MatchCard
- THEN no image renders for that side and the existing name fallback is unchanged
