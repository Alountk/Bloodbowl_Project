# Tasks: security-hardening

Delivery strategy: `auto-chain` — 5 stacked PRs to main, one slice each, < 400 authored lines.

## Slice A — headers + infra (branch `security/hardening-slice-a`)

- [x] A1 `next.config.ts`: add `async headers()` — `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS (when `APP_URL` is https), CSP (env-gated via `CSP=off`).
- [x] A2 `docker-compose.yml`: bind Postgres to `127.0.0.1`; require `AUTH_SECRET` (`:?`); make `AUTH_TRUST_HOST` env-driven (default `true`).
- [x] A3 `instrumentation.ts`: throw in production when `AUTH_MODE=auth` without `AUTH_SECRET` (promote the existing warning).
- [x] A4 Focused verification: `pnpm lint`, `npx tsc --noEmit`, `pnpm test` — 2843/2843 green.

## Slice B — rate limiting (branch `security/hardening-slice-b`)

- [ ] B1 `lib/rateLimit.ts`: sliding-window limiter, injectable `now`, unit tests.
- [ ] B2 Wire `POST /api/auth/signup` (5/h per IP) → 429 + `Retry-After`.
- [ ] B3 Wire `authorize` in `auth.ts` (10/15min per normalized email, before `compare`).
- [ ] B4 Wire `PATCH /api/me/password` (10/h per userId).
- [ ] B5 Focused verification: `pnpm test` (limit + route tests).

## Slice C — auth hygiene (branch `security/hardening-slice-c`)

- [ ] C1 `lib/password.ts`: `MAX_PASSWORD_LENGTH = 128`; combined accept rule; update call sites + `lib/password.test.ts`.
- [ ] C2 Prisma: add nullable `User.passwordChangedAt`; additive migration; `pnpm db:generate`.
- [ ] C3 `PATCH /api/me/password`: set `passwordChangedAt` on success.
- [ ] C4 `auth.config.ts` `jwt` callback: reject tokens whose `iat` predates `passwordChangedAt`.
- [ ] C5 `authorize`: dummy `compare` when the user is missing (timing equalization).
- [ ] C6 Name caps: signup `name` ≤ 50, team `name` ≤ 50.
- [ ] C7 Focused verification: `pnpm test` + `npx tsc --noEmit`.

## Slice D — /api proxy gate (branch `security/hardening-slice-d`)

- [ ] D1 `proxy.ts` matcher: allowlist only `api/auth`, `api/watch`, `api/logout`.
- [ ] D2 `lib/auth-mode.ts` + `auth.config.ts`: API paths → 401 JSON, not redirect.
- [ ] D3 Unit tests for the new `resolveAuthGate` API branch.
- [ ] D4 Focused verification: `pnpm test`.

## Slice E — payload validation (branch `security/hardening-slice-e`)

- [ ] E1 Team create: validate roster entries + 50 KB size cap → 400.
- [ ] E2 Player hire: same entry rules where the route rewrites the roster.
- [ ] E3 Unit/route tests for oversized/malformed entries.
- [ ] E4 Focused verification: `pnpm test`.

## Gate (after every slice, and at close)

- [ ] `pnpm test`
- [ ] `pnpm lint`
- [ ] `npx tsc --noEmit`
- [ ] `AUTH_MODE=local pnpm exec playwright test`
- [ ] `pnpm run test:e2e:auth` (Docker + Postgres; slices B/C/D touch auth)