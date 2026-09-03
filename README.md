# Bloodbowl Teams

**English** | [Español](README.es.md) | [Català](README.ca.md)

---

Team, league and championship manager for **Blood Bowl 2025** — with a design inspired by the official rulebook ("book" theme: light panels, navy/red headers, rulebook-style tables).

Stack: **Next.js 16** (App Router, Turbopack) · React 19 · TypeScript · Tailwind v4 · **Prisma + PostgreSQL** · **Auth.js v5** (email + password) · Vitest + Playwright · Docker/GHCR.

---

## Features

### Teams (BB2025)
- Complete catalog of **31 races / 163 positionals** (Slann included) with stats (MV/ST/AG/PA/AV), skills in Spanish, skill access (G/A/P/S/M/T), costs and caps aligned with the **BB2025 rulebook**. The catalog lives in JSON (`features/teams/data/races.catalog.json`) with a validator and a rulebook scraper as the reference source.
- **Fantasy names** per race: player name banks ("First Last" composition) and team names, with a 🎲 button in creation and when renaming players.
- **2-step creation**: name + race → roster (minimum **11 players**, 1,000,000 gc budget) → coaching staff → save.
- **Rulebook-style roster**: dense table with built-in progression (segmented SPP bar, NI, "Miss next" badge), improve modal with PE-filtered selects, jersey number next to the position, reorder arrows and **hire/fire** against the real treasury balance.
- **Journeymen**: if fewer than 11 are available, the roster is filled with journeymen from the race's name bank (deterministic names); they earn PE, are MVP-eligible and after the match can be **signed (one-time fee) or released**.
- **Team detail** book-style view: roster, coaching staff, treasury; **archive (soft delete)** with confirmation modal; a team in a league **cannot be archived** (409 guard, kick out first).
- **`/teams` page**: your teams split into "No league" / "In league", cards with TV, treasury and a "ready to improve" hint.

### Authentication & account
- **Auth.js v5** (Credentials + JWT, bcryptjs): open registration, login, logout, protected routes (`AUTH_MODE=auth`); **modal auth** (top-sheet on mobile).
- **Public landing + dashboard**: `/` shows the landing (anonymous) or the dashboard (logged in); unified nav (**Teams · Leagues · Matches**).
- **Account roles**: `user` and `developer`; the developer role unlocks the dev-only ruleset section (403 server-side guard).
- **My Profile**: avatar (256×256 WebP), password change, **career stats** (championships, wins/draws/losses) and **per-account language** (ES/EN, cookie + selector).
- **PostgreSQL + Prisma**: teams and leagues per user; automatic migrations on deploy.
- **Storage**: local mode (no login) uses an **in-memory store** (localStorage deprecated); the **legacy localStorage → account migration** is kept (idempotent, source never deleted).

### Leagues & championships
- **Rulesets**: define allowed races, starting treasury, TV cap, roster min/max and hiring policy; leagues pick one at creation (seed "Estándar BB2025"). Dev-only section with card/tab wizard.
- **Open public leagues**: any logged-in user creates leagues (admin = creator) and joins with their teams; **one user = one team per league** (409 guard).
- **Championships**: the admin picks the number of **matchdays** (1..teams-1) and **pairings are automatic** (round-robin with shuffle, no repeated rivals; with an odd number of teams one rests).
- **League closure & champion**: when the last matchday completes the league closes automatically; **3/1/0 standings** with tiebreakers (points → TD difference → TDs scored → head-to-head) decide the **champion** ("Finished" badge + champion panel).
- **Matchday**: date negotiation (give-and-take), admin forfeit (walkover), rival scouting, matchday completeness, **re-schedule** (renegotiate before playing) and result correction by both captains.
- **Match resolution** (wizard per side, resumable): **winnings** → **fan factor roll** (↑/=/↓) → **MVP** (checkboxes, max. 6 per side) → **casualties** → **journeymen**; when both sides finish, the match closes itself.
- **Live match**: correct turns (home T1 → away T1 → home T2), ★2 only on the causer, **concession**, result correction and kickoff events (Costly error + Fan factor) with 100% server-side dice.
- **`/matches` page**: upcoming matches grouped by date, with **LIVE** badge while running.

### UI / UX
- Coherent **rulebook light** design (shell, sidebar, cards, tables, modals).
- **i18n ES/EN**: own dictionaries with no dependencies; per-account language (selector in My Profile) and per-browser (cookie `bb-locale`).
- **Responsive / mobile**: hamburger drawer, stacked tables on mobile, native 16px combos, no horizontal scroll.

---

## Getting started

### Requirements
- Node.js 22+ · pnpm 8.6.6 · Docker (for Postgres and e2e)

### 1. Local environment

