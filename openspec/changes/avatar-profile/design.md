# Design: Avatar Profile

## Technical Approach

Client crops (react-easy-crop, 1:1) and sends the CROPPED blob (canvas `toBlob()` ≤1024px, multipart). Server sniffs magic bytes (JPEG/PNG/WebP only), sharp-resizes to 256×256 cover WebP, stores via a pluggable `StorageAdapter` under a server-issued key, persists the adapter value on `User.avatar`, and serves via plain `<img>` (public URL — no presigned). Session/JWT untouched. Maps 1:1 to the three specs (`user-profile`, `storage-adapter`, `app-shell`).

## Architecture Decisions

### Fork 1 — Upload transport

| Option | Tradeoffs | Decision |
|---|---|---|
| **A. multipart via `req.formData()`** | Native Web API in Next 16 route handlers, zero deps; buffers body in memory (fine ≤2MB); manual size check | **✅ Chosen** |
| B. base64 in JSON | 33% wire overhead, fights the 2MB cap, inflates memory | Rejected |
| C. streaming `req.body` → sharp | Peak memory efficiency, but sharp needs buffering for format detect; complexity without payoff at ~50KB blobs | Rejected |

Reject early via `Content-Length` when present, then `file.size` ≤ 2MB after parse. Both → 400.

### Fork 2 — StorageAdapter shape

| Option | Tradeoffs | Decision |
|---|---|---|
| **A. Minimal `put`/`delete`** | Exactly the storage-adapter spec; `put(key, buffer)` resolves to the opaque issued value (path or public URL); no avatar logic; namespaced keys (`avatars/…`) make team-shield reuse free | **✅ Chosen** |
| B. Richer (get/exists/signed-url) | Speculative; `get` unneeded (public URL served by `<img>`), signed URLs contradict the S3 public-URL decision | Rejected |

### Fork 3 — API route topology

| Option | Tradeoffs | Decision |
|---|---|---|
| **A. `POST /api/me/avatar` + `GET/PATCH /api/me`** | Binary+sharp isolated from JSON profile; PATCH allowlist stays crisp (`name`, `avatar` null-or-current-DB-value only) | **✅ Chosen** |
| B. Combined multipart PATCH /api/me | One endpoint, but JSON fields + file interleaved; sharp errors entangled with allowlist validation | Rejected |

PATCH allowlist: unknown field, or `avatar` not exactly `null`/current stored value (`data:`/external/`http(s)://`) → 400. Never trust client-supplied URLs.

### Fork 4 — Sharp processing location

| Option | Tradeoffs | Decision |
|---|---|---|
| **A. Synchronous in-route** | ≤2MB input → ~10–50KB 256×256 WebP; sharp resize is tens of ms; 400 errors return directly | **✅ Chosen** |
| B. Background queue | Durable but no queue infra exists; failure windows; overkill | Rejected |

**Critical**: `sharp@0.35.3` is in the pnpm store (via Next) but NOT resolvable from app code — `pnpm add sharp` is required, and the route must `import sharp from "sharp"` directly so the standalone trace (alpine/musl) bundles it. Order: put new → DB update (keep old value) → delete old key; both failure paths leave only inert orphans (safe delete makes it idempotent).

### Fork 5 — Avatar propagation to MatchCard

| Option | Tradeoffs | Decision |
|---|---|---|
| **A. Extend league-detail GET** | `enrichFixture` gains `avatar` (add `avatar: true` to the nested Prisma user select, lines 145–146); `FixtureOwnerRef` and client `FixtureDraft.homeOwner/awayOwner` gain optional `avatar`; zero round-trips, no N+1 | **✅ Chosen** |
| B. Separate avatar lookup | Decoupled, but extra round-trips per matchday and new API surface | Rejected |

Blast radius (spec warning): `FixtureOwnerRef` has no covering test and the existing `route.test.ts:192` asserts `homeOwner` `toEqual({id,name})` — that assertion intentionally changes to include `avatar: null`. The `avatar` field is optional on `FixtureDraft` (18 consumers untouched).

### Fork 6 — Frontend structure

