# Bloodbowl Teams — Agent Guide

Project: Blood Bowl 2025 team manager (teams, leagues, championships, matchday scheduling).
Stack: Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind v4 · Prisma + PostgreSQL · Auth.js v5 (Credentials + JWT, bcryptjs) · Vitest + Playwright · Docker/GHCR.

## Non-negotiable rules

1. **Conventional Commits only** — `type(scope): description` (`feat`, `fix`, `chore`, `test`, `docs`, `refactor`). NEVER add `Co-Authored-By` or AI attribution.
2. **Tests must stay green** — before finishing any task run:
   - `pnpm test` (Vitest unit+integration)
   - `AUTH_MODE=local pnpm exec playwright test` (local e2e)
   - `pnpm lint` and `npx tsc --noEmit`
   - If you touch auth/leagues/matchday: `pnpm run test:e2e:auth` (needs Docker + Postgres)
   The e2e suites assert exact labels/regions/aria — do not break them; update tests only when the behavior intentionally changes.
3. **Business rules live server-side** — never trust frontend-only validation. Enforce in API routes: minimum 11 players, league guards, user scoping (`findFirst` by owner → 404, no existence leak), 401/403/404/409 semantics.
4. **SDD for substantial changes** — follow the Spec-Driven Development flow documented in `CONTRIBUTING.md`: artifacts in `openspec/changes/<change>/`, specs consolidated in `openspec/specs/`. Deliver large changes as stacked PRs (slices < 400 lines). Check `openspec/specs/` for existing requirements before changing behavior.
5. **Design system is "rulebook light"** — tokens: `#12225a` (navy), `#d11938` (red), `#f8fafc` (background), white square panels. Do not introduce new color/shadow variants.
6. **Localization** — reply to the user in their language. Generated technical artifacts (code, comments, specs, docs) default to English. UI copy: detail/creation/leagues are Spanish; home chrome is English — match the section you touch.

## Workflow

- Branch: `type/description` from `main`. One PR per feature/fix with the PR template.
- Before assuming a bug persists, check if it's a stale deploy: in production (Arcane) many "fixed" bugs are old images — verify `docker compose pull web && docker compose up -d --force-recreate web` and that CI published the image.
- Read `README.md`, `ROADMAP.md`, `docs/auth.md` for context. `ROADMAP.md` lists planned features (live match, standings, avatars/profile, notifications).

## Skills

The repo versions the workflow skills in `.opencode/skills/` (SDD phases, branch-pr, chained-pr, work-unit-commits, etc.). Load the matching skill before task-specific work — they encode the project's phase contracts.

## Stack notes

- Next.js 16 uses `proxy.ts` (NOT `middleware.ts`) for route protection.
- Auth.js v5 Credentials forces JWT strategy; sessions live in a signed cookie. `AUTH_MODE=local` = anonymous (LocalStorage), `AUTH_MODE=auth` = login + Postgres.
- Prisma client must be generated before tests (`pnpm db:generate`); migrations are additive.
- The repo has no jest-dom matchers — use `.textContent`/regex assertions in component tests.
