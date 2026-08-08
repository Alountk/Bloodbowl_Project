# Apply Progress: auth-backend — PR1 (DB) + PR2 (Auth + Persistence) + PR3 (Migration + E2E + Ops)

- **Date**: 2026-08-08
- **Phase**: sdd-apply — PR1 + PR2 + PR3 merged progress (chained stacked-to-main)
- **Mode**: Strict TDD (test runner: `pnpm test` / `vitest run`)
- **Delivery**: stacked PRs → base = `main`; PR1 = `feat/auth-backend-pr1`, PR2 = `feat/auth-backend-pr2` (FROM PR1), PR3 = `feat/auth-backend-pr3` (FROM PR2)

---

# PR 1 — DB Foundation (recorded in prior apply-progress; preserved / merged)

## Scope Delivered (PR1)

DB foundation only. No auth, no API routes, no store swap (all deferred to PR2).

1. `prisma/schema.prisma` — datasource postgresql, `prisma-client-js` generator with `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]`; `User` (id cuid PK, email @unique, passwordHash, name?, createdAt) and `Team` (id cuid PK, userId FK→User ON DELETE CASCADE, name, raceId, leagueType, roster Json, coaching Json, createdAt, @@index([userId])).
2. `prisma/migrations/20260808132125_init/migration.sql` — created and applied against a throwaway `postgres:16-alpine`; verified tables + cascade.
3. `docker-compose.yml` — added `postgres` service (`postgres:16-alpine`, POSTGRES_USER/PASSWORD/DB, volume, healthcheck, port 5432) and wired `DATABASE_URL`/`AUTH_SECRET`/`AUTH_TRUST_HOST` into the `web` service.
4. `lib/prisma.ts` — PrismaClient singleton (globalThis-cached for dev hot-reload).
5. `Dockerfile` — `prisma generate` in deps+build stages; `prisma migrate deploy` in `docker-entrypoint.sh` before `node server.js`.
6. `.env.example` — `DATABASE_URL`, `AUTH_SECRET`, `AUTH_TRUST_HOST=true`; no real secrets.
7. `package.json` — pinned `@prisma/client` + `bcryptjs` (deps), `prisma` (devDeps), scripts `db:generate`/`db:migrate`.

## PR1 TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 schema | `lib/prisma.test.ts` | Unit | ✅ 446/446 | ✅ Written first | ✅ Passed | ✅ 3 cases | ✅ Clean |
| 1.2 singleton | `lib/prisma.test.ts` | Unit | ✅ 446/446 | ✅ Written first | ✅ Passed | ✅ 3 cases | ✅ Clean |
| 1.7 test+bootstrap | `lib/prisma.test.ts` | Unit | ✅ 446/446 | ✅ Written first | ✅ Passed | ✅ 3 cases | ✅ Clean |
| 1.3 migration | `lib/prisma.test.ts` + SQL | Integration | ✅ 446/446 | N/A (DB) | ✅ Applied | ✅ cascade test | ✅ Clean |
| 1.4 compose | — | Config | ✅ 446/446 | N/A (config) | — | — | — |
| 1.5 env example | — | Config | ✅ 446/446 | N/A (config) | — | — | — |
| 1.6 Dockerfile | Docker build | Integration | ✅ 446/446 | N/A (image) | ✅ build validating | — | — |
| 1.8 suite green | full `pnpm test` | Unit | ✅ 446/446 | — | ✅ 449/449 | — | — |

## PR1 Work Unit Evidence

### Unit: Prisma schema + singleton + RED test (tasks 1.1, 1.2, 1.7)
| Evidence | Required value |
|---|---|
| Focused test command | `pnpm vitest run lib/prisma.test.ts` → 3 passed |
| Runtime harness | `prisma migrate dev --name init` applied; `docker exec ... psql` INSERT user+team, DELETE user → team 1→0 (cascade verified) |
| Rollback boundary | Remove `prisma/`, `lib/prisma.ts`, `lib/prisma.test.ts`; app compose unaffected |

