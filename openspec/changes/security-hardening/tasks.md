# Tasks: security-hardening

Delivery strategy: `auto-chain` — 5 stacked PRs to main, one slice each, < 400 authored lines.
**Status: COMPLETE** — PRs #283–#287 merged; issue #282 closed.

## Slice A — headers + infra (branch `feat/security-hardening-slice-a`, PR #283)

- [x] A1 `next.config.ts`: add `async headers()` — `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS (when `APP_URL` is https), CSP (env-gated via `CSP=off`).
- [x] A2 `docker-compose.yml`: bind Postgres to `127.0.0.1`; require `AUTH_SECRET` (`:?`); make `AUTH_TRUST_HOST` env-driven (default `true`).
- [x] A3 `instrumentation.ts`: throw in production when `AUTH_MODE=auth` without `AUTH_SECRET` (promote the existing warning).
- [x] A4 Focused verification: `pnpm lint`, `npx tsc --noEmit`, `pnpm test` — green.

## Slice B — rate limiting (branch `feat/security-hardening-slice-b`, PR #284)

- [x] B1 `lib/rateLimit.ts`: sliding-window limiter, injectable `now`, unit tests.
- [x] B2 Wire `POST /api/auth/signup` (5/h per IP) → 429 + `Retry-After`.
- [x] B3 Wire `authorize` in `auth.ts` (10/15min per normalized email, before `compare`).
- [x] B4 Wire `PATCH /api/me/password` (10/h per userId).
- [x] B5 Focused verification: `pnpm test` (limit + route tests).

## Slice C — auth hygiene (branch `feat/security-hardening-slice-c`, PR #285)

- [x] C1 `lib/password.ts`: `MAX_PASSWORD_LENGTH = 128`; combined accept rule; update call sites + `lib/password.test.ts`.
- [x] C2 Prisma: add **`User.sessionVersion Int @default(0)`** (design evolved from `passwordChangedAt` to a version counter for cheaper JWT compares); additive migration; `pnpm db:generate`.
- [x] C3 `PATCH /api/me/password`: `sessionVersion: { increment: 1 }` on success.
- [x] C4 `auth.ts` `jwt` override: stamp `sv` at sign-in; reject tokens whose `sv` ≠ DB `sessionVersion`.
- [x] C5 `authorize`: dummy `compare` when the user is missing (timing equalization) + reject non-acceptable passwords before bcrypt.
- [x] C6 Name caps: signup `name` ≤ 50, team `name` ≤ 50.
- [x] C7 Focused verification: `pnpm test` + `npx tsc --noEmit`.

## Slice D — /api proxy gate (branch `feat/security-hardening-slice-d`, PR #286)

- [x] D1 `proxy.ts` matcher: allowlist only `api/auth`, `api/watch`, `api/logout`.
- [x] D2 `lib/auth-mode.ts` + `auth.config.ts`: API paths → 401 JSON, not redirect.
- [x] D3 Unit tests for the new `resolveAuthGate` API branch.
- [x] D4 Focused verification: `pnpm test`.

## Slice E — payload validation (branch `feat/security-hardening-slice-e`, PR #287)

- [x] E1 Team create: validate roster entries + 50 KB size cap → 400.
- [x] E2 Player hire: **N/A** — hire constructs `PlayerEntry` server-side (`createId` + `randomPlayerName`); only `positionalKey` comes from the client and is catalog-validated.
- [x] E3 Unit/route tests for oversized/malformed entries.
- [x] E4 Focused verification: `pnpm test`.

## Gate (after every slice, and at close)

- [x] `pnpm test` — green at each slice (final ~2877).
- [x] `pnpm lint` — green.
- [x] `npx tsc --noEmit` — green.
- [x] `AUTH_MODE=local pnpm exec playwright test` — 22 passed (Slice E verification run).
- [ ] `pnpm run test:e2e:auth` — **still pending** (needs Docker + Postgres; run before production deploy of auth-touching slices B/C/D).
