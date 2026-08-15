#!/usr/bin/env sh
# Docker dev wrapper: forwards all args to `docker compose -f docker-compose.dev.yml`.
set -e
exec docker compose -f docker-compose.dev.yml "$@"
