# Apply Progress: auth-backend — PR 1 (DB Foundation)

- **Date**: 2026-08-08
- **Phase**: sdd-apply — PR1 only (chained stacked-to-main)
- **Mode**: Strict TDD (test runner: `pnpm test` / `vitest run`)
- **Delivery**: stacked PR #1 → base = `main`; branch = `feat/auth-backend-pr1`

## Scope Delivered (PR1)

DB foundation only. No auth, no API routes, no store swap (all deferred to PR2).

1. `prisma/schema.prisma` — datasource postgresql, `prisma-client-js` generator with `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]`; `User` (id cuid PK, email @unique, passwordHash, name?, createdAt) and `Team` (id cuid PK, userId FK→User ON DELETE CASCADE, name, raceId, leagueType, roster Json, coaching Json, createdAt, @@index([userId])).
2. `prisma/migrations/20260808132125_init/migration.sql` — created and applied against a throwaway `postgres:16-alpine`; verified tables + cascade.
3. `docker-compose.yml` — added `postgres` service (`postgres:16-alpine`, POSTGRES_USER/PASSWORD/DB, volume, healthcheck, port 5432) and wired `DATABASE_URL`/`AUTH_SECRET`/`AUTH_TRUST_HOST` into the `web` service.
4. `lib/prisma.ts` — PrismaClient singleton (globalThis-cached for dev hot-reload).
5. `Dockerfile` — `prisma generate` in deps+build stages; `prisma migrate deploy` in `docker-entrypoint.sh` before `node server.js`.
6. `.env.example` — `DATABASE_URL`, `AUTH_SECRET`, `AUTH_TRUST_HOST=true`; no real secrets.
7. `package.json` — pinned `@prisma/client` + `bcryptjs` (deps), `prisma` (devDeps), scripts `db:generate`/`db:migrate`.

## TDD Cycle Evidence

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

Notes:
- Task 1.1/1.2/1.7 share one RED→GREEN for the singleton+schema: `lib/prisma.test.ts` was written first (referencing `./prisma` and the `User`/`Team` delegates that did not exist), then schema + singleton + client generation made it pass, then triangulated across three cases (lifecycle `$connect/$disconnect`, model delegates, singleton reuse).
- Class-identity assertion (`toBeInstanceOf(PrismaClient)`) blew the Prisma proxy stack ("Maximum call stack size exceeded"); fixed the test to assert the observable lifecycle/method contract instead of internal class identity.
- Config tasks (compose/.env.example) are structural; no RED test applies (triangulation skipped — config, one possible output).
- Migration exercise: `prisma migrate dev --name init` applied live; then `INSERT User + Team; DELETE User` proved ON DELETE CASCADE (1 team → 0 after user delete). That is a real runtime harness, not a trivial assertion.

## Work Unit Evidence

### Unit: Prisma schema + singleton + RED test (tasks 1.1, 1.2, 1.7)
| Evidence | Required value |
|---|---|
| Focused test command and exact result | `pnpm vitest run lib/prisma.test.ts` → 3 passed (1 file) |
| Runtime harness command/scenario and exact result | `DATABASE_URL=... prisma migrate dev --name init` applied; then `docker exec bb-migrate-pg psql ...` INSERT user+team, DELETE user → team count 1→0 (cascade verified) |
| Rollback boundary | Remove `prisma/`, `lib/prisma.ts`, `lib/prisma.test.ts`; app compose unaffected (no runtime import yet) |

### Unit: Migration (task 1.3)
| Evidence | Required value |
|---|---|
| Focused test command and exact result | migration SQL reviewed line-by-line (33 lines: 2 CREATE TABLE, unique email index, Team_userId_idx, cascade FK) |
| Runtime harness command/scenario and exact result | applied against postgres:16-alpine; `\dt` shows User/Team/_prisma_migrations; cascade works |
| Rollback boundary | Drop `prisma/migrations/`; no runtime code depends on it yet |

### Unit: Docker + entrypoint (task 1.6)
| Evidence | Required value |
|---|---|
| Focused test command and exact result | `docker build -t bloodbowl-web:pr1-test .` → ✅ image built (deps+build+runner stages all passed) |
| Runtime harness command/scenario and exact result | `docker run` with `DATABASE_URL=...postgres:55432` → entrypoint ran `prisma migrate deploy` ("1 migration found"), then Next.js `✓ Ready`; `curl localhost:3444/` → **HTTP 200**. Full container boot validated. |
| Rollback boundary | Revert Dockerfile + docker-entrypoint.sh; keep prisma/ intact |

## Verification Results (host, PR1 branch)

- `pnpm test` → **22 files, 449 tests passed** (baseline 446 + 3 new; all existing green).
- `pnpm lint` → clean.
- `npx tsc --noEmit` → 0 errors.
- Migration applied live to throwaway postgres; cascade verified.
- **Docker image built and container boot verified end-to-end** (migrate deploy → server 200). Test container/image cleaned up after.

Verified locally: all PR1 deliverables, including the full Docker build and entrypoint runtime. Deferred: none for runtime; PR3 ops README will document Arcane deployment.

## Deviations from Design

1. **Prisma 7 → Prisma 6.19.3.** `pnpm add` installed Prisma 7.9.1, whose schema format breaks the design's classic `url = env("DATABASE_URL")` + `new PrismaClient()` (Prisma 7 requires a driver adapter + `prisma.config.ts`). To honor the design and keep the alpine `binaryTargets` story simple, pinned `prisma` + `@prisma/client` to `^6.19.3`, which matches the design exactly. Also, Prisma 7's CLI preinstall asserts Node 22.12+/24+; the host runs Node 23 (unsupported), so the CLI only runs inside `node:22-alpine` / CI. Prisma 6 lifted that friction for the host too. Note: leftover `prisma@7` + `@prisma/client@7` store dirs may linger in `node_modules/.pnpm` after install; harmless (unlinked).
2. **Runner copies Prisma pieces explicitly.** Because no app code imports Prisma yet in PR1, Next's standalone trace does NOT bundle `@prisma/client`. The Docker runner therefore copies `prisma/`, `node_modules/prisma`, `@prisma`, `.prisma`, `.bin`, `.pnpm` from build so `prisma migrate deploy` (and the future PrismaClient) resolve. Acceptable image-size cost for correctness.
3. **`AUTH_TRUST_HOST` wired into compose `web` env** even though auth is PR2 — kept per design (task 1.4 lists DATABASE_URL env; proposal lists AUTH_TRUST_HOST). Harmless; documents the future requirement.

## Issues Found

- PrismaClient `instanceof` check overflows the proxy stack under the Vitest jsdom environment — assertion mechanism, not a product bug; replaced with lifecycle/method assertions.
- Host Node 23 is outside Prisma 7's supported range; pinned to Prisma 6 which supports it.
- pnpm Doker runner: generated client lives at `.pnpm/@prisma+client@*/node_modules/.prisma/client`, not a top-level `node_modules/.prisma`; Dockerfile handles it by copying `.pnpm` + symlink dirs. Resolved and build-verified.

## Remaining Tasks (after PR1)

- [ ] 2.1–2.11 (PR2 auth + persistence)
- [ ] 3.1–3.6 (PR3 migration + e2e + ops)
