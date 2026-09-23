# Proposal: security-hardening

## Intent

A security audit found strong ownership scoping/RBAC/upload hygiene, but four P0 gaps (no rate limiting on auth, no security headers, `/api` excluded from the proxy gate, Postgres published with default credentials) plus P1/P2 auth hygiene gaps (no password max length, password change does not invalidate live JWTs, empty `AUTH_SECRET` allowed in prod, host-header trust hardcoded on, email enumeration timing, unbounded name/roster payloads).

## Scope

### In Scope
- Slice A: response security headers (`next.config.ts`), compose infra hardening (Postgres bind, required `AUTH_SECRET`, env-driven `AUTH_TRUST_HOST`), production fail-fast in `instrumentation.ts`.
- Slice B: in-memory sliding-window rate limiting on signup, Credentials `authorize`, and change-password.
- Slice C: password max length, `User.passwordChangedAt` + JWT invalidation on password change, login timing equalization, name length caps.
- Slice D: proxy matcher covers `/api/*` (allowlist `api/auth`, `api/watch`, `api/logout`); unauthenticated API hits return 401 JSON, never a `/login` redirect.
- Slice E: deep validation of `roster` entries and payload size caps on team create/hire.

### Out of Scope
- Email verification, password-reset flow (roadmap).
- Redis/Upstash rate limiter (single Docker instance → in-memory).
- Changing the Postgres default password (would break existing volumes); only bind to `127.0.0.1` + document.
- CSRF tokens (mitigated by `SameSite=Lax` + JSON content-type; logout already checks `Sec-Fetch-Site`).
- Rotating `role` claims or reworking RBAC.

## Capabilities

### Modified Capabilities
- `user-auth`: rate limits, password max, session invalidation on password change, login timing.
- `app-shell` / proxy gate: `/api/*` gated with 401 JSON responses.
- `create-team` / `team-persistence`: roster/name payload validation.
- Infra (compose/headers): not a named capability — ops hardening only.

### New Capabilities
- None (hardening of existing capabilities).

## Approach

- **Headers**: `next.config.ts` `headers()` with `nosniff`, `frame-ancestors`/`X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, HSTS when `APP_URL` is https, CSP env-gated by `CSP=off` escape hatch (Next 16/Storybook risk).
- **Compose**: `127.0.0.1:${POSTGRES_PORT:-5433}:5432`; `AUTH_SECRET: ${AUTH_SECRET:?}`; `AUTH_TRUST_HOST: ${AUTH_TRUST_HOST:-true}` (default kept for LAN deploy). `instrumentation.ts` throws in production when `AUTH_MODE=auth` and `AUTH_SECRET` is missing.
- **Rate limit**: pure `lib/rateLimit.ts` sliding window (injectable `now`); signup 5/h per IP, `authorize` 10/15min per normalized email (before bcrypt), change-password 10/h per userId; 429 + `Retry-After`.
- **Session invalidation**: add nullable `User.passwordChangedAt`; set it in `PATCH /api/me/password`; `jwt` callback rejects tokens whose `iat` predates it (one PK lookup per session request — accepted at this scale).
- **Timing**: `authorize` runs a dummy `bcrypt.compare` against a fixed hash when the user row is missing.
- **API gate**: `proxy.ts` matcher allowlists only `api/auth|api/watch|api/logout`; `resolveAuthGate` gains an API path result → 401 JSON from the `authorized` callback.
- **Payloads**: team `name`/player names ≤ 50; `roster` entries schema-checked (id ≤ 64, name ≤ 50, `positionalKey` string) + `JSON.stringify(roster)` ≤ 50 KB.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `next.config.ts`, `docker-compose.yml`, `instrumentation.ts` | Modified | Headers, compose secrets/bind, fail-fast |
| `lib/rateLimit.ts` (new) | New | Sliding-window limiter |
| `auth.ts`, `app/api/auth/signup/route.ts`, `app/api/me/password/route.ts` | Modified | Rate limit wiring |
| `lib/password.ts` | Modified | `MAX_PASSWORD_LENGTH` + combined rule |
| `prisma/schema.prisma` + migration | Modified | `User.passwordChangedAt` |
| `auth.config.ts` | Modified | JWT invalidation |
| `proxy.ts`, `lib/auth-mode.ts` | Modified | `/api` gate + 401 JSON |
| `app/api/teams/route.ts`, `app/api/teams/[id]/players/route.ts` | Modified | Name/roster validation |
| Tests across the above | Modified/Added | Unit + route coverage |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| CSP breaks Next 16/Storybook/e2e (zero-console-error suite) | Med | `CSP=off` escape hatch; ship non-CSP headers first |
| `AUTH_SECRET: :?` breaks a deploy without the secret | Low | Intentional fail-fast; docs + instrumentation throw |
| `passwordChangedAt` lookup per session request | Low | Single-column PK select; acceptable at this scale |
| Rate limit trips e2e auth suite | Low | Key by email; e2e uses distinct users; limits generous |
| Proxy 401 breaks an intentionally public API route | Low | Explicit allowlist: `api/auth`, `api/watch`, `api/logout` |

## Rollback Plan

Revert the chained PRs in reverse order (E→D→C→B→A). The `passwordChangedAt` migration is additive and nullable — no data migration to reverse. Header/compose changes are config-only.

## Dependencies

- None beyond existing `next`, `bcryptjs`, Prisma.

## Success Criteria

- [ ] Unauthenticated `GET /api/teams` → 401 JSON (not a login redirect) when `AUTH_MODE=auth`.
- [ ] Signup/login/change-password return 429 after the configured burst.
- [ ] Password change invalidates existing session cookies (old JWT → 401).
- [ ] Response headers present (`nosniff`, `frame-ancestors`, …) on every route.
- [ ] Postgres port binds only to `127.0.0.1`; compose fails fast without `AUTH_SECRET`.
- [ ] `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, local e2e green.

## Forecast (400-line budget)

| Slice | Content |
|-------|---------|
| A | `next.config.ts` headers + compose hardening + `instrumentation.ts` fail-fast |
| B | `lib/rateLimit.ts` + wiring (signup/authorize/password) + tests |
| C | password max + `passwordChangedAt` migration + JWT invalidation + timing + name caps |
| D | `proxy.ts` matcher + `resolveAuthGate` API 401 + tests |
| E | roster deep validation + size caps + tests |

5 chained PRs (<400 each), stacked-to-main.