### Unit: Migration (task 1.3)
| Evidence | Required value |
|---|---|
| Focused test command | migration SQL reviewed line-by-line (33 lines, 2 CREATE TABLE, cascade FK) |
| Runtime harness | applied against postgres:16-alpine; `\dt` shows User/Team/_prisma_migrations; cascade works |
| Rollback boundary | Drop `prisma/migrations/`; no runtime code depends on it yet |

### Unit: Docker + entrypoint (task 1.6)
| Evidence | Required value |
|---|---|
| Focused test command | `docker build -t bloodbowl-web:pr1-test .` → built |
| Runtime harness | `docker run` with postgres → entrypoint ran `prisma migrate deploy`, Next.js `✓ Ready`, `curl :3444/` → HTTP 200 |
| Rollback boundary | Revert Dockerfile + docker-entrypoint.sh; keep prisma/ intact |

## PR1 Verification Results (host, PR1 branch)

- `pnpm test` → 22 files, 449 tests passed.
- `pnpm lint` → clean.
- `npx tsc --noEmit` → 0 errors.
- Migration applied live to throwaway postgres; cascade verified.
- Docker image built and container boot verified end-to-end.

---

# PR 2 — Auth + Persistence (this apply batch)

## Scope Delivered (PR2)

Exactly the PR2 slice of the chained stacked-to-main delivery. Stacked on PR1: `feat/auth-backend-pr2` (base = `feat/auth-backend-pr1`). Auth.js v5 (next-auth@5.0.0-beta.32), Credentials + JWT strategy, bcryptjs hashing, user-scoped `/api/teams` persistence via a new `ApiTeamStore`, the `SessionProvider`/shell gate, login+signup pages, and logout in the Topbar.

### Auth wiring
1. `lib/auth-mode.ts` — pure `isAuthEnabled(env)` + `resolveAuthGate(...)` gate decision (local vs auth mode). Default `AUTH_MODE=local` = anonymous (route protection OFF, LocalStorage path); `AUTH_MODE=auth` = gate ON.
2. `auth.config.ts` (edge-safe, no prisma/bcrypt) — `session: { strategy: "jwt" }`, `pages.signIn = "/login"`, `callbacks.authorized` resolves the gate and redirects unauth→`/login` and authed→`/` when auth mode is on.
3. `auth.ts` (Node) — `NextAuth({ ...authConfig, providers: [Credentials({ authorize }) ]})` with bcryptjs compare + Prisma user lookup; exports `{ handlers, auth, signIn, signOut }`. `AUTH_SECRET`/`AUTH_TRUST_HOST` read from env.
4. `app/api/auth/[...nextauth]/route.ts` — `{ GET, POST } = handlers`.
5. `proxy.ts` (repo ROOT, Next 16, NOT middleware) — `export { auth as proxy } from "./auth"` + inline `config.matcher` gating everything except `/api`, `_next/static`, `_next/image`, and file URLs (so `/login`/`/signup` are matched and can redirect authenticated users away).
6. `app/api/auth/signup/route.ts` — POST email/password → validate (400), bcryptjs-hash, `prisma.user.create` (201), duplicate email P2002 → 409 "An account with this email already exists". Client calls `signIn("credentials")` after 201 to establish the session.
7. `app/login/page.tsx` + `app/signup/page.tsx` — rulebook-light client forms (white panel, navy hero `#12225a`, light inputs, navy submit), route via `useRouter().push("/")`, show errors.

### User-scoped persistence
8. `app/api/teams/route.ts` — GET lists `where userId=session`, POST creates owned by session (userId injected from session, 401 unauth, 400 missing name/race).
9. `app/api/teams/[id]/route.ts` — DELETE scoped `{ id, userId }`; foreign team id → 404; 401 unauth; 204 on success.
10. `features/teams/store/ApiTeamStore.ts` — implements the existing `TeamStore` interface via fetch; `list()` GET, `save()` POST, `remove(id)` DELETE treating 404 as no-op and throwing on other failures; normalizes API teams (coaching/leagueType defaults). `LocalStorageTeamStore` + `InMemoryTeamStore` untouched (interface preserved).

