# Proposal: Auth Backend — accounts, PostgreSQL persistence, localStorage migration

## Intent

Teams live in localStorage (`bb_teams_v1`): device-bound, single-user, no identity. Add email+password accounts with per-user PostgreSQL storage: teams survive devices, users see only their own.

## Scope

### In Scope
- Auth: open signup, login/logout (Auth.js v5 Credentials, bcrypt, JWT)
- Prisma + PostgreSQL: User, Team models; compose postgres service; `.env.example`
- Per-user Team CRUD via API routes; DB-backed store keeping `TeamStore` interface
- One-time localStorage → DB migration on first login/signup (per browser)
- Route protection (all routes gated); login/signup pages; shell logout

### Out of Scope
- Social providers, password reset, email verification
- Leagues CRUD, sharing, roles
- Server-component refactor (pages stay client-rendered via store)
- Sync UI (offline/conflict)

## Capabilities

### New Capabilities
- `user-auth`: registration, login/logout, session management, route protection
- `team-persistence`: per-user DB storage; localStorage migration

### Modified Capabilities
- `app-shell`: auth gate; logout; unauth → login
- `team-list`: shows only signed-in user's teams
- `create-team`: requires session; persists via DB store

## Approach

Auth.js v5 (`next-auth@beta`): `auth.ts` + `auth.config.ts` (edge-safe split; Prisma is Node-only), `app/api/auth/[...nextauth]/route.ts`, `SessionProvider` in shell, `proxy.ts` = `export { auth as proxy }` (Next 16 replaces `middleware.ts`; matcher excludes `/login`, `/signup`, `/api/auth`).

Schema: User + Team only — Credentials forces `strategy: "jwt"`; Account/Session tables unnecessary.

`ApiTeamStore` implements the `TeamStore` interface via session-checked, user-scoped `/api/teams` routes; AppProvider swaps it in when authenticated. InMemory/LocalStorage stores stay for tests. Migration on login: POST localStorage teams, mark `bb_teams_migrated_v1`, keep localStorage copy (rollback).

Docker: `prisma generate` in build; `prisma migrate deploy` in entrypoint; bcryptjs (alpine-safe).

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `prisma/schema.prisma` | New | User, Team models |
| `auth.ts`, `auth.config.ts`, `proxy.ts`, `app/api/auth/[...nextauth]/route.ts` | New | Auth.js + gate |
| `app/api/teams/route.ts`, `app/api/teams/[id]/route.ts` | New | User-scoped CRUD |
| `features/teams/store/ApiTeamStore.ts` | New | DB-backed store |
| `app/providers/AppProvider.tsx` | Modified | Session-aware store + migration |
| `app/login`, `app/signup` | New | Auth pages |
| `components/AppShell.tsx`, `components/Topbar.tsx` | Modified | Logout, auth gate |
| `docker-compose.yml`, `Dockerfile`, `.env.example`, workflow | Modified | Postgres, migrate, secrets |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Next 16 renamed middleware → proxy.ts | Med | Auth.js v5 documents `auth as proxy`; verified |
| Credentials forces JWT sessions | Med | Set `strategy: "jwt"`; skip Account/Session tables |
| bcrypt native build in alpine | Med | bcryptjs (pure JS) |
| prisma generate/migrate in standalone image | Med | Generate in build; deploy in entrypoint with DATABASE_URL |
| 446 unit + 19 e2e break | Med | Keep LocalStorage/InMemory stores; e2e gains auth setup |
| Session cookie on LAN IP over HTTP | Low | Auth.js auto-detects https; verify before release |

## Rollback Plan

Revert GHCR image (per-sha tags). DB data orphaned but harmless; localStorage copy retained after migration (never cleared), so pre-auth image shows teams again. Keep `LocalStorageTeamStore` behind a fallback flag.

## Dependencies

- `next-auth@beta`, `prisma`, `@prisma/client`, `bcryptjs`; postgres container
- Ops: Arcane runs compose with postgres and passes DATABASE_URL/AUTH_SECRET

## Success Criteria

- [ ] Signup → create team → reload → team persists → logout → login → team present
- [ ] Two users: each sees only own teams; foreign `/teams/[id]` → not found
- [ ] Migration e2e: seeded localStorage teams appear in account; runs once
- [ ] 446 unit + 19 e2e green (updated for auth)
