# Bloodbowl Teams

[English](README.md) | [Español](README.es.md) | **Català**

---

Gestor d'equips, lligues i campionats de **Blood Bowl 2025** — amb el disseny inspirat en el reglament oficial (temàtica "llibre": panells clars, capçaleres navy/vermell, taules estil reglament).

Stack: **Next.js 16** (App Router, Turbopack) · React 19 · TypeScript · Tailwind v4 · **Prisma + PostgreSQL** · **Auth.js v5** (correu electrònic + contrasenya) · Vitest + Playwright · Docker/GHCR · logging estructurat (zero-dependències) · capa de correu (Resend, zero-dependències).

---

## Funcionalitats

### Equips (BB2025)
- Catàleg complet de **31 races / 163 posicionals** (Slann inclòs) amb stats (MV/FU/AG/PS/AR), skills en castellà, accés de skills (G/A/P/S/M/T), costos i límits alineats amb el **rulebook BB2025**. El catàleg viu en JSON (`features/teams/data/races.catalog.json`) amb validador i un scraper del rulebook com a font de referència.
- **Noms fantàstics** per raça: bancs de jugadors (composició "Nom Cognom") i noms d'equip, amb botó 🎲 a la creació i en reanomenar jugadors.
- **Creació en 2 passos**: nom + raça → plantilla (mínim **11 jugadors**, pressupost 1 000 000 gc) → coaching staff → desar.
- **Roster estil rulebook**: taula densa amb progressió integrada (barra SPP segmentada, NI, badge "Baixa la propera"), modal d'improve amb selects filtrats per PE, dorsal al costat del lloc, reordenar amb fletxes i **contractar/acomiadar** contra el balanç real de tresoreria.
- **Novells (Journeymen)**: si en queden menys d'11 disponibles, es cobreixen amb novells del banc de la raça (noms deterministes); guanyen PE, són elegibles a MVP i després del partit es poden **fitxar (cobrament únic) o deixar anar**.
- **Detall d'equip** estil llibre: plantilla, cos tècnic, tresoreria; **arxiu (soft delete)** amb modal de confirmació; un equip en una lliga **no es pot arxivar** (guard 409, expulsar primer).
- **Pàgina `/teams`**: els teus equips separats en "Sense lliga" / "En lliga", cards amb CTV, tresoreria i el hint "a punt per millorar".
- **Escut d'equip personalitzat**: el owner puja un escut des del detall de l'equip (WebP 512×512 server-side, ≤2MB, tipus verificat per magic bytes) que reemplaça l'emblema determinista a les cards, la vista de detall i la match card (fallback al placeholder).

