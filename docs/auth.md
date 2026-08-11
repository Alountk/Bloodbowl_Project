# Authentication & Database Ops

This document covers how accounts (email + password), PostgreSQL persistence,
and the legacy localStorage migration work, and how to run/deploy each part.

## Auth modes

The app runs in one of two modes, selected by `AUTH_MODE`:

| Mode | `AUTH_MODE` | Behavior |
|------|-------------|----------|
| Anonymous (default) | `local` | Route protection OFF; teams stored in `localStorage`. Used by the default unit/e2e suites. |
| Accounts + DB | `auth` | Route protection ON; teams persisted in PostgreSQL per user. **Production MUST set `auth`.** |

- `local` keeps the pre-account behavior so existing tests and anonymous
  browsing work unchanged.
- `auth` enables the Auth.js proxy gate and the user-scoped `/api/teams` API.
- Never ship `AUTH_MODE=local` to a real production host that is expected to
  protect user data.

## Environment variables

Copy `.env.example` to your own `.env` and fill in real values. All of these
are read at runtime (never committed):

| Variable | Example | Required for |
|----------|---------|--------------|
| `DATABASE_URL` | `postgresql://bloodbowl:bloodbowl@localhost:5432/bloodbowl?schema=public` | Prisma runtime + migrations |
| `AUTH_SECRET` | value of `openssl rand -base64 32` | Signing Auth.js session cookies |
| `AUTH_TRUST_HOST` | `true` (dev/LAN) / `false` behind HTTPS | Auth.js over plain HTTP on a LAN host |
| `AUTH_MODE` | `local` (dev) / `auth` (prod) | Route protection + store selection |

> Keep `.env` gitignored. `AUTH_SECRET` in production must be a long random
> string, kept secret, and stable across restarts (rotating it logs everyone out).

## Starting PostgreSQL

Postgres runs via Docker Compose (see `docker-compose.yml`):

```bash
docker compose up -d postgres
# wait for the healthcheck to pass, then verify:
docker compose exec postgres pg_isready -U bloodbowl -d bloodbowl
```

The compose service publishes `localhost:5432` with user/password/db
`bloodbowl` by default (override with `POSTGRES_USER` / `POSTGRES_PASSWORD` /
`POSTGRES_DB`).

## Applying migrations (Prisma)

`DATABASE_URL` must point at the target Postgres before running migrations.

```bash
pnpm prisma migrate deploy   # applies pending migrations (production-safe)
# or, during active development:
pnpm prisma migrate dev      # creates/checks a dev migration against a local DB
```

- `pnpm db:generate` regenerates the Prisma client (`prisma generate`).
- `pnpm db:migrate` runs `prisma migrate deploy` (the CI/deploy entrypoint).
- The Docker image already runs `prisma migrate deploy` before starting the
  server (`docker-entrypoint.sh`), so a fresh PG volume gets the schema.

## Legacy localStorage migration

When `AUTH_MODE=auth` and a browser logs in for the first time, the client
reads `bb_teams_v1` from `localStorage` and POSTs each team into the account
via `/api/teams`, then sets `bb_teams_migrated_v1`.

- It runs **once per browser** (idempotent, flag-gated).
- It **never clears** `bb_teams_v1` (the rollback copy is retained).
- On a partial failure it logs a non-blocking warning and leaves the flag unset,
  so the next login retries.
- After a successful migration the team list re-hydrates automatically.

## Running the auth end-to-end suite

The existing anonymous `test:e2e` stays green in `AUTH_MODE=local`. The
real-DB auth suites (`auth`, `migration`, `isolation`) require Postgres and run
in `AUTH_MODE=auth` via a dedicated script that starts Postgres, applies
migrations, and boots the app:

```bash
pnpm run test:e2e:auth
```

This runs `scripts/test-e2e-auth.sh`, which:

1. `docker compose up -d postgres` and waits for it to accept connections;
2. boots `next dev` with `AUTH_MODE=auth`, `DATABASE_URL`, `AUTH_SECRET`,
   `AUTH_TRUST_HOST=true` (via `playwright.config.auth.ts`);
3. runs the `auth`/`migration`/`isolation` Playwright suites against a real
   Postgres.

The default `pnpm run test:e2e` is unchanged and stays anonymous (`local`).

## Deployment (Arcane)

- Ensure Arcane deploys the **postgres** service and wires `DATABASE_URL`,
  `AUTH_SECRET`, and `AUTH_TRUST_HOST` into the `web` service (see
  `docker-compose.yml`). Without Postgres the auth signup/login/team APIs will
  not work.
- Ensure the container entrypoint runs `prisma migrate deploy` before the server
  accepts traffic (already in `docker-entrypoint.sh`); for an existing database,
  run `pnpm prisma migrate deploy` against it during the rollout.
- Set `AUTH_MODE=auth` in production and do **not** ship `local`.
- Confirm the runner/entrypoint runs migrations — either the image entrypoint or
  an explicit deploy-invoked `pnpm prisma migrate deploy` (see the Open Question
  in `design.md`).

### Deploy automation (webhook → Arcane)

- A GitHub repo webhook (`web`) points at
  `https://arcane.androemda-surf.uk/api/webhooks/trigger/arc_wh_...` and fires
  on every push to `main`. The Arcane trigger must run
  `docker compose pull web && docker compose up -d --force-recreate web`.
- The `pull` step is **mandatory**: `up -d` alone can reuse a locally cached
  image, so a freshly published `latest` is missed until a manual pull. This
  caused a stale-image bug (old slug error kept running after the fix merged).
- Image tags published by `.github/workflows/docker-publish.yml`:
  `latest` (mutable, used by Arcane), `<YYYY.MM.DD>-<run number>`
  (e.g. `2026.08.11-3`, monotonic and human-readable), and `<git sha>`
  (exact traceability). To pin Arcane to a specific version instead of
  `latest`, reference `ghcr.io/alountk/bloodbowl_project:<YYYY.MM.DD>-<n>`
  in `docker-compose.yml`.
- If a "fixed" bug still reproduces in production, first check the running
  image is current: `docker compose pull web && docker compose up -d --force-recreate web`.
