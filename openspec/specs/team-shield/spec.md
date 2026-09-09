# team-shield Specification

## Purpose

Owner upload of a custom team shield (emblem) that replaces the deterministic `TeamEmblem` placeholder on team cards, match cards and team detail. Mirrors the avatar pipeline: magic-byte sniff, sharp square-crop WebP, storage-adapter blob, owner-only routes. Out of scope: live match header (MVT-8 acronym invariant), standings, scouting-list, SVG, multiple shields.

## Requirements

### Requirement: TS-1 · Shield Upload

POST `/api/teams/[id]/shield` MUST accept a multipart `shield` field for the team owner only (401 unauthenticated; 404 foreign/archived). The payload MUST NOT exceed 2MB and its magic bytes MUST be JPEG/PNG/WebP (MIME never trusted) — otherwise 400 with no mutation. On success the server MUST resize to a 512×512 cover-cropped WebP, store it under key `shields/<teamId>-<uuid>.webp` via the storage adapter, persist the issued value on `Team.emblem` (old value kept until the put succeeds), delete the previous blob, and return 200 `{ emblem: <issued value> }`.

#### Scenario: Owner uploads a shield

- GIVEN the session user owns a non-archived team
- WHEN they POST a ≤2MB PNG `shield`
- THEN a 512 WebP is stored under `shields/<teamId>-<uuid>.webp`, `Team.emblem` holds the issued value, any previous blob is deleted, and 200 returns `{ emblem }`

#### Scenario: Oversize or wrong-kind rejected

- GIVEN an owned team
- WHEN they POST a payload over 2MB or with non-JPEG/PNG/WebP magic bytes (e.g. SVG)
- THEN 400 returns and nothing is stored or written to `Team.emblem`

### Requirement: TS-2 · Shield Removal

DELETE `/api/teams/[id]/shield` MUST be owner-only (401 unauthenticated; 404 foreign/archived) and MUST set `Team.emblem` to null and delete the stored blob via `adapter.delete`. Removing when no shield exists MUST succeed as a no-op. Removal MUST restore the deterministic placeholder wherever the emblem rendered.

#### Scenario: Owner removes shield

- GIVEN the session user owns a team with a stored `emblem`
- WHEN they DELETE the shield
- THEN `Team.emblem` becomes null, the blob is deleted, and 200 returns

#### Scenario: Remove with no shield is a no-op

- GIVEN an owned team with `emblem` null
- WHEN they DELETE the shield
- THEN it returns success and no blob operation errors

### Requirement: TS-3 · Shield Serve Route

GET `/uploads/shields/<key>` MUST serve the stored WebP through the storage adapter with `Content-Type: image/webp` and immutable cache, and MUST reject keys not matching `^[a-zA-Z0-9]+-[0-9a-f-]+\.webp$` (404). It MUST be a sibling route that does not alter avatar serving.

#### Scenario: Stored shield served

- GIVEN a stored shield key `t-abc-1234.webp`
- WHEN GET `/uploads/shields/t-abc-1234.webp` is requested
- THEN the WebP bytes return with image/webp and immutable cache headers

#### Scenario: Malformed key rejected

- GIVEN a request for a key outside the `shields/` namespace or not matching the key shape
- WHEN it is requested
- THEN 404 returns and no blob is read

### Requirement: TS-4 · Owner Gating

Shield upload and removal MUST scope every query to the session user (`findFirst { id, userId, archivedAt: null }`) so a foreign or archived team id returns 404 with no mutation and no existence leak. The rendered shield MUST be visible to any authorized team viewer; only the owner sees the controls.

#### Scenario: Foreign team denied

- GIVEN a team owned by another user
- WHEN the session user POSTs or DELETEs its shield
- THEN 404 returns and no mutation occurs

#### Scenario: Non-owner sees shield, no controls

- GIVEN an authorized scouting viewer of a rival team with a shield
- WHEN the team detail renders
- THEN the shield image shows but no upload/remove controls appear

### Requirement: TS-5 · Shared Image Helper

A shared helper MUST expose `MAX_UPLOAD_BYTES`, `sniffImageBytes`, and a key-recovery function in byte-identical form so the avatar route delegates to it and re-exports the same names; avatar behavior and its existing tests MUST NOT change.

#### Scenario: Avatar refactor is behavior-neutral

- GIVEN the extracted helper and the avatar route delegating to it
- WHEN the avatar route tests run
- THEN every existing assertion (sniff accept/reject, key recovery, 401/400/200 flow) passes unchanged

### Requirement: TS-6 · Emblem Rendering with Fallback

`TeamEmblem` MUST render the team's `emblem` image when present and MUST fall back to the existing deterministic tinted-initial placeholder when `emblem` is null or missing. TeamCard, MatchCard and the team detail hero MUST render the shield; the live match header MUST keep the MVT-8 acronym glyph (no shield there).

#### Scenario: Shield shown when present

- GIVEN a team with a non-null `emblem`
- WHEN TeamCard, MatchCard or team detail renders
- THEN the shield `<img>` shows in place of the placeholder

#### Scenario: Fallback when absent

- GIVEN a team with `emblem` null
- WHEN any surface renders
- THEN the deterministic placeholder renders unchanged (testids/aria preserved)