| Option | Tradeoffs | Decision |
|---|---|---|
| **A. `features/profile/` + shared `components/UserAvatar.tsx`** | Feature module matches repo layout (features/teams, features/leagues); UserAvatar is cross-feature (MatchCard + profile) so it belongs in `components/` (precedent: AuthCard, Topbar); renders `<img>` when src present, nothing otherwise (MatchCard spec) | **✅ Chosen** |
| B. Inline markup in both | Duplicates sizing/fallback logic, drift risk | Rejected |
| C. UserAvatar in features/profile | Couples leagues→profile (wrong direction) | Rejected |

## Data Flow

```
/profile (client, Spanish) ──GET──▶ /api/me (401→ Unauthorized)
   │ crop → canvas.toBlob() ≤1024px
   └─multipart "avatar"──▶ POST /api/me/avatar
                              ├─ sniff magic bytes (JPEG/PNG/WebP) → 400
                              ├─ sharp.resize(256,256,cover).webp()
                              ├─ adapter.put("avatars/<uid>-<uuid>.webp") → value
                              ├─ prisma user.avatar = value (old kept) → delete old
                              └─ 200 { avatar: value }
league GET ──▶ prisma select(+avatar) ──▶ enrichFixture ──▶ FixtureDraft ──▶ MatchCard TeamSide ──▶ <img>
```

## File Changes

| File | Action | Description |
|---|---|---|
| `prisma/schema.prisma` + migration `add_user_avatar` | Modify/Create | `avatar String?` on User |
| `lib/storage/adapter.ts`, `local.ts`, `s3.ts`, `factory.ts` (+tests) | Create | Driver layer |
| `app/api/me/route.ts`, `app/api/me/avatar/route.ts` (+tests) | Create | Profile + upload |
| `app/profile/page.tsx`, `features/profile/` (CropDialog, api.ts) | Create | Spanish page, crop UX |
| `components/UserAvatar.tsx` (+test) | Create | Shared avatar render |
| `components/Sidebar.tsx` | Modify | NAV_ITEMS += `My Profile` → `/profile` |
| `app/api/leagues/[id]/route.ts`, `features/leagues/api.ts`, `MatchCard.tsx` (+tests) | Modify | avatar propagation |
| `package.json`, `.gitignore`, `Dockerfile`, `docker-compose.yml` | Modify | sharp/react-easy-crop/aws-sdk deps; ignore `public/uploads/`; uploads chown + named volume |
| `playwright.config.ts` + `playwright.config.auth.ts` | Modify | `e2e/avatar.spec.ts` ignored locally, matched in auth suite |

## Security

Magic-byte sniff (`FFD8FF`/`89504E47…`/`RIFF…WEBP`) — MIME/extension never trusted; SVG/`data:` rejected implicitly. Keys server-issued `<userId>-<uuid>.webp` (crypto.randomUUID) — no user input in paths. 2MB cap bounds decompression. No client geometry trust: server sees pixels only, `cover` enforces 256×256. PATCH allowlist blocks stored XSS via URL injection.

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit | sniff, sharp pipeline, factory fallback, adapter put/delete (S3 mocked), PATCH allowlist, `enrichFixture` avatar, TeamSide render, UserAvatar | Vitest + RTL (`getByText`/`toBeTruthy` — no jest-dom); mock `@/auth`, `@/lib/prisma` (route.test.ts pattern) |
| Integration | route 401/400/200, delete-on-replace, clear via null | mocked auth+prisma per repo convention |
| E2E | upload→render→reload→clear on `/profile` + MatchCard owner avatar | `e2e/avatar.spec.ts` in **auth suite only** (real DB) |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary in this change (upload sniffing is app-level security, covered above, not agent pipeline). No rows propagate.

## Migration / Rollout

Additive migration; no feature flag. **Docker**: `public/` writes are ephemeral — add `RUN mkdir -p /app/public/uploads && chown -R node:node …` (pre-`USER node`) so the named volume `web_uploads:/app/public/uploads` in compose inherits node ownership; S3 driver is the durable path. Rollback: drop column, remove routes/page/nav/adapter; orphans inert; `local` default keeps behavior.

## Open Questions

- [ ] S3 env var names to standardize (bucket/region/endpoint/creds/public URL) before tasks
- [ ] Name length cap for PATCH `name` (spec: free text)
