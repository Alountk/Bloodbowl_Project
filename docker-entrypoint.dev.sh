#!/bin/sh
# Dev entrypoint: generates the Prisma client, applies pending migrations and
# starts `next dev` (Turbopack). Bind-mounted from the host (docker-compose.dev.yml).
set -e
echo "[dev] generating Prisma client..."
pnpm prisma generate
echo "[dev] applying pending migrations..."
pnpm prisma migrate deploy
echo "[dev] starting next dev (Turbopack)..."
exec pnpm dev