### Shell gate + store swap
11. `components/SessionProvider.tsx` — client wrapper around Auth.js `SessionProvider`.
12. `app/providers/SessionAppProvider.tsx` — client, reads `useSession()`; loading → lightweight loading state; authenticated → stable `ApiTeamStore` + `onLogout={() => signOut({ redirectTo: "/login" })}`; unauthenticated → LocalStorage fallback (anonymous path). In auth mode the proxy already redirects unauth users before this renders.
13. `components/AppShell.tsx` — accepts optional `store`/`authenticated`/`onLogout`, forwards to `AppProvider`; defaults to LocalStorage when no store passed.
14. `app/providers/AppProvider.tsx` — exposes `authenticated` + `logout` via context (optional props, defaults false/noop → existing store tests unaffected).
15. `components/Topbar.tsx` — renders a "Log out" button when `authenticated` (via `useApp`), calls `logout`.
16. `app/layout.tsx` — wraps children in `<SessionProvider><SessionAppProvider>`.
17. `features/teams/create/CreateTeamForm.tsx` — catches persistence failures to stay on the form with an error instead of navigating away/losing the team.

## PR2 TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 2.1 proxy gate | `lib/auth-mode.test.ts` + `auth.config.test.ts` | Unit | ✅ 449/449 | ✅ Written first | ✅ Passed | ✅ 15 cases | ✅ Clean |
| 2.2 auth config/auth.ts | `auth.config.test.ts` | Unit | ✅ 449/449 | ✅ Written first | ✅ Passed | ✅ 5 cases | ✅ Clean |
| 2.3 proxy.ts | `auth.config.test.ts` (authorized redirect) + build | Config/Integration | ✅ 449/449 | N/A (config) | ✅ build pass | ✅ authed→`/` case | ✅ Clean |
| 2.4 API 401/scoped/404 | `app/api/teams/route.test.ts`, `app/api/teams/[id]/route.test.ts` | Unit | ✅ 455/455 | ✅ Written first | ✅ Passed | ✅ 8 cases | ✅ Clean |
| 2.5 teams routes | same two test files | Unit | ✅ 455/455 | ✅ Written first | ✅ Passed | ✅ 8 cases | ✅ Clean |
| 2.6 ApiTeamStore RED | `features/teams/store/ApiTeamStore.test.ts` | Unit | ✅ 463/463 | ✅ Written first | ✅ Passed | ✅ 6 cases | ✅ Clean |
| 2.7 ApiTeamStore | same test file | Unit | ✅ 463/463 | ✅ Written first | ✅ Passed | ✅ 6 cases | ✅ Clean |
| 2.8 login/signup pages | `app/login/page.test.tsx`, `app/signup/page.test.tsx`, `app/api/auth/signup/route.test.ts` | Unit | ✅ 463/463 | ✅ Written first | ✅ Passed | ✅ 7 cases | ✅ Clean |
| 2.9 session swap asApi/Local | `app/providers/SessionAppProvider.test.tsx` | Integration | ✅ 471/471 | ✅ Written first | ✅ Passed | ✅ 4 cases | ✅ Clean |
| 2.10 shell gate + logout | `SessionAppProvider.test.tsx` (logout) | Integration | ✅ 471/471 | ✅ Written first | ✅ Passed | ✅ 1 case (logout) | ✅ Clean |
| 2.11 CreateTeamForm failure | `CreateTeamForm.failure.test.tsx` | Unit | ✅ 483/483 | ✅ Written first | ✅ Passed | ✅ 1 case | ✅ Clean |

Notes:
- `resolveAuthGate` is a pure function extracted so all route-gate branches (unauth protected → login, authed auth-page → home, local mode allow-all) are tested without mocks. The `authorized` callback reuses it.
- Auth mode is a deliberate switch used by both the server proxy gate and (implicitly) the client store selection: in `AUTH_MODE=local` no session exists so `SessionAppProvider` always picks the Local fallback — no separate client flag required. This is what keeps the 19 existing e2e anonymous and green.
- `config.matcher` had to live in `proxy.ts` (inline literal), NOT re-exported from `auth.config.ts` — Next statically parses `export const config` in the proxy file and rejects a re-export. Discovered at build; `auth.config.ts` no longer exports `config`.
- Dev noise: `CreateTeamForm.failure` uncovered that an unhandled rejected `addTeam` (API down) produced an unhandled promise error; caught it so the form keeps its submission spot. This fixed a real latent UX/console bug, not just a test.

