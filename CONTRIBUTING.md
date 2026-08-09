# Contributing

¡Gracias por contribuir a **Bloodbowl Teams**! Estas son las convenciones del proyecto.

## Flujo de trabajo

1. **Branches**: `type/descripcion-corta` — `feat/`, `fix/`, `chore/`, `refactor/`, `test/`, `docs/` (lowercase, guiones).
2. **Commits**: [Conventional Commits](https://www.conventionalcommits.org/) — `type(scope): descripción`. Sin `Co-Authored-By`.
3. **PRs**: uno por feature/fix, con descripción, tabla de cambios y test plan. Usá la plantilla de PR.
4. **Tests obligatorios**: toda PR debe pasar:
   - `pnpm test` (unit + integration)
   - `AUTH_MODE=local pnpm exec playwright test` (e2e local)
   - `pnpm lint` · `npx tsc --noEmit`
   - Si toca auth/ligas: `pnpm run test:e2e:auth` (requiere Docker + Postgres)
5. **CI**: GitHub Actions corre tests + build de la imagen en cada PR. En push a `main` publica la imagen a GHCR.

## Convenciones del repo

### Cambios grandes (SDD)
Para features/refactors sustanciales usamos **Spec-Driven Development (SDD)** — los artefactos viven en `openspec/changes/<change>/` y las specs consolidadas en `openspec/specs/`. Fases: proposal → specs → design → tasks → apply → verify → archive. Cada cambio grande se entrega en **PRs encadenados** (stacked-to-main, slices < 400 líneas).

### Frontend
- Rutas solo en `app/`; lógica de features en `features/<dominio>/`.
- Tests colindantes `*.test.ts(x)`.
- Alias `@/` → raíz del repo.
- Diseño "rulebook light": tokens `#12225a` (navy), `#d11938` (rojo), `#f8fafc` (fondo), paneles blancos cuadrados. No introduzcas variantes nuevas de color/sombra.
- Copy de UI: el detalle/creación/ligas están en español; la home y algunos chrome en inglés. Mantené el idioma de la sección que tocas.

### Backend / datos
- **Nunca confíes solo en validación del frontend**: las reglas de negocio (mínimo 11 jugadores, guards de liga, scoping por usuario) se validan también en las API routes.
- Recursos por usuario: `findFirst` por owner → 404 (sin leak de existencia).
- Reglas duras (mínimo/máximo de jugadores, locks de liga) en el **servidor**.
- Migraciones Prisma: aditivas; el contenedor aplica `prisma migrate deploy` solo.

## Entorno local

```bash
pnpm install
cp .env.example .env.development.local   # DATABASE_URL, AUTH_SECRET, AUTH_TRUST_HOST, AUTH_MODE
docker compose up -d postgres
pnpm db:generate && pnpm db:migrate
pnpm dev                                  # http://localhost:3000
```

Ver [README.md](./README.md) y [docs/auth.md](./docs/auth.md).

## Reportar bugs / pedir features

Usá las plantillas de issues (bug report / feature request). Incluí: pasos para reproducir, comportamiento esperado vs actual, y si afecta solo a producción (LAN/Arcane) o también a local — **si solo es producción, verificá que el contenedor tenga la imagen `latest`** (muchos bugs "persistentes" son imagen vieja).

## Trabajo con agentes de IA

Este repo está preparado para que los agentes (OpenCode, Cursor, Codex, etc.) trabajen con las mismas convenciones:

- **`AGENTS.md`** (raíz): reglas no negociables (commits, tests, reglas de negocio server-side, SDD, diseño, idiomas). Los agentes lo leen automáticamente.
- **`.opencode/skills/`**: skills del flujo versionados en el repo (SDD, branch-pr, chained-pr, work-unit-commits, etc.) — cualquier dev que clone el repo tiene el mismo comportamiento. Si actualizás un skill global, considerá sincronizarlo al repo.
- **`ROADMAP.md`** / **`README.md`** / **`docs/auth.md`**: contexto para los agentes.

Regla práctica para los agentes: **antes de asumir que un bug persiste, verificá si es imagen vieja en producción** (ver CONTRIBUTING).