```bash
pnpm install
cp .env.example .env.development.local   # then fill DATABASE_URL / AUTH_SECRET / AUTH_MODE
docker compose up -d postgres            # Postgres (published port: POSTGRES_PORT, default 5433)
pnpm db:generate && pnpm db:migrate      # Prisma client + migrations
pnpm dev                                 # http://localhost:3000
```

> `.env.development.local` (gitignored): `DATABASE_URL`, `AUTH_SECRET` (generate with `openssl rand -base64 32`), `AUTH_TRUST_HOST=true`, `AUTH_MODE=auth|local`.
> `AUTH_MODE=local` = anonymous without login (in-memory data, no persistence); `AUTH_MODE=auth` = login + real Postgres persistence.

### 2. Scripts

```bash
pnpm test                # Unit + integration (Vitest)
pnpm run test:e2e        # Local e2e (AUTH_MODE=local) — requires AUTH_MODE=local in the environment
pnpm run test:e2e:auth   # Real-DB e2e (auth, leagues, matchday, live match) — starts Postgres + app in AUTH_MODE=auth
pnpm lint                # ESLint
pnpm storybook           # Storybook design system http://localhost:6006
pnpm build-storybook     # Static Storybook build → storybook-static/
pnpm db:generate         # Prisma client
pnpm db:migrate          # Apply migrations
pnpm docker:build        # Build local image
```

### 3. Deploy (Docker / Arcane)

See [docs/auth.md](./docs/auth.md) for the full detail. Summary:

- The image is built and published to **GHCR** from GitHub Actions (push to `main`); CI publishes date-versioned tags and a weekly workflow prunes the 10 oldest images.
- `docker-compose.yml`: `web` service (image `ghcr.io/<org>/bloodbowl_project:latest`) + `postgres` on a shared network.
- The container entrypoint runs `prisma migrate deploy` before starting.
- Environment variables: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_TRUST_HOST`, `AUTH_MODE=auth`, `POSTGRES_PORT` (default 5433).

```bash
docker compose pull web
docker compose up -d --force-recreate web
```

---

## Structure

```
app/                  # Routes (App Router): teams, leagues, matches, profile, dev, API routes
components/           # Shell (Sidebar/Topbar), AuthCard
features/
  teams/              # Catalog (data/: JSON + validator, skills, names), rulebook roster, wizard
  leagues/            # Leagues, championships, matchday, live match, resolution, matchdays
  matches/            # /matches page (upcoming grouped by date)
  rulesets/           # Rulesets (dev-only section)
  profile/            # My Profile (avatar, password, stats, language)
  migration/          # localStorage → account migration
lib/                  # Prisma client, roundRobin, standings, liveStore, i18n
prisma/               # Schema + migrations
e2e/                  # Playwright: desktop, mobile, auth, leagues, matchday, live match
openspec/             # SDD: specs, archived changes
docs/                 # auth.md (ops/deploy)
```

---

## Development with Docker

Virtualized development environment (docker-compose.dev.yml): `next dev` with **Turbopack HMR** inside the container, code bind mount and dedicated dev Postgres. It does not touch the production compose (`docker-compose.yml`).

### Requirements
- Docker Desktop / Engine with a recent Compose (any modern version works; the file does not use `develop.watch`).
- Check with `docker compose version`; if your plugin is too old, use the standalone `docker-compose` with the same commands (`docker-compose -f docker-compose.dev.yml ...`).

### Start

```bash
cp .env.example .env          # optional
pnpm dev:docker:up            # or: docker compose -f docker-compose.dev.yml up --build -d
pnpm dev:docker:logs          # optional: follow next dev logs
# open http://localhost:3000
```

### Hot-reload
- The code is **bind-mounted** (`.:/app`): changes reflect instantly in the container and **Turbopack HMR** reloads the page without restarting anything.
- If you touch `prisma/schema.prisma`: create the migration and **restart the service** (`pnpm dev:docker:restart`).

### New migrations during dev

```bash
docker compose -f docker-compose.dev.yml exec web-dev pnpm prisma migrate dev --name <name>
```

### Dev Postgres
- `localhost:5434` (credentials `bloodbowl`/`bloodbowl`, db `bloodbowl`).

### AUTH_MODE
- `local` by default (no login); `AUTH_MODE=auth` to test the full flow (requires `AUTH_SECRET`).

### VS Code / Cursor
- Install the **Dev Containers** extension and "Reopen in Container" (uses `.devcontainer/devcontainer.json`).

### Stop

```bash
pnpm dev:docker:down          # keeps the Postgres volume
```

---

## Documentation

- [docs/auth.md](./docs/auth.md) — Auth, PostgreSQL, migrations, auth e2e, Arcane deploy.
- [ROADMAP.md](./ROADMAP.md) — Feature/bug history and pending roadmap.
- [CONTRIBUTING.md](./CONTRIBUTING.md) — How to contribute (branches, commits, PRs, tests).

## License

MIT (see [LICENSE](./LICENSE)).
