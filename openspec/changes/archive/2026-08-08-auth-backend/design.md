# Design: Auth Backend — accounts, PostgreSQL persistence, localStorage migration

## Technical Approach

Add Auth.js v5 (Credentials, JWT) + Prisma/PostgreSQL user-scoped persistence. Keep the `TeamStore` interface (list/save/remove) so the 446 unit tests survive; swap store implementation in `AppProvider`/`AppShell` by session status. New `ApiTeamStore` calls session-checked `/api/teams`. A one-time per-browser migration imports `bb_teams_v1` on first login. `proxy.ts` (Next 16, not middleware) gates all routes. Maps to `user-auth` + `team-persistence` new, `app-shell`/`team-list`/`create-team` modified.

## Architecture Decisions

| Decision | Tradeoff | Choice |
|---|---|---|
| Credentials + `strategy:"jwt"` | No Account/Session tables; cookie | JWT — least DB |
| `proxy.ts` = `export { auth as proxy }` | Next 16 renamed middleware.ts | excl. `/login`,`/signup`,`/api/auth` |
| bcryptjs | Native bcrypt breaks alpine | bcryptjs (pure JS) |
| Prisma + Postgres | New DB dependency | generate in build; migrate deploy in entrypoint |
| `ApiTeamStore` implements `TeamStore` | Server vs local | Swap in AppProvider; Local/InMemory kept for tests |
| SessionProvider + `useSession` | Client auth state | Wrap shell children; gate on status |
| `.env.example` AUTH_TRUST_HOST=true | LAN http | Document; keep secure in prod |

## Data Flow

```
 Login/Signup ─POST credentials─▶ auth.ts (Credentials) ─bcryptjs verify─▶ JWT cookie
 AppShell ─SessionProvider/useSession─▶ status=authenticated
   AppProvider ─list/save/remove─▶ /api/teams ─auth() userId─▶ Prisma ─▶ Postgres
   migration: bb_teams_v1 ─POST each─▶ /api/teams  (once/browser)
 any route ─proxy.ts─▶ no session? ─▶ redirect /login
```

## File Changes

| File | Action | Description |
|---|---|---|
| `prisma/schema.prisma` | Create | User (id, email unique, passwordHash, name?, createdAt), Team (id, userId FK, name, raceId, leagueType, roster Json, coaching Json, createdAt); User cascade Teams |
| `lib/prisma.ts` | Create | PrismaClient singleton (avoid dev hot-reload dup) |
| `auth.config.ts` / `auth.ts` | Create | Edge-safe config; Node `NextAuth` + bcryptjs Credentials |
| `proxy.ts` (root) | Create | `export { auth as proxy }`, matcher excl. login/signup/api/auth |
| `app/api/auth/[...nextauth]/route.ts` | Create | `{ handlers: { GET, POST } }` |
| `app/api/teams/route.ts`, `app/api/teams/[id]/route.ts` | Create | GET list + POST create; DELETE scoped, 401/404 |
| `features/teams/store/ApiTeamStore.ts` | Create | `TeamStore` impl via fetch; idempotent remove; throws on failure |
| `app/providers/AppProvider.tsx` | Modify | Choose Api vs Local store by session; run migration once |
| `components/AppShell.tsx`, `components/Topbar.tsx` | Modify | SessionProvider, unauth redirect, logout |
| `app/login`, `app/signup` | Create | Rulebook-light forms; open registration |
| `docker-compose.yml`, `Dockerfile`, `.env.example` | Modify/Create | Postgres service; generate/migrate; secrets |
| `ApiTeamStore.test.ts` + e2e `auth.spec.ts`, `migration.spec.ts` | Create | Mocked fetch; signup/migration flows |

## Interfaces / Contracts

```ts
interface TeamStore { list(): Promise<Team[]>; save(t: Team): Promise<Team>; remove(id: string): Promise<void>; }
model User { id String @id @default(cuid()); email String @unique; passwordHash String; name String?; teams Team[] }
model Team { id String @id @default(cuid()); userId String; user User @relation(fields:[userId], references:[id], onDelete:Cascade); name String; raceId String; leagueType String; roster Json; coaching Json; createdAt DateTime @default(now()) }
// proxy.ts  export { auth as proxy };
// config matcher: ["/((?!login|signup|api/auth|_next|.*\\..*).*)"]
```

## Migration / Rollout

Client migration on first auth per browser: read `bb_teams_v1`, POST each into `/api/teams`, set `bb_teams_migrated_v1`, never clear `bb_teams_v1`; idempotent (flag-gated), partial-failure surfaced for retry. DB migration via Prisma `migrate deploy` in Docker entrypoint (documented ops). Supports chained 3-PR rollout (PR1 DB, PR2 auth+persistence, PR3 migration+e2e).

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit | ApiTeamStore list/save/remove, 401/404/5xx | Vitest, mocked `fetch` |
| Unit | proxy matcher, auth callbacks, bcrypt verify | Vitest pure logic |
| Unit | AppProvider session swap + migration hook | Mocked session + localStorage |
| E2E | signup→create→reload→logout→login | Playwright vs real Postgres |
| E2E | migration seeded localStorage, runs once; foreign 404 | Playwright |

## Threat Matrix

Change touches HTTP route protection, but matrix rows cover VCS/PR/executable boundaries, not HTTP routing.

| Boundary | Applicability | RED tests |
|---|---|---|
| Documentation-like paths | N/A — no executable doc execution | — |
| Git repository selection | N/A — no `git -C`/subprocess authority | — |
| Commit state | N/A — no git index automation | — |
| Push state | N/A — no push/ref automation | — |
| PR commands | N/A — docker-publish workflow untouched | — |

No applicable adversarial cases. Routing guard covered by spec scenarios (unauth redirect, auth-page redirect) via Playwright.

## Open Questions

- [ ] Confirm Arcane deploys new postgres service + env before auth ships.
- [ ] Confirm runner runs `prisma migrate deploy` in entrypoint vs documented ops invocation.
