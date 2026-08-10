# Proposal: Avatar Profile (v2)

## Intent

Users have no identity: no avatar, no profile page; matchday cards show only owner names. Add a personal avatar on `/profile` (Spanish copy) and the enfrentamientos UI (MatchCard TeamSide), plus an English "My Profile" nav entry. v2 changes: store ONLY WebP (256×256, sharp server-side) so the storage volume can't fill up; crop+zoom UX via react-easy-crop; storage behind a driver (local now, S3 later — also reusable for team shields).

## Scope

**In**: `User.avatar String?` (additive migration, stores adapter-issued value) · crop UI (react-easy-crop, drag+zoom, 1:1 square, client canvas blob) · `POST /api/me/avatar` (≤2MB, jpeg/png/webp magic-byte sniff, sharp → 256×256 WebP only, server-issued filenames `<userId>-<uuid>.webp`, old file deleted on replace) · StorageAdapter interface + `LocalStorageAdapter` + `S3StorageAdapter`, selected by `STORAGE_DRIVER=local|s3` (default local) · `GET`/`PATCH /api/me` (PATCH allowlist: `null` or adapter-issued value; never `data:`/external) · `/profile` (Spanish) + "My Profile" nav · MatchCard TeamSide via `enrichFixture` → `FixtureOwnerRef` → `FixtureDraft`.

**Out**: avatar in Topbar/LeagueList · JWT-carried avatar (session untouched) · SVG/multi-image · original-format retention · presigned S3 URLs · shield uploads now (adapter designed for reuse later).

## Capabilities

**New**: `user-profile` — avatar crop/upload, `/api/me`, `/profile`, nav, match-card render.
**New**: `storage-adapter` — driver interface, Local+S3 impls, env selection, delete semantics.
**Modified**: None (session/JWT contract untouched).

## Approach

- Client sends the CROPPED IMAGE, never crop coords: react-easy-crop (pan+zoom, aspect 1) → canvas → `toBlob()` → multipart `avatar` field. No trust in client geometry.
- Server: `sharp(buf).resize(256,256,{fit:"cover"}).webp()` → `adapter.put("avatars/<userId>-<uuid>.webp")` → persisted path/URL. Only WebP touches disk/S3.
- StorageAdapter: `put`/`delete`. Local writes `public/uploads/avatars/` and returns `/uploads/…`; S3 uses `@aws-sdk/client-s3` (bucket/region/endpoint/creds via env), returns URL from `S3_PUBLIC_URL`; tests mock the client — no creds needed.
- Serve via plain `<img>`; `/profile` auto-protected by existing `proxy.ts`; `.gitignore` += `public/uploads/`.
- Slices for 400-line budget: DB+storage+API · profile+nav · MatchCard+e2e.

## Affected Areas

`prisma/schema.prisma` · `lib/storage/` (adapter/local/s3/factory + tests) · `app/api/me/route.ts`, `app/api/me/avatar/route.ts` (new) · `package.json`, `.gitignore` · `app/profile/page.tsx` + `features/profile/` (new) · `components/Sidebar.tsx` · `app/api/leagues/[id]/route.ts`, `features/leagues/api.ts`, `features/leagues/MatchCard.tsx`

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Docker `public/` writes ephemeral (lost on recreate) | Med | Volume mount; S3 driver for durability |
| S3 path untested with real creds | Med | Mock-unit tests; driver gated by env |
| aws-sdk ~13 deps / image size | Low | Isolated in adapter |
| sharp standalone trace (alpine) | Low | Direct import; musl binary in lockfile; verify docker build |
| 2MB cap vs large canvas blobs | Low | Client caps export canvas ≤1024px |
| Stored XSS via SVG/`data:` | Low | Sniff jpeg/png/webp; PATCH allowlist |

## Rollback

Re-additive: drop `avatar` column (only avatar strings lost); remove routes/page/nav/adapter; orphan files inert; default `local` driver keeps behavior.

## Dependencies

`sharp@0.35.3` (already in lockfile via next) · `react-easy-crop@6.2.3` (peer react ≥16.4 ✓) · `@aws-sdk/client-s3@3.1106.0`.

## Success Criteria

- [ ] Upload persists across reload; renders on `/profile` + both MatchCard sides
- [ ] Only WebP stored, decoded 256×256; no originals
- [ ] >2MB/non-image → 400; unauthenticated → 401; S3 path unit-tested without creds
- [ ] `pnpm test`, lint, `tsc --noEmit`, auth e2e green; one additive migration

## Proposal question round (assumptions to review)

1. 2MB wire cap kept, client caps export canvas — OK?
2. S3 served via public bucket URL (no presigned) — OK?
3. 1:1 square crop (final 256×256) — OK?
