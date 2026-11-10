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
#
# Slimming pass — SCOPED TO THIS STAGE ONLY (local macOS dev is untouched).
# Two pnpm 8.6.6 / lockfile-v6 behaviors defeat `prune --prod` on linux/amd64:
#
#   1. No `libc` dimension: `@next/swc-linux-*-gnu` vs `-musl` and
#      `@img/sharp-linux-*` vs `-linuxmusl-*` all declare only
#      `os: [linux], cpu: [...]` in the lockfile, so BOTH libc variants match
#      and install. (On darwin neither matches — macOS dev never sees them.)
#   2. `autoInstallPeers: true` records auto-installed peers as REAL
#      dependencies of prod snapshots: `next -> @playwright/test` and
#      `@prisma/client -> prisma, typescript`, so prune keeps them.
#
# Why a guarded `rm` and not pnpm config: any resolution-affecting setting
# (auto-install-peers=false, supported-architectures) invalidates the frozen
# lockfile (`--frozen-lockfile` fails on a settings change) and, at repo root,
# would also change macOS dev resolution (S4). pnpm 8.6.6's
# `supported-architectures` has no `libc` dimension — it can only ADD
# platforms, not exclude a libc variant. So exact-path removal here is the
# only mechanism that is both build-scoped and lockfile-safe.
#
# Removed (all never-required at runtime on Alpine/musl, verified in the
# before/after probes):
#   - @next/swc-linux-*-gnu, @img/sharp-linux-*, @img/sharp-libvips-linux-*:
#     glibc binaries (x64 + arm64) — the musl node loads the musl swc/sharp
#     variants instead.
#   - typescript: build/type-check only (auto-installed peer of prisma and
#     @prisma/client); `next build` ran in the `build` stage, the standalone
#     server never requires it (no `require('typescript')` in next/dist).
#   - @playwright/test, playwright, playwright-core: test-only (auto-installed
#     optional peer of next; next only references it under
#     dist/experimental/testmode/playwright, never loaded by the server).
#   - prisma + @prisma/{config,engines,engines-version,fetch-engine,get-platform,
#     debug} + effect: the migrate CLI chain. Migrations now run in the
#     dedicated `migrate` image (see the migrate stage below); `effect` is
#     imported only by `@prisma/config <- prisma` (lockfile), nothing at
#     runtime. The generated client in `.pnpm/@prisma+client@*/node_modules/
#     .prisma` (with its query engine, per binaryTargets in prisma/schema.prisma)
#     is kept — that is the only Prisma the server needs.
RUN set -e; \
    rm -rf \
      node_modules/.pnpm/@next+swc-linux-*-gnu@* \
      node_modules/.pnpm/@img+sharp-linux-*@* \
      node_modules/.pnpm/@img+sharp-libvips-linux-*@* \
      node_modules/.pnpm/typescript@* \
      node_modules/.pnpm/@playwright+test@* \
      node_modules/.pnpm/playwright@* \
      node_modules/.pnpm/playwright-core@* \
      node_modules/.pnpm/prisma@* \
      node_modules/.pnpm/@prisma+config@* \
      node_modules/.pnpm/@prisma+engines@* \
      node_modules/.pnpm/@prisma+engines-version@* \
      node_modules/.pnpm/@prisma+fetch-engine@* \
      node_modules/.pnpm/@prisma+get-platform@* \
      node_modules/.pnpm/@prisma+debug@* \
      node_modules/.pnpm/effect@* \
      || true
# Presence checks: the removals above must never touch runtime essentials.
# Fail the build if the musl swc, the musl sharp/libvips or the generated
# Prisma client (incl. query engine) went missing.
RUN set -e; \
    ls -d node_modules/.pnpm/@next+swc-linux-*-musl@* >/dev/null; \
    ls -d node_modules/.pnpm/@img+sharp-linuxmusl-*@* >/dev/null; \
    ls -d node_modules/.pnpm/@img+sharp-libvips-linuxmusl-*@* >/dev/null; \
    ls -d node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client >/dev/null; \
    ls node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/libquery_engine-* >/dev/null; \
    ! ls -d node_modules/.pnpm/@next+swc-linux-*-gnu@* node_modules/.pnpm/prisma@* node_modules/.pnpm/effect@* 2>/dev/null | grep -q .

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
# Standalone hygiene: the trace cuts its `node_modules/.pnpm` subset from the
# UNPRUNED deps store (pnpm 8 installs both libc variants), so the glibc sharp
# twins ride along into `.next/standalone`. Drop them HERE: the runner copies
# these files into its own layer, and deleting them later only writes a
# whiteout — the bytes would stay in the image forever. The runner re-asserts
# this below as the merge-hazard guard.
RUN rm -rf \
    .next/standalone/node_modules/.pnpm/@img+sharp-linux-*@* \
    .next/standalone/node_modules/.pnpm/@img+sharp-libvips-linux-*@* \
    .next/standalone/node_modules/.pnpm/@next+swc-linux-*-gnu@* \
    .next/standalone/node_modules/.pnpm/typescript@* \
    .next/standalone/node_modules/.pnpm/playwright@* \
    .next/standalone/node_modules/.pnpm/prisma@* \
    .next/standalone/node_modules/.pnpm/effect@* \
    || true

