# Tasks: Avatar Profile

## Review Workload Forecast

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High
```

Total est. ~620–780 lines, High risk glob, per-slice Medium. Design split "DB+storage+API" into 4 safe slices. Delivery: ask-on-risk.

### Work Units (chained PRs)

| Unit | Goal | PR | Focused test cmd | Runtime harness | Rollback boundary |
|------|------|----|------|------|------|
| 1 | storage+DB | PR1 | `pnpm vitest run lib/storage` | local put→`public/uploads/avatars/` in dev | drop col + `lib/storage/` |
| 2 | /api/me API+sharp | PR2 | `pnpm vitest run app/api/me` | curl multipart 400/200 + reload | rm `app/api/me/` + revert migration |
| 3 | /profile+nav | PR3 | `pnpm vitest run app/profile components/Sidebar` | crop→upload→reload (AUTH_MODE=auth) | rm profile dirs; revert NAV_ITEMS |
| 4 | MatchCard+e2e | PR4 | `pnpm vitest run app/api/leagues/[id] features/leagues/MatchCard` | `playwright test avatar` (auth suite) | revert select+FixtureDraft; rm avatar.spec |

## Phase 1: Storage + DB
- [x] 1.1 (R1/R4) `lib/storage/*.test.ts`: local put→file+path, delete-missing no-op, S3 put/delete vs mock; factory default `local`, `s3` when set, invalid→local, no S3 client (RED first)
- [x] 1.2 Prisma: `avatar String?` on User + `pnpm prisma migrate dev --name add_user_avatar` (additive)
- [x] 1.3 Create `lib/storage/`: `adapter.ts` (put/delete, namespaced `avatars/…`), `local.ts` (`public/uploads/avatars/`→`/uploads/…`), `s3.ts` (`${S3_PUBLIC_URL}/${key}`), `factory.ts` (`STORAGE_DRIVER`)
- [x] 1.4 GREEN `pnpm vitest run lib/storage`; `.gitignore` += `public/uploads/`; add `@aws-sdk/client-s3`; Dockerfile mkdir/chown uploads + volume

## Phase 2: Profile API
- [x] 2.1 (R3) `pnpm add sharp` (direct dep); import in route
- [x] 2.2 (R3) magic-byte sniff (JPEG `FFD8FF`/PNG/WebP `RIFF..WEBP`), MIME never trusted; RED rejects SVG/`data:` → 400
- [x] 2.3 (R3) RED >2MB via `Content-Length`/`file.size` → 400, nothing stored
- [x] 2.4 (R1/R5) RED `app/api/me/route.test.ts`: GET 401 + id/name/email/avatar; PATCH allowlist only `name` or `avatar` null/current DB value — `data:`/external/http→400
- [x] 2.5 (R3/R6) `POST /api/me/avatar`: 401 → sniff → sharp `resize(256,256,cover).webp()` → `adapter.put("avatars/<uid>-<uuid>.webp")` → DB update (keep old) → `delete` old → 200 value
- [x] 2.6 (R3) `avatar/route.test.ts` (mock auth+prisma): 401/400/200, replace deletes old, clear null. GREEN both

## Phase 3: Profile + Nav
- [x] 3.1 (R2) `pnpm add react-easy-crop`; client crop→canvas `toBlob()` export capped ≤1024px
- [x] 3.2 `components/UserAvatar.tsx`: `<img>` if `src` else nothing; test via `textContent`/regex (no jest-dom)
- [x] 3.3 `features/profile/api.ts` (getMe/patchMe/uploadAvatar) + `CropDialog.tsx` (aspect 1, pan+zoom)
- [x] 3.4 `app/profile/page.tsx` Spanish copy; show avatar, upload control, preview updates
- [x] 3.5 (app-shell) Sidebar `NAV_ITEMS` += `{href:"/profile", label:"My Profile"}`; update `AppShell.test.tsx` (delta: Teams+Ligas+My Profile only)

## Phase 4: MatchCard + E2E
- [ ] 4.1 (R6) colindante route.test.ts:~190 add `avatar: null` to `homeOwner` `toEqual` (design-note intentional assertion change)
- [ ] 4.2 (R6) route.ts select pl145-146 += `avatar: true`; `enrichFixture`+`FixtureOwnerRef`+`FixtureDraft.homeOwner/awayOwner` optional `avatar`
- [ ] 4.3 (R6) `MatchCard.tsx` TeamSide renders `UserAvatar` beside owner name (nothing when absent, fallback kept); update `MatchCard.test.tsx`
- [ ] 4.4 `e2e/avatar.spec.ts`: upload→render→reload→clear (/profile + MatchCard); add to `playwright.config.auth.ts` testMatch, exclude in `playwright.config.ts`

## Final Gates
- [ ] 5.1 `pnpm test`, `pnpm lint`, `tsc --noEmit` green
- [ ] 5.2 `AUTH_MODE=local pnpm exec playwright test`; `AUTH_MODE=auth pnpm exec playwright test avatar`
