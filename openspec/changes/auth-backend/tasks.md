# Tasks: Auth Backend

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1400-1700 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 DB → PR2 auth+persistence → PR3 migration+e2e |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Prisma schema, compose postgres, client, Docker migrate | PR 1 | `pnpm test` | `docker compose up -d postgres`; `prisma migrate dev` | Revert DB files; app compose unaffected |
| 2 | Auth wiring, ApiTeamStore, API routes, store swap | PR 2 | `pnpm test`; `pnpm run test:e2e` | `pnpm dev` + local postgres; signup/login | Revert auth/pages/API; Local store fallback survives |
| 3 | Migration hook, e2e suites, ops notes | PR 3 | `pnpm run test:e2e` (auth+migration) | Playwright seeded localStorage vs real DB | Revert hook; localStorage copy retained |

## Phase 1: PR 1 — DB Foundation

- [x] 1.1 Create `prisma/schema.prisma` (User+Team, cascade, Json roster/coaching).
- [x] 1.2 Create `lib/prisma.ts` PrismaClient singleton.
- [x] 1.3 Init migration: `prisma migrate dev --name init`.
- [x] 1.4 Add `postgres` service to `docker-compose.yml` (volume, healthcheck, DATABASE_URL env).
- [x] 1.5 Create `.env.example` (DATABASE_URL, AUTH_SECRET, AUTH_TRUST_HOST).
- [x] 1.6 `Dockerfile`: generate in build; `migrate deploy` entrypoint.
- [x] 1.7 Add `prisma`/`@prisma/client`/`bcryptjs`; RED schema test.
- [x] 1.8 Verify existing 446 unit tests stay green.

## Phase 2: PR 2 — Auth + Persistence

- [x] 2.1 RED: proxy matcher excludes login/signup/api-auth, redirects others to `/login`.
- [x] 2.2 Create `auth.config.ts` (edge-safe, JWT) + `auth.ts` (bcryptjs) + `app/api/auth/[...nextauth]/route.ts`.
- [x] 2.3 Root `proxy.ts` = `export { auth as proxy }`; loggedInRedirect `/`.
- [x] 2.4 RED: `/api/teams` 401 unauth, userId-scoped, foreign id → 404.
- [x] 2.5 Create `app/api/teams/route.ts` (GET/POST) + `app/api/teams/[id]/route.ts` (DELETE).
- [x] 2.6 RED: ApiTeamStore list/save/remove, mocked fetch (401/404/5xx).
- [x] 2.7 Create `features/teams/store/ApiTeamStore.ts` (fetch wrapper, idempotent remove).
- [x] 2.8 Create `app/login` + `app/signup` (rulebook-light, open reg, duplicate-email error).
- [x] 2.9 RED: AppProvider session swap (Api vs Local), interface preserved.
- [x] 2.10 Modify `AppProvider`/`AppShell` (SessionProvider, unauth redirect) + `Topbar` logout.
- [x] 2.11 Wire `CreateTeamForm` submit via ApiTeamStore; API failure keeps form.

## Phase 3: PR 3 — Migration + E2E + Ops

- [x] 3.1 RED: migration reads `bb_teams_v1`, POSTs each, sets flag, keeps it, idempotent.
- [x] 3.2 Migration hook in AppProvider on first auth (non-blocking failure).
- [x] 3.3 `e2e/auth.spec.ts`: signup→create→reload→logout→login.
- [x] 3.4 `e2e/migration.spec.ts`: seeded localStorage → account, once.
- [x] 3.5 Two-user isolation + foreign 404 e2e.
- [x] 3.6 Ops README (Arcane postgres, migrate deploy, AUTH_SECRET, AUTH_TRUST_HOST).

## Phase 4: Verification

- [ ] 4.1 `pnpm test` + `pnpm run test:e2e` green.
- [ ] 4.2 Rollback: each PR revertible; localStorage copy kept.
