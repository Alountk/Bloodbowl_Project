# Archive Report: security-hardening

## Final state

- **Status:** COMPLETE
- **PRs:** #283 (A headers/compose), #284 (B rate limit), #285 (C auth hygiene), #286 (D /api gate), #287 (E roster payload) — all merged to `main`.
- **Issue:** [#282](https://github.com/Alountk/Bloodbowl_Project/issues/282) closed.
- **Design note:** Slice C shipped `User.sessionVersion Int @default(0)` (version counter) instead of `passwordChangedAt DateTime` — the JWT carries an `sv` snapshot from sign-in and is invalidated when it diverges from the DB.

## Verification at close

| Check | Result |
|-------|--------|
| `pnpm test` | 2877/2877 (200 files) |
| `pnpm lint` | clean |
| `npx tsc --noEmit` | clean |
| `AUTH_MODE=local pnpm exec playwright test` | 22 passed (during Slice E) |
| `pnpm run test:e2e:auth` | see tasks gate note (Docker + Postgres) |

## Capabilities modified

- `user-auth`: rate limits, password 8–128, sessionVersion JWT invalidation, login timing decoy, name caps.
- Proxy gate: `/api/*` → 401 JSON allowlist `api/auth|api/watch|api/logout`.
- `create-team` / `team-persistence`: deep roster entry validation + 50 KB cap; team name ≤ 50.
- Ops: security headers (env-gated CSP), loopback Postgres, required `AUTH_SECRET`, production fail-fast.

## Follow-ups (out of scope)

- Email verification + password reset (roadmap issue exists: #197).
- GitGuardian filepath exclusions in the **dashboard** (`**/*.test.*`) for test fixtures — not a repo change.
- Optional CSP tightening beyond the env-gated baseline.
- Redis/Upstash rate limiter if the app ever runs multi-instance.

## Rollback

Revert the five merge commits in reverse order (E→D→C→B→A). The `sessionVersion` migration is additive and nullable-default-safe; header/compose changes are config-only.