### Autenticació i compte
- **Auth.js v5** (Credentials + JWT, bcryptjs): registre obert, login, logout, rutes protegides (`AUTH_MODE=auth`); **auth en modal** (top-sheet en mobile).
- **Landing pública + dashboard**: `/` mostra la landing (anònim) o el dashboard (amb sessió); nav unificat (**Teams · Leagues · Matches**).
- **Rols de compte**: `user` i `developer`; el rol developer desbloqueja la secció dev de tipus de regles (guard 403 server-side).
- **My Profile**: avatar (256×256 WebP), canvi de contrasenya, **estadístiques de carrera** (campionats, victòries/empats/derrotes) i **idioma per compte** (ES/EN, cookie + selector).
- **PostgreSQL + Prisma**: equips i lligues per usuari; migracions automàtiques al desplegament.
- **Emmagatzematge**: el mode local (sense login) fa servir un store **en memòria** (localStorage obsolet); la **migració legacy localStorage → compte** es manté (idempotent, sense esborrar l'origen).
- **RBAC + plans**: columna additiva `User.plan` (`free`/`club`/`premium`), capa de permisos tipada (`lib/permissions`) i guard generalitzat `requirePermission`; una secció dev-only `/dev/users` gestiona rols i plans (403 server-side, lockout d'auto-rol).
- **Tema per compte**: `vintage` (default) o `scoreboard`, resolt server-side a `<html data-theme>` (compte → cookie → default) amb un toggle a la nav i un selector a My Profile (anti-FOUC).
- **Enduriment de seguretat**: rate limiting en signup/login/canvi de contrasenya, security headers + CSP, invalidació del JWT en canviar la contrasenya, gate 401 en JSON per a rutes `/api` sense match al proxy, topes de payload i validació profunda de rosters, i fail-fast si falta `AUTH_SECRET`.

### Lligues i campionats
- **Tipus de regles (rulesets)**: defineixen races permeses, tresoreria inicial, TV cap, mín/màx de plantilla i gestió de contractacions; les lligues en trien un en crear-se (seed "Estàndard BB2025"). Secció dev-only amb wizard de cards/tabs.
- **Lligues obertes públiques**: qualsevol usuari amb sessió crea lligues (admin = creador) i s'hi uneix amb els seus equips; **un usuari = un equip per lliga** (guard 409).
- **Campionats**: l'admin tria el nombre de **jornades** (1..equips-1) i els **enfrontaments són automàtics** (round-robin amb shuffle, sense repetir rivals; amb equips senars un descansa).
- **Tancament de lliga i campió**: en completar-se l'última jornada la lliga es tanca automàticament; les **standings 3/1/0** amb desempats (punts → diferència de TD → TDs a favor → enfrontament directe) decideixen el **campió** (badge "Finalitzada" + panell del campió).
- **Matchday**: negociació de data (toma i dóna), forfeit de l'admin (walkover), scouting del rival, completesa de jornada, **rejornar** (renegociar abans de jugar-se) i correcció de resultats per tots dos capitans.
- **Resolució del partit** (wizard per banda, reprensible): **guanys** → **tirada d'aficionats** (↑/=/↓) → **MVP** (checkboxes, màx. 6 per banda) → **baixes** → **novells**; quan totes dues bandes acaben, el partit es tanca sol.
- **Partit en viu (temps real)**: mode de dos entrenadors via SSE amb rellotges derivats server-side, sincronització de torns, fase de consentiment/ready, feed d'esdeveniments persistit des del dia 1, recuperació en un dispositiu nou i auto-tancament lazy a les 8h que congela el marcador.
- **Regles del partit aplicades server-side**: ordre de torns correcte (local T1 → visitant T1 → local T2), ★2 només al causant, **concessió**, esdeveniments de kickoff (Error costós + Factor d'aficionats) i daus 100% server-side.
- **Entrada d'accions**: un dock contextual registra TD/passe/baixa/falta des del costat de l'entrenador actiu (amb steppers guiats 1D16/1D6 i simetria de "tots dos caiguts"); cada card la verifica el rival amb ✓/✗, amb auto-verificació als 60s.
- **Incentius pre-partit**: l'entrenador de menor TV compra d'un catàleg de 16 cartes BB2025 durant la fase `ready` amb pressupost = ΔTV; el feed acabat els mostra com a chips per equip.
- **Link públic per compartir**: un token fix de 192 bits permet a un convidat obrir `/watch/[token]` i seguir el partit en només lectura (marcador, rellotge, timeline) sense compte; expira quan el resultat entra.
- **Pàgina `/matches`**: pròxims partits agrupats per data, amb badge **EN VIU** mentre corren.

### UI / UX
- Disseny **rulebook light** coherent (shell, sidebar, cards, taules, modals).
- **i18n ES/EN**: diccionaris propis sense dependències; idioma per compte (selector a My Profile) i per navegador (cookie `bb-locale`).
- **Responsive / mobile**: drawer hamburguesa, taules apilades en mobile, combos nadius 16px, sense scroll horitzontal.
- **Dos temes visuals**: la direcció per defecte "reglament vintage" (paper crema + tinta editorial, Fraunces + Space Grotesk self-hosted) i el tema opt-in "scoreboard" (`[data-theme=scoreboard]`).
- **Design system a Storybook**: galeria de tokens versionada més stories de components, amb skills de UI/UX versionades a `.opencode/skills`.
- **Accessibilitat**: landmarks i regions etiquetades a tota l'app, patró APG de menú-botó a les match cards i una suite e2e dedicada a 375px que verifica que no hi ha scroll horitzontal.

---

## Per començar

### Requisits
- Node.js 22+ · pnpm 8.6.6 · Docker (per a Postgres i e2e)

### 1. Entorn local

```bash
pnpm install
cp .env.example .env.development.local   # i completa DATABASE_URL / AUTH_SECRET / AUTH_MODE
docker compose up -d postgres            # Postgres (port publicat: POSTGRES_PORT, default 5433)
pnpm db:generate && pnpm db:migrate      # Prisma client + migracions
pnpm dev                                 # http://localhost:3000
```

> `.env.development.local` (gitignored): `DATABASE_URL`, `AUTH_SECRET` (genera amb `openssl rand -base64 32`), `AUTH_TRUST_HOST=true`, `AUTH_MODE=auth|local`.
> `AUTH_MODE=local` = anònim sense login (dades en memòria, sense persistència); `AUTH_MODE=auth` = login + persistència real a Postgres.

### 2. Scripts

```bash
pnpm test                # Unit + integració (Vitest)
pnpm run test:e2e        # E2E local (AUTH_MODE=local) — requereix AUTH_MODE=local a l'entorn
pnpm run test:e2e:auth   # E2E real-DB (auth, lligues, matchday, partit en viu) — aixeca Postgres + app en AUTH_MODE=auth
pnpm lint                # ESLint
pnpm storybook           # Storybook (design system) — http://localhost:6006
pnpm build-storybook     # Build estàtic de Storybook → storybook-static/
pnpm db:generate         # Prisma client
pnpm db:migrate          # Aplicar migracions
pnpm docker:build        # Construir imatge local
pnpm playground          # migrate + seed + dev (playground)
```

### 3. Desplegament (Docker / Arcane)

Consulta [docs/auth.md](./docs/auth.md) per al detall complet. Resum:

- La imatge es construeix i es publica a **GHCR** des de GitHub Actions (push a `main`); la CI publica tags amb versió per data i un workflow setmanal neteja les 10 imatges més antigues.
- `docker-compose.yml`: servei `web` (imatge `ghcr.io/<org>/bloodbowl_project:latest`) + `postgres` en xarxa compartida.
- L'entrypoint del contenidor aplica `prisma migrate deploy` abans d'arrencar.
- Variables d'entorn: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_TRUST_HOST`, `AUTH_MODE=auth`, `POSTGRES_PORT` (default 5433).

```bash
docker compose pull web
docker compose up -d --force-recreate web
```

---

## Estructura

```
app/                  # Rutes (App Router): equips, lligues, partits, perfil, dev, API routes
components/           # Shell (AppShell/AppNav), SessionProvider, MatchCard, UserAvatar
features/
  teams/              # Catàleg (data/: JSON + validador, skills, noms), roster rulebook, wizard
  leagues/            # Lligues, campionats, matchday, partit en viu, resolució, jornades
  matches/            # Pàgina /matches (pròxims agrupats per data)
  dashboard/          # Home amb sessió
  rulesets/           # Tipus de regles (secció dev-only)
  profile/            # My Profile (avatar, contrasenya, estadístiques, idioma, tema)
  auth/ landing/ users/ migration/  # Auth en modal, landing pública, /dev/users, migració localStorage
lib/                  # Prisma client, domini pur (liveMatch/standings/rules), hub SSE, i18n, logger, mail, storage
prisma/               # Schema + migracions
e2e/                  # Playwright (playwright.config.ts local, playwright.config.auth.ts real-DB)
stories/              # Design system de Storybook
openspec/             # SDD: specs, canvis arxivats
docs/                 # auth.md (ops/deploy)
.opencode/skills/     # Skills de workflow versionades amb el repo
```

---

## Desenvolupament amb Docker

Entorn de desenvolupament virtualitzat (docker-compose.dev.yml): `next dev` amb **Turbopack HMR** dins del contenidor, bind mount del codi i Postgres dev dedicat. No toca el compose de producció (`docker-compose.yml`).

### Requisits
- Docker Desktop / Engine amb Compose recent (qualsevol versió moderna serveix; el fitxer no fa servir `develop.watch`).
- Comprova amb `docker compose version`; si el teu plugin és molt vell, fes servir el `docker-compose` standalone amb les mateixes ordres (`docker-compose -f docker-compose.dev.yml ...`).

### Arrencada

```bash
cp .env.example .env          # opcional
pnpm dev:docker:up            # o: docker compose -f docker-compose.dev.yml up --build -d
pnpm dev:docker:logs          # opcional: seguir els logs de next dev
# obre http://localhost:3000
```

### Hot-reload
- El codi està **bind-mountejat** (`.:/app`): els canvis es reflecteixen a l'instant al contenidor i **Turbopack HMR** recarrega la pàgina sense reiniciar res.
- Si toques `prisma/schema.prisma`: crea la migració i **reinicia el servei** (`pnpm dev:docker:restart`).

### Migracions noves durant el dev

```bash
docker compose -f docker-compose.dev.yml exec web-dev pnpm prisma migrate dev --name <nom>
```

### Postgres dev
- `localhost:5434` (credencials `bloodbowl`/`bloodbowl`, db `bloodbowl`).

### AUTH_MODE
- `local` per defecte (sense login); `AUTH_MODE=auth` per provar el flux complet (requereix `AUTH_SECRET`).

### VS Code / Cursor
- Instal·la l'extensió **Dev Containers** i "Reopen in Container" (fa servir `.devcontainer/devcontainer.json`).

### Aturar

```bash
pnpm dev:docker:down          # conserva el volum de Postgres
```

---

## Qualitat

- **Unit + integration**: `pnpm test` (Vitest) — 200 fitxers / ~2900 tests.
- **E2E**: `pnpm run test:e2e` (local, `AUTH_MODE=local`, sense base de dades) i `pnpm run test:e2e:auth` (PostgreSQL real; requereix Docker).
- **Gates estàtics**: `pnpm lint` i `npx tsc --noEmit`; `pnpm build` és l'únic gate que executa el type-check de producció.
- **CI** (`.github/workflows/docker-publish.yml`): `pnpm test` → `pnpm lint` → `pnpm build`, i després publica la imatge a GHCR en `main`.
- **Gap conegut**: les suites de Playwright encara no estan connectades a la CI ([issue #271](https://github.com/Alountk/bloodbowl_project/issues/271)).

## Documentació

- [docs/auth.md](./docs/auth.md) — Auth, PostgreSQL, migracions, e2e auth, desplegament a Arcane.
- [ROADMAP.md](./ROADMAP.md) — Històric de features/bugs i roadmap pendent.
- [CONTRIBUTING.md](./CONTRIBUTING.md) — Com contribuir (branques, commits, PRs, tests).

## Llicència

MIT (vegeu [LICENSE](./LICENSE)).
