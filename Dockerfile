# ---- Dependencies ----
# Install production+dev deps and generate the Prisma client from the schema.
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile
# Generate the Prisma client (binaryTargets include linux-musl for Alpine).
RUN pnpm prisma generate

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
# Prisma schema + migrations so `prisma migrate deploy` works at startup.
COPY --from=build /app/prisma ./prisma
# Prisma client runtime + CLI that the standalone trace does NOT bundle,
# because no app code imports Prisma yet (PR2 wires it). Kept explicit here so
# `prisma migrate deploy` and future PrismaClient both resolve. The generated
# client lives at `.pnpm/@prisma+client@*/node_modules/.prisma/client`.
COPY --from=build /app/node_modules/.pnpm ./node_modules/.pnpm
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/node_modules/prisma ./node_modules/prisma
COPY --from=build /app/node_modules/.bin ./node_modules/.bin
USER node
COPY --chown=node:node --from=build /app/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "server.js"]