## PR2 Work Unit Evidence

### Unit: Auth wiring + proxy + signup + login/signup pages (tasks 2.1–2.3, 2.8)
| Evidence | Required value |
|---|---|
| Focused test command | `pnpm vitest run lib/auth-mode.test.ts auth.config.test.ts app/api/auth/signup/route.test.ts app/login/page.test.tsx app/signup/page.test.tsx` → 22 passed |
| Runtime harness | `AUTH_MODE=local npx next dev` → `/` 200, `/teams/create` 200, `/login` 200, `/signup` 200, `/teams/xyz` 200 (no forced redirect); `POST /api/auth/signup` bad payload → 400. With `.env` AUTH_SECRET set, `/api/auth/session` → `null` (clean, no 500). Production build (objectively) `✓ Proxy (Middleware)` active. |
| Rollback boundary | Remove `auth.config.ts`, `auth.ts`, `proxy.ts`, `app/api/auth/`, `app/login`, `app/signup`, `lib/auth-mode.*`, `next-auth` dep; shell/persistence unrelated |

### Unit: User-scoped teams API + ApiTeamStore (tasks 2.4–2.7)
| Evidence | Required value |
|---|---|
| Focused test command | `pnpm vitest run app/api/teams app/api/teams/[id] features/teams/store/ApiTeamStore.test.ts` → 14 passed (`/api/teams` 5, `[id]` DELETE 3, ApiTeamStore 6) |
| Runtime harness | Anonymous curl to `/api/teams` impossible without session; API routes unit-tested via mocked `auth()` (401) + mocked prisma (list/scope/foreign-delete). Real signup/create requires the DB (Postgres), which is not running in this environment → runtime boundary for the API/store is exercised through mocked-fetch unit tests plus a real production build. |
| Rollback boundary | Remove `app/api/teams/`, `features/teams/store/ApiTeamStore.ts` + test; shell/local stores unaffected, AppProvider's Local fallback survives |

### Unit: Session gate + store swap + logout (tasks 2.9–2.11)
| Evidence | Required value |
|---|---|
| Focused test command | `pnpm vitest run app/providers/SessionAppProvider.test.tsx features/teams/create/CreateTeamForm.failure.test.tsx` → 5 passed |
| Runtime harness | `AUTH_MODE=local` `pnpm run test:e2e` → **19/19 passed** (anonymous create-team + mobile): loading→Local fallback, authenticated→Api (proxy-gated), logout wired. Direct auth-mode runtime (real login/signup against Postgres) deferred to PR3 auth e2e. |
| Rollback boundary | Revert AppProvider/AppShell/Topbar/layout/SessionAppProvider/CreateTeamForm changes; Local fallback + existing e2e intact |

## PR2 Verification Results (on `feat/auth-backend-pr2`)

- `pnpm test` → **32 files, 490 tests passed** (449 baseline + 41 new).
- `pnpm lint` → clean (0 errors, 0 warnings).
- `npx tsc --noEmit` → 0 errors.
- `pnpm next build` → **compile + types + static generation + `ƒ Proxy (Middleware)` all pass**.
- `pnpm run test:e2e` → **19/19 passed** (anonymous local path).
- The 19 e2e remain green because `AUTH_MODE` defaults to `local` (anonymous): the proxy gate allows all routes and `SessionAppProvider` falls back to LocalStorage when there's no session. A gitignored local `.env` (AUTH_SECRET + AUTH_TRUST_HOST=true, matching `.env.example`) is required for the existing zero-console-error e2e to pass without an Auth.js config error on `/api/auth/session`.

## e2e / Auth-Mode Decision (documented)

