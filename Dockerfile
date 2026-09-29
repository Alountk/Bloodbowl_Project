# ---- Dependencies (build only) ----
# Install production+dev deps and generate the Prisma client from the schema.
# Everything from this stage except the traced standalone output is build-time:
# Storybook, Playwright, Vitest, ESLint, Vite and TypeScript are never imported
# by the running server.
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile
# Generate the Prisma client (binaryTargets include linux-musl for Alpine).
RUN pnpm prisma generate

# ---- Production dependencies (runtime) ----
# Derived from `deps` so every lifecycle script has already run there (the
# Prisma engine download and the client generate), then pruned to what the
# server actually imports — Storybook, Playwright, Vitest, ESLint, Vite and
# TypeScript are build/test-only and used to ship inside the runtime image.
#
# A plain `pnpm install --frozen-lockfile --prod` cannot be used instead:
# `prepare` wires the git hooks, husky is a devDependency, so in a prod-only
# install it dies with `sh: husky: not found`. Deleting `prepare` for this stage
# is safe — it is dev ergonomics, not part of the app.
FROM deps AS deps-prod
RUN pnpm pkg delete scripts.prepare && pnpm prune --prod
# The entrypoint runs `./node_modules/.bin/prisma migrate deploy` on every
# start; fail the build now rather than at container boot if the prune dropped
# the CLI. (`prisma` is a production dependency for exactly this reason.)
RUN test -x node_modules/.bin/prisma

# ---- Build ----
# Build the Next.js standalone output.
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm prisma generate && pnpm build

# ---- Runner (Next.js standalone) ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
# Default port; override at deploy time with -e PORT=<n> without touching the image.
ENV PORT=3444
EXPOSE 3444
# Standalone output (server.js + traced node_modules).
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Ensure the local-storage uploads dir exists and is owned by the runtime user
# BEFORE switching to `USER node`, so the named volume inherits node ownership
# (avoids a root-owned `public/uploads` that the app cannot write).
RUN mkdir -p /app/public/uploads && chown -R node:node /app/public/uploads
# Prisma schema + migrations so `prisma migrate deploy` works at startup.
COPY --from=build /app/prisma ./prisma
# Production node_modules. The standalone trace covers the server's own
# imports, but it does not include the Prisma CLI the entrypoint needs for
# `prisma migrate deploy`, and `pnpm`'s layout keeps the real packages inside
# `.pnpm` behind symlinks — so copy that store (plus the Prisma entry points
# and `.bin`) from the PRODUCTION install. Copying it from `deps` instead is
# what used to ship Storybook/Playwright/Vitest/ESLint in the runtime image.
COPY --from=deps-prod /app/node_modules/.pnpm ./node_modules/.pnpm
COPY --from=deps-prod /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=deps-prod /app/node_modules/prisma ./node_modules/prisma
COPY --from=deps-prod /app/node_modules/.bin ./node_modules/.bin
USER node
COPY --chown=node:node --from=build /app/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "server.js"]
