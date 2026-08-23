# Bloodbowl Teams

Gestor de equipos, ligas y campeonatos de **Blood Bowl 2025** — con el diseño inspirado en el reglamento oficial (temática "libro": paneles claros, cabeceras navy/rojo, tablas estilo reglamento).

Stack: **Next.js 16** (App Router, Turbopack) · React 19 · TypeScript · Tailwind v4 · **Prisma + PostgreSQL** · **Auth.js v5** (email + contraseña) · Vitest + Playwright · Docker/GHCR.

---

## Features

### Equipos (BB2025)
- Catálogo completo de **31 razas / 163 posicionales** (Slann incluido) con stats (MV/FU/AG/PS/AR), skills en español, acceso de skills (G/A/P/S/M/F), costos y rangos alineados con **rulebook BB2025**. El catálogo vive en JSON (`features/teams/data/races.catalog.json`) con validador y un scraper rulebook como fuente de referencia.
- **Nombres fantásticos** por raza: bancos de jugadores (composición "Nombre Apellido") y nombres de equipo, con botón 🎲 en la creación y al renombrar jugadores.
- **Creación en 2 pasos**: nombre + raza → plantilla (mínimo **11 jugadores**, presupuesto 1 000 000 gc) → coaching staff → guardar.
- **Roster estilo rulebook**: tabla densa con progresión integrada (barra SPP segmentada, NI, badge "Baja la próxima"), modal de improve con selects filtrados por PE, dorsal junto al puesto, reordenar con flechas y **contratar/despedir** contra el balance real de tesorería.
- **Novatos (Journeymen)**: si quedan menos de 11 disponibles, se cubren con novatos del banco de la raza (nombres deterministas); ganan PE, son elegibles a MVP y tras el partido se pueden **fichar (cobro único) o dejar ir**.
- **Detalle de equipo** estilo libro: plantilla, cuerpo técnico, tesorería; **archivo (soft delete)** con modal de confirmación; un equipo en una liga **no se puede archivar** (guard 409, expulsar primero).
- **Página `/teams`**: tus equipos separados en "Sin liga" / "En liga", cards con CTV, tesorería y el hint "listos para mejorar".

### Autenticación y cuenta
- **Auth.js v5** (Credentials + JWT, bcryptjs): registro abierto, login, logout, rutas protegidas (`AUTH_MODE=auth`); **auth en modal** (top-sheet en mobile).
- **Landing pública + dashboard**: `/` muestra la landing (anónimo) o el dashboard (logueado); nav unificado (**Teams · Leagues · Matches**).
- **Roles de cuenta**: `user` y `developer`; el rol developer desbloquea la sección dev de tipos de reglas (guard 403 server-side).
- **My Profile**: avatar (256×256 WebP), cambio de contraseña, **estadísticas de carrera** (campeonatos, victorias/empates/derrotas) e **idioma por cuenta** (ES/EN, cookie + selector).
- **PostgreSQL + Prisma**: equipos y ligas por usuario; migraciones automáticas en el deploy.
- **Storage**: el modo local (sin login) usa un store **en memoria** (localStorage deprecado); la **migración legacy localStorage → cuenta** se mantiene (idempotente, sin borrar el origen).

### Ligas y campeonatos
- **Tipos de reglas (rulesets)**: definen razas permitidas, tesorería inicial, TV cap, mín/máx de plantilla y gestión de contrataciones; las ligas eligen uno al crearse (seed "Estándar BB2025"). Sección dev-only con wizard de cards/tabs.
- **Ligas abiertas públicas**: cualquier usuario logueado crea ligas (admin = creador) y se une con sus equipos; **un usuario = un equipo por liga** (guard 409).
- **Campeonatos**: el admin elige el número de **jornadas** (1..equipos-1) y los **emparejamientos son automáticos** (round-robin con shuffle, sin repetir rivales; con equipos impares uno descansa).
- **Cierre de liga y campeón**: al completarse la última jornada la liga se cierra automáticamente; las **standings 3/1/0** con desempates (puntos → diferencia de TD → TDs a favor → enfrentamiento directo) deciden el **campeón** (badge "Finalizada" + panel del campeón).
- **Matchday**: negociación de fecha (toma y daca), forfeit del admin (walkover), scouting del rival, completitud de jornada, **rejornar** (renegociar antes de jugarse) y corrección de resultados por ambos capitanes.
- **Resolución del partido** (wizard por lado, resumible): **ganancias** → **tirada de aficionados** (↑/=/↓) → **MVP** (checkboxes, máx. 6 por lado) → **bajas** → **novatos**; cuando ambos lados terminan, el partido se cierra solo.
- **Partido en vivo**: turnos correctos (home T1 → away T1 → home T2), ★2 solo en el causador, **concesión**, corrección de resultados y eventos de kickoff (Error costoso + Factor de aficionados) con dados 100% server-side.
- **Página `/matches`**: próximos partidos agrupados por fecha, con badge **EN VIVO** mientras corren.