- **Decision**: Route protection is implemented and unit-tested, but enabled by `AUTH_MODE=auth`. Default is `AUTH_MODE=local` (anonymous), which keeps the existing 19 e2e green with the LocalStorage path. In auth mode the proxy redirects unauthenticated users to `/login` and redirects authenticated users away from `/login`/`/signup`.
- **What is deferred to PR3**: the real end-to-end signed-in flow (`e2e/auth.spec.ts` signup→create→reload→logout→login), the localStorage `bb_teams_v1` migration (`e2e/migration.spec.ts`), and two-user isolation/foreign-404 e2e. PR3 will drive the app in `AUTH_MODE=auth` against a real Postgres.

## Deviations from Design (PR2)

1. **`config.matcher` lives in `proxy.ts`, not re-exported from `auth.config.ts`.** Next 16 statically parses `export const config` in the proxy file and rejects re-exported config (`Next.js can't recognize the exported config field`). Kept as an inline literal matcher in `proxy.ts`.
2. **Route-protection gated by `AUTH_MODE`.** The design implies always-on route protection; to honor "keep the existing 19 e2e green" and the task's auth-mode preference, protection is behind `AUTH_MODE=auth` (default `local`). In `local` mode the `authorized` gate returns `true` (allow all) and the anonymous LocalStorage path works. Production/CI must set `AUTH_MODE=auth`.
3. **`proxy.ts` imports the Node `auth` (from `auth.ts`), not the edge `authConfig` directly.** The design's literal `export { auth as proxy }` is the Auth.js v5 documented pattern; Next 16's proxy runtime is Node, so bundling Prisma/bcryptjs is acceptable and build/type/unit verified (build succeeds even without `DATABASE_URL`).
4. **Client does not re-read `AUTH_MODE`.** The store swap is driven purely by `useSession()` status (authenticated → Api, otherwise → Local). In auth mode the proxy redirects unauthenticated users before the client branches reach the Local path, so no separate client flag or `NEXT_PUBLIC_*` copy is needed.
5. **Required local `.env` for zero-console-error e2e.** The existing "loads without console errors" e2e asserts an empty console; wiring `SessionProvider` made `/api/auth/session` log an Auth.js config 500 unless `AUTH_SECRET` is set. A gitignored local `.env` (dev secret, matching `.env.example`) resolves it. No committed secret.

## Remaining Tasks (after PR2)

- [x] 3.1–3.6 (PR3 migration + auth e2e + ops) — completed in this batch below.
- [ ] 4.1–4.2 (final verification across all PRs) — sdd-verify.

---

# PR 3 — Migration + E2E + Ops (this apply batch)

- **Date**: 2026-08-08
- **Phase**: sdd-apply — PR3 (final stacked slice), base = `feat/auth-backend-pr2`
- **Mode**: Strict TDD (test runner: `pnpm test` / `vitest run`)
- **Delivery**: stacked-to-main; PR3 branch = `feat/auth-backend-pr3` (created FROM `feat/auth-backend-pr2` so the PR3 diff = migration + e2e + ops only).
- **Artifacts**: `openspec/changes/auth-backend/apply-progress.md` (this file, MERGED across PR1+PR2+PR3), `tasks.md` marked `[x]` for Phases 1–3.

## Scope Delivered (PR3)

Exactly the PR3 slice: the per-browser legacy `bb_teams_v1` → account migration
hook, the real-DB auth/migration/isolation Playwright suites + `test:e2e:auth`
script/config, and ops documentation. Two latent PR2 auth bugs surfaced and
fixed (below), required for the migration + e2e to work at all.

### Migration hook
1. `features/migration/migrateLocalTeams.ts` — pure, flag-gated migration. Reads
   `bb_teams_v1`, POSTs each into `/api/teams`, sets `bb_teams_migrated_v1`,
   NEVER clears `bb_teams_v1`, idempotent, partial-failure returns `failed` and
   leaves the flag unset (retry next login). 5 unit tests.
2. `features/migration/useTeamMigration.ts` — client hook that runs it when the
   session becomes authenticated; non-blocking (logs/warns), calls `onMigrated`
   after posting ≥1 team. 6 unit tests.
3. `app/providers/SessionAppProvider.tsx` — wires `useTeamMigration(authenticated,
   { onMigrated })`; bumps `reloadVersion` so AppProvider re-hydrates and the
   migrated teams appear without a manual reload.