# ---- Migrate (one-shot migrations) ----
# Palanca A: `prisma migrate deploy` runs as its own one-shot container (compose
# service `migrate`, published as the `:migrate` tag) instead of the runner's
# entrypoint. No app code and no pnpm store here — just the Prisma CLI pinned to
# the exact version `package.json` resolves (`"prisma": "^6.19.3"` -> 6.19.3;
# keep PRISMA_VERSION in sync with package.json/pnpm-lock.yaml).
FROM node:22-alpine AS migrate
# Pin pnpm to the repo's `packageManager` version: a bare `corepack enable`
# resolves to the latest pnpm (12.x), whose blocked-build-scripts policy
# (ERR_PNPM_IGNORED_BUILDS) skips prisma's postinstall — which is what fetches
# the schema engine `migrate deploy` needs.
RUN corepack enable && corepack prepare pnpm@8.6.6 --activate
WORKDIR /app
# Provenance stamping, same pattern as the runner (CI passes these build-args).
ARG APP_VERSION=dev
ARG APP_SHA=local
LABEL org.opencontainers.image.version=$APP_VERSION
LABEL org.opencontainers.image.revision=$APP_SHA
ARG PRISMA_VERSION=6.19.3
# Deterministic standalone install of the CLI; `pnpm add` creates
# node_modules/.bin/prisma (CMD below) and the prisma postinstall fetches the
# schema engine the CLI needs.
# "No store": afterwards drop pnpm's content store and the download caches
# (node_modules hardlinks survive) — this image only ever runs one CLI command.
RUN echo '{"name":"bloodbowl-migrate","version":"0.0.0","private":true}' > package.json \
    && pnpm add prisma@${PRISMA_VERSION} \
    && pnpm store prune \
    && (rm -rf /root/.cache /root/.local/share/pnpm/store || true)
# Schema + SQL migrations only (no app source).
COPY prisma ./prisma
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]

# ---- Runner (Next.js standalone) ----
FROM node:22-alpine AS runner
# Build provenance, stamped by CI (docker-publish build-args) and readable at
# runtime: the OCI labels answer "which build is this image?" from the registry
# or `docker inspect`, and APP_VERSION (ENV below) reaches instrumentation's
# server.boot so `docker logs` names the running build. Defaults keep a plain
# local `docker build` working without args.
ARG APP_VERSION=dev
ARG APP_SHA=local
LABEL org.opencontainers.image.version=$APP_VERSION
LABEL org.opencontainers.image.revision=$APP_SHA
ENV APP_VERSION=$APP_VERSION
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
# Production node_modules. The standalone trace covers the server's own
# imports, but `pnpm`'s layout keeps the real packages inside `.pnpm` behind
# symlinks (next/react/sharp and the generated Prisma client all resolve into
# the store at runtime) — so copy that store from the PRODUCTION install.
# Copying it from `deps` instead is what used to ship
# Storybook/Playwright/Vitest/ESLint in the runtime image.
#
# The Prisma CLI entry points (`prisma`, `@prisma` scope, `.bin`) and the
# schema/migrations COPY are GONE on purpose: migrations run in the `migrate`
# image above, and deps-prod's slimming pass removed the CLI chain from the
# store. Only `.pnpm/@prisma+client@*/node_modules/.prisma` (generated client +
# query engine) is required at runtime.
COPY --from=deps-prod /app/node_modules/.pnpm ./node_modules/.pnpm
# Merge hazard — re-slim the MERGED store: the standalone trace above carries
# its own `node_modules/.pnpm` subset (≈149MB) cut from the UNPRUNED `deps`
# store, and `COPY` merges (never deletes). That subset still holds the glibc
# sharp twins (`@img/sharp-linux-*`, `@img/sharp-libvips-linux-*`), which would
# otherwise ship inside `node_modules/.pnpm` even though deps-prod slimmed them
# away. Re-run the same slimming pass, then assert presence + absence.
RUN set -e; \
    rm -rf \
      node_modules/.pnpm/@next+swc-linux-*-gnu@* \
      node_modules/.pnpm/@img+sharp-linux-*@* \
      node_modules/.pnpm/@img+sharp-libvips-linux-*@* \
      node_modules/.pnpm/typescript@* \
      node_modules/.pnpm/@playwright+test@* \
      node_modules/.pnpm/playwright@* \
      node_modules/.pnpm/playwright-core@* \
      node_modules/.pnpm/prisma@* \
      node_modules/.pnpm/@prisma+config@* \
      node_modules/.pnpm/@prisma+engines@* \
      node_modules/.pnpm/@prisma+engines-version@* \
      node_modules/.pnpm/@prisma+fetch-engine@* \
      node_modules/.pnpm/@prisma+get-platform@* \
      node_modules/.pnpm/@prisma+debug@* \
      node_modules/.pnpm/effect@* \
      || true
RUN set -e; \
    ls -d node_modules/.pnpm/@next+swc-linux-*-musl@* >/dev/null; \
    ls -d node_modules/.pnpm/@img+sharp-linuxmusl-*@* >/dev/null; \
    ls -d node_modules/.pnpm/@img+sharp-libvips-linuxmusl-*@* >/dev/null; \
    ls -d node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client >/dev/null; \
    ls node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/libquery_engine-* >/dev/null; \
    ! ls -d node_modules/.pnpm/@next+swc-linux-*-gnu@* node_modules/.pnpm/@img+sharp-linux-*@* node_modules/.pnpm/@img+sharp-libvips-linux-*@* node_modules/.pnpm/typescript@* node_modules/.pnpm/playwright@* node_modules/.pnpm/prisma@* node_modules/.pnpm/effect@* 2>/dev/null | grep -q .
USER node
COPY --chown=node:node --from=build /app/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "server.js"]
