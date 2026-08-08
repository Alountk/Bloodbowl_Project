#!/bin/sh
# Startup entrypoint for the Blood Bowl Web container.
# Runs pending Prisma migrations against the configured DATABASE_URL, then
# starts the application server.
set -e

echo "[entrypoint] applying pending Prisma migrations..."
./node_modules/.bin/prisma migrate deploy
echo "[entrypoint] migrations applied; starting server..."

exec "$@"
