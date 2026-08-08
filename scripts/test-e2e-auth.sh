#!/usr/bin/env bash
# Real-DB auth E2E runner.
#
# Starts the compose Postgres, waits for it to accept connections, then runs the
# auth/migration/isolation Playwright suites in AUTH_MODE=auth against a real
# Postgres. The app webServer (playwright.config.auth.ts) applies `prisma migrate
# deploy` then boots `next dev` with the DB env.
#
# Usage: pnpm run test:e2e:auth
set -euo pipefail

docker compose up -d postgres

echo "Waiting for Postgres on localhost:5432 ..."
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U bloodbowl -d bloodbowl >/dev/null 2>&1; then
    echo "Postgres is ready."
    break
  fi
  sleep 1
  if [ "$i" -eq 30 ]; then
    echo "Timed out waiting for Postgres." >&2
    docker compose logs --tail 30 postgres >&2
    exit 1
  fi
done

pnpm exec playwright test --config playwright.config.auth.ts
