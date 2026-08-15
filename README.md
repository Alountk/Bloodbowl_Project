# Bloodbowl Teams

Gestor de equipos, ligas y campeonatos de **Blood Bowl 2025** — con el diseño inspirado en el reglamento oficial (temática "libro": paneles claros, cabeceras navy/rojo, tablas estilo reglamento).

Stack: **Next.js 16** (App Router, Turbopack) · React 19 · TypeScript · Tailwind v4 · **Prisma + PostgreSQL** · **Auth.js v5** (email + contraseña) · Vitest + Playwright · Docker/GHCR.

---

## Features

### Equipos (BB2025)
- Catálogo completo de **30 razas / 144 posicionales** con stats (MV/FU/AG/PS/AR), skills en español, acceso de skills (G/A/P/S/M/F), costos y rangos según el reglamento.
- **Creación en 2 pasos**: nombre + raza → plantilla (mínimo **11 jugadores**, presupuesto 1 000 000 gc) → coaching staff → guardar.
- **Detalle de equipo** estilo libro: plantilla, cuerpo técnico, tesorería.
- **Archivo (soft delete)** con modal de confirmación; un equipo en una liga **no se puede archivar** (expulsar primero).

### Autenticación y persistencia
- **Auth.js v5** (Credentials + JWT, bcryptjs): registro abierto, login, logout, rutas protegidas (`AUTH_MODE=auth`).
- **PostgreSQL + Prisma**: equipos y ligas por usuario; migraciones automáticas en el deploy.
- **Migración de localStorage**: los equipos antiguos del navegador se migran a la cuenta (idempotente, sin borrar el origen).

### Ligas y campeonatos
- **Ligas abiertas públicas**: cualquier usuario logueado crea ligas (admin = creador) y se une con sus equipos (uno por equipo).
- **Campeonatos**: el admin elige el número de **jornadas** (1..equipos-1) y los **emparejamientos son automáticos** (round-robin con shuffle, sin repetir rivales; con equipos impares uno descansa).
- **Matchday**:
  - **Negociación de fecha** (toma y daca): solo los dos rivales proponen/aceptan hasta acordar (✓ Acordado).
  - **Forfeit**: el admin puede otorgar victoria (walkover) cuando alguien no puede jugar, para avanzar de jornada.
  - **Scouting**: click en un rival → ver su roster (solo lectura).
  - **Completitud de jornada**: una jornada se completa cuando todos sus partidos tienen resultado.

### UI / UX
- Diseño **rulebook light** coherente (shell, sidebar, cards, tablas, modales).
- **Responsive / mobile**: drawer hamburger, tablas apiladas en mobile, combos nativos 16px, sin scroll horizontal.

---

## Getting started

### Requisitos
- Node.js 22+ · pnpm 8.6.6 · Docker (para Postgres y e2e)

### 1. Entorno local

```bash
pnpm install
cp .env.example .env.development.local   # y completá DATABASE_URL / AUTH_SECRET / AUTH_MODE
docker compose up -d postgres            # Postgres (puerto publicado: POSTGRES_PORT, default 5433)
pnpm db:generate && pnpm db:migrate      # Prisma client + migraciones
pnpm dev                                 # http://localhost:3000
```

> `.env.development.local` (gitignored): `DATABASE_URL`, `AUTH_SECRET` (generar con `openssl rand -base64 32`), `AUTH_TRUST_HOST=true`, `AUTH_MODE=auth|local`.
> `AUTH_MODE=local` = anónimo (sin login); `AUTH_MODE=auth` = login + persistencia real.

### 2. Scripts

```bash
pnpm test                # Unit + integration (Vitest)
pnpm run test:e2e        # E2E local (AUTH_MODE=local) — requiere AUTH_MODE=local en el entorno
pnpm run test:e2e:auth   # E2E real-DB (auth, ligas, matchday) — levanta Postgres + app en AUTH_MODE=auth
pnpm lint                # ESLint
pnpm db:generate         # Prisma client
pnpm db:migrate          # Aplicar migraciones
pnpm docker:build        # Construir imagen local
```

### 3. Deploy (Docker / Arcane)

Ver [docs/auth.md](./docs/auth.md) para el detalle completo. Resumen:

- La imagen se construye y publica en **GHCR** desde GitHub Actions (push a `main`).
- `docker-compose.yml`: servicio `web` (imagen `ghcr.io/<org>/bloodbowl_project:latest`) + `postgres` en red compartida.
- El entrypoint del contenedor aplica `prisma migrate deploy` antes de arrancar.
- Variables de entorno: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_TRUST_HOST`, `AUTH_MODE=auth`, `POSTGRES_PORT` (default 5433).

```bash
docker compose pull web
docker compose up -d --force-recreate web
```

---

## Estructura

```
app/                  # Rutas (App Router): equipos, ligas, login/signup, API routes
components/           # Shell (Sidebar/Topbar), AuthCard
features/
  teams/              # Catálogo (razas, skills), stores (Local/Api), roster, wizard, detalle
  leagues/            # Ligas, campeonatos, matchday (negociación, forfeit, scouting)
  migration/          # Migración localStorage → cuenta
lib/                  # Prisma client, roundRobin, email
prisma/               # Schema + migraciones
e2e/                  # Playwright: desktop, mobile, auth, ligas, matchday
openspec/             # SDD: specs, cambios archivados
docs/                 # auth.md (ops/deploy)
```

---

## Development with Docker

Entorno de desarrollo virtualizado (docker-compose.dev.yml): `next dev` con **Turbopack HMR** dentro del contenedor, bind mount del código y Postgres dev dedicado. No toca el compose de producción (`docker-compose.yml`).

### Requisitos
- Docker Desktop / Engine con **Compose ≥ 2.23** (para `develop.watch` con `sync+restart`; `docker compose up --watch`).

### Arranque

```bash
cp .env.example .env          # opcional
pnpm dev:docker:up            # o: docker compose -f docker-compose.dev.yml up --build -d
pnpm dev:docker:watch         # o: docker compose -f docker-compose.dev.yml watch
# abrir http://localhost:3000
```

### Hot-reload
- Los cambios en el código se reflejan al instante (Turbopack HMR).
- `prisma/schema.prisma` reinicia el servicio (`sync-restart`).
- `package.json` reconstruye la imagen (`rebuild`).

### Migraciones nuevas durante dev

```bash
docker compose -f docker-compose.dev.yml exec web-dev pnpm prisma migrate dev --name <nombre>
```

### Postgres dev
- `localhost:5434` (credenciales `bloodbowl`/`bloodbowl`, db `bloodbowl`).

### AUTH_MODE
- `local` por defecto (sin login); `AUTH_MODE=auth` para probar el flujo completo (requiere `AUTH_SECRET`).

### VS Code / Cursor
- Instalar la extensión **Dev Containers** y "Reopen in Container" (usa `.devcontainer/devcontainer.json`).

### Detener

```bash
pnpm dev:docker:down          # conserva el volumen de Postgres
```

---

## Documentación

- [docs/auth.md](./docs/auth.md) — Auth, PostgreSQL, migraciones, e2e auth, deploy en Arcane.
- [ROADMAP.md](./ROADMAP.md) — Historico de features/bugs y roadmap pendiente.
- [CONTRIBUTING.md](./CONTRIBUTING.md) — Cómo contribuir (branches, commits, PRs, tests).

## Licencia

MIT (ver [LICENSE](./LICENSE)).