4. `app/providers/AppProvider.tsx` + `components/AppShell.tsx` — optional
   `reloadVersion` prop re-runs the store `list()` effect (re-hydration). Tests.

### Real-DB auth e2e (AUTH_MODE=auth + Postgres)
5. `e2e/auth.spec.ts` — signup → create team → reload → logout → login; team
   persists from the DB. **Passes.**
6. `e2e/migration.spec.ts` — seed `bb_teams_v1` before login → teams appear in
   the account + flag set + legacy copy retained; a later login does **not**
   duplicate. **Passes.**
7. `e2e/isolation.spec.ts` — two users isolated (B cannot list/delete A's team;
   foreign id → 404; A's team intact). **Passes.**
8. `playwright.config.auth.ts` + `scripts/test-e2e-auth.sh` + `test:e2e:auth`
   — boots compose Postgres, applies `prisma migrate deploy`, runs the suites in
   `AUTH_MODE=auth`. The default `test:e2e` stays anonymous/local and ignores
   these specs (19 local e2e remain green).

### Ops
9. `docs/auth.md` — AUTH_MODE (local vs auth; production MUST be auth), `.env`
   (DATABASE_URL, AUTH_SECRET, AUTH_TRUST_HOST), starting Postgres, `prisma
   migrate deploy`, the legacy migration, `test:e2e:auth`, Arcane deploy notes.
   Linked from README. `.env.example` now documents `AUTH_MODE`.

## PR3 TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 3.1 migration pure fn | `features/migration/migrateLocalTeams.test.ts` | Unit | ✅ 490/490 | ✅ Written | ✅ Passed | ✅ 5 cases | ✅ Clean |
| 3.2 hook + re-hydrate | `useTeamMigration.test.tsx`, `AppProvider.test.tsx`, `SessionAppProvider.test.tsx` | Unit/Integration | ✅ 509/509 | ✅ Written | ✅ Passed | ✅ 3 + 2 + 2 cases | ✅ Clean |
| JWT user id propagation | `auth.config.test.ts` | Unit | ✅ 501/501 | ✅ Written | ✅ Passed | ✅ 3 cases | ✅ Clean |
| normalizeEmail | `lib/email.test.ts` | Unit | ✅ 509/509 | ✅ Written | ✅ Passed | ✅ 3 cases | ✅ Clean |
| 3.3 auth e2e | `e2e/auth.spec.ts` | E2E | ✅ 19/19 local | ✅ Spec first | ✅ 3/3 auth suite | ✅ full journey | ✅ Clean |
| 3.4 migration e2e | `e2e/migration.spec.ts` | E2E | ✅ 19/19 local | ✅ Spec first | ✅ 1/1 | ✅ idempotent re-login | ✅ Clean |
| 3.5 isolation e2e | `e2e/isolation.spec.ts` | E2E | ✅ 19/19 local | ✅ Spec first | ✅ 1/1 | ✅ foreign 404 | ✅ Clean |
| 3.6 ops docs | `docs/auth.md`, `.env.example`, README | Docs | ✅ 512/512 | N/A (docs) | — | — | — |

### PR3 Work Unit Evidence

#### Unit: Migration hook + re-hydration (tasks 3.1, 3.2)
| Evidence | Required value |
|---|---|
| Focused test command | `pnpm vitest run features/migration/migrateLocalTeams.test.ts features/migration/useTeamMigration.test.tsx app/providers/SessionAppProvider.test.tsx app/providers/AppProvider.test.tsx` → 20 passed |
| Runtime harness | `pnpm run test:e2e:auth` → `e2e/migration.spec.ts` passes: seeded `bb_teams_v1` teams appear after login, flag `bb_teams_migrated_v1` set, no duplicates on re-login |
| Rollback boundary | Revert `features/migration/*`, SessionAppProvider/AppProvider/AppShell `reloadVersion` wiring; the API/local stores and existing e2e unaffected |

#### Unit: Auth wiring fixes (surfaced by real-DB e2e)
| Evidence | Required value |
|---|---|
| Focused test command | `pnpm vitest run auth.config.test.ts lib/email.test.ts` → 11 passed |
| Runtime harness | `pnpm run test:e2e:auth` → all 3 suites pass: session carries `user.id`, `/api/teams` returns 200 lists / 201 creates, mixed-case email login matches the lowercased stored user |
| Rollback boundary | Revert `auth.config.ts` jwt/session callbacks + `auth.ts`/`signup` normalizeEmail + `lib/email.*`; session would lack user id (scoped API breaks) — keep so the PR3 e2e passes |

#### Unit: Real-DB auth e2e (tasks 3.3–3.5)
| Evidence | Required value |
|---|---|
| Focused test command | `pnpm run test:e2e:auth` → **3 passed** (auth, migration, isolation) |
| Runtime harness | Playwright drives `next dev` in `AUTH_MODE=auth` against compose Postgres; signup/login/create/logout + localStorage migration + two-user isolation exercised end-to-end |
| Rollback boundary | Revert `e2e/auth|migration|isolation.spec.ts`, `playwright.config.auth.ts`, `scripts/test-e2e-auth.sh`, `test:e2e:auth`; default `test:e2e` + unit suite intact |

#### Unit: Ops docs (task 3.6)
| Evidence | Required value |
|---|---|
| Focused test command | `pnpm lint`, `npx tsc --noEmit`, `pnpm test` (512) all green after docs |
| Runtime harness | `pnpm run test:e2e:auth` (documented) — verified working; `docker compose up -d postgres` documented |
| Rollback boundary | Revert `docs/auth.md`, README link, `.env.example` AUTH_MODE |

## PR3 Verification Results (on `feat/auth-backend-pr3`)

- `pnpm test` → **35 files, 512 tests passed** (490 baseline + 22 new).
- `pnpm lint` → clean (0 errors, 0 warnings).
- `npx tsc --noEmit` → 0 errors.
- `pnpm next build` → compile + types + static pages + `ƒ Proxy (Middleware)` pass.
- `pnpm run test:e2e:auth` (real Postgres, AUTH_MODE=auth) → **3 passed**.
- `pnpm run test:e2e` (AUTH_MODE=local) → **19/19 passed** (auth/migration/isolation correctly excluded from the default config).

## Deviations from Design (PR3)

1. **Migration hook lives in `SessionAppProvider`, not `AppProvider`.** PR2 moved
   session-driven concerns into `SessionAppProvider` (AppProvider became
   store-agnostic). The migration must run where the session becomes
   `authenticated`, so it is wired there, with `onMigrated` → `reloadVersion`
   re-hydrating AppProvider's list. This honors the design's intent ("run on
   first auth, non-blocking") at the correct architectural seam.
2. **`session.user.id` was missing (PR2 latent bug), fixed in PR3.** NextAuth v5
   JWT mode drops `user.id` unless a `jwt`/`session` callback copies it; the
   scoped `/api/teams` always saw `session.user.id == null` → 401. Added the
   callbacks. The original PR2 unit tests mocked `auth()` with `user.id`, hiding
   this — the real-DB e2e surfaced it. This is a required auth-wiring correction,
   not scope creep.
3. **Mixed-case email login failed (PR2 latent bug), fixed in PR3.** Signup
   lowercased emails but authorize compared the raw case, so a capital-letter
   signup (e.g. isolation's `userA-...`) could sign up but never log in. Added
   `lib/email normalizeEmail` used by both signup and authorize.
4. **Playwright auth config is a separate `playwright.config.auth.ts`**, selected
   by the new `test:e2e:auth` script, rather than folding auth suites into the
   default config. This keeps the default `test:e2e` anonymous (`local`) and the
   19 existing e2e green, per the PR3 task.

## Issues Found (PR3)

- The two authentication bugs above (missing user id; email-case mismatch) were
  latent and only surfaced once the app was driven for real in `AUTH_MODE=auth`
  against Postgres. Both are fixed and unit + e2e covered.
- `playwright-report-auth/` is a generated artifact; added to `.gitignore`.

## Remaining Tasks (after PR3)

- [ ] 4.1 `pnpm test` + `pnpm run test:e2e` green across all PRs (verify phase).
- [ ] 4.2 Rollback: each PR revertible; localStorage copy kept.