### UI / UX
- Diseño **rulebook light** coherente (shell, sidebar, cards, tablas, modales).
- **i18n ES/EN**: diccionarios propios sin dependencias; idioma por cuenta (selector en My Profile) y por navegador (cookie `bb-locale`).
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
> `AUTH_MODE=local` = anónimo sin login (datos en memoria, sin persistencia); `AUTH_MODE=auth` = login + persistencia real en Postgres.

### 2. Scripts

```bash
pnpm test                # Unit + integration (Vitest)
pnpm run test:e2e        # E2E local (AUTH_MODE=local) — requiere AUTH_MODE=local en el entorno
pnpm run test:e2e:auth   # E2E real-DB (auth, ligas, matchday, partido en vivo) — levanta Postgres + app en AUTH_MODE=auth
pnpm lint                # ESLint
pnpm db:generate         # Prisma client
pnpm db:migrate          # Aplicar migraciones
pnpm docker:build        # Construir imagen local
```

### 3. Deploy (Docker / Arcane)

Ver [docs/auth.md](./docs/auth.md) para el detalle completo. Resumen:

- La imagen se construye y publica en **GHCR** desde GitHub Actions (push a `main`); la CI publica tags versionados por fecha y un workflow semanal limpia las 10 imágenes más antiguas.
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
app/                  # Rutas (App Router): equipos, ligas, partidos, perfil, dev, API routes
components/           # Shell (Sidebar/Topbar), AuthCard
features/
  teams/              # Catálogo (data/: JSON + validador, skills, nombres), roster rulebook, wizard
  leagues/            # Ligas, campeonatos, matchday, partido en vivo, resolución, jornadas
  matches/            # Página /matches (próximos agrupados por fecha)
  rulesets/           # Tipos de reglas (sección dev-only)
  profile/            # My Profile (avatar, contraseña, estadísticas, idioma)
  migration/          # Migración localStorage → cuenta
lib/                  # Prisma client, roundRobin, standings, liveStore, i18n
prisma/               # Schema + migraciones
e2e/                  # Playwright: desktop, mobile, auth, ligas, matchday, partido en vivo
openspec/             # SDD: specs, cambios archivados
docs/                 # auth.md (ops/deploy)
```

---

## Development with Docker

Entorno de desarrollo virtualizado (docker-compose.dev.yml): `next dev` con **Turbopack HMR** dentro del contenedor, bind mount del código y Postgres dev dedicado. No toca el compose de producción (`docker-compose.yml`).

### Requisitos
- Docker Desktop / Engine con Compose reciente (cualquier versión moderna sirve; el archivo no usa `develop.watch`).
- Verificá con `docker compose version`; si tu plugin es muy viejo, usá el standalone `docker-compose` con los mismos comandos (`docker-compose -f docker-compose.dev.yml ...`).

### Arranque

```bash
cp .env.example .env          # opcional
pnpm dev:docker:up            # o: docker compose -f docker-compose.dev.yml up --build -d
pnpm dev:docker:logs          # opcional: seguir los logs de next dev
# abrir http://localhost:3000
```

### Hot-reload
- El código está **bind-mounteado** (`.:/app`): los cambios se reflejan al instante en el contenedor y **Turbopack HMR** recarga la página sin reiniciar nada.
- Si tocás `prisma/schema.prisma`: creá la migración y **reiniciá el servicio** (`pnpm dev:docker:restart`).

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
