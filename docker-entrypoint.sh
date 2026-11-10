#!/bin/sh
# Startup entrypoint for the Blood Bowl Web container.
# Migrations do NOT run here anymore: `prisma migrate deploy` moved to the
# dedicated one-shot `migrate` container (compose service `migrate`, image tag
# `:migrate`), which `web` waits on via depends_on: service_completed_successfully.
# The runner only starts the application server.
set -e

exec "$@"
