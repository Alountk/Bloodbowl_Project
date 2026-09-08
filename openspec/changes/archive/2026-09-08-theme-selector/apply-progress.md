# Apply Progress: theme-selector (cumulative — Slice A + Slice B)

**Phase**: sdd-apply · **Slices**: A (theme plumbing) + B (theme UI)
**Branches**: `feat/theme-selector-slice-a` (PRs #183 + #184, merged to `main`) → `feat/theme-selector-slice-b` (4 commits on `main`, PR 2)
**Mode**: Strict TDD (vitest runner, jsdom) · **Store**: hybrid
**Status**: **20/20 tasks `[x]`** (Slice A 12/12 + Slice B 8/8) — implementation complete; openspec artifacts uncommitted (orchestrator manages docs commit).

---

# SLICE A — Theme plumbing (PR 1, merged via #183 + #184)

**Status (Slice A)**: 12/12 tasks `[x]` — data + pipeline + API layer.

## Executive Summary (Slice A)

Implemented the theme-selector data + pipeline + API layer per spec TS-1..TS-5, UP-4, UP-7:
`User.theme` additive column + migration (default `vintage`) → `lib/theme/` domain
(`theme.ts`, `serverTheme.ts` resolver, client `ThemeProvider`/`useTheme`) → SSR
`<html data-theme>` in `app/layout.tsx` (anti-FOUC) → `/api/me` GET/PATCH theme
allowlist → `Profile.theme?` + `patchMe({theme?})` in `features/profile/api.ts`.
No UI layer touched (ThemeSwitcher/AppNav/ProfilePanel/dictionaries were Slice B).

## Completed Tasks (Slice A)

- [x] 1.1 User.theme in prisma/schema.prisma
- [x] 1.2 prisma/migrations/20260908000000_user_theme/migration.sql
- [x] 1.3 lib/theme/theme.ts (Theme, isTheme, DEFAULT_THEME, THEME_OPTIONS)
- [x] 1.4 lib/theme/serverTheme.ts (resolveServerTheme db→cookie→vintage)
- [x] 1.5 lib/theme/serverTheme.test.ts
- [x] 1.6 lib/theme/index.tsx (ThemeProvider + useTheme)
- [x] 1.7 lib/theme/index.test.tsx
- [x] 1.8 app/layout.tsx (SSR data-theme + bb-theme cookie + ThemeProvider mount)
- [x] 1.9 app/api/me/route.ts (theme allowlist + select + return)
- [x] 1.10 app/api/me/route.test.ts
- [x] 1.11 features/profile/api.ts (Profile.theme?, patchMe theme)
- [x] 1.12 features/profile/api.test.ts

## Commits (Slice A work units)

| Commit | Work unit | Changed lines |
|--------|-----------|---------------|
| f000298 | feat(db): User.theme column + additive migration | 10 |
| d4d0e46 | feat(theme): theme domain types + SSR resolver (+test) | 115 |
| d827b5c | feat(theme): client ThemeProvider + useTheme (+test) | 190 |
| 95d219a | feat(theme): data-theme in root layout SSR | 23 |
| faf3543 | feat(api): allowlist + return theme via /api/me (+test) | 142 |
| 4a90534 | feat(profile): Profile.theme? + patchMe theme (+test) | 42 |

**Slice A total**: 12 files, **522 changed lines** (501 insertions + 21 deletions). Delivered to `main` as stacked PRs **#183** (1a plumbing, f000298..95d219a) + **#184** (1b API, faf3543..4a90534), per the apply-progress workload recommendation.

## Work Unit Evidence (Slice A)

| Evidence | Required value |
|---|---|
| Focused test command & result | `pnpm test lib/theme/serverTheme.test.ts lib/theme/index.test.tsx app/api/me/route.test.ts features/profile/api.test.ts` → 45/45 passed (7+6+25+7). Full suite `pnpm test` → **2292/2292 passed** (162 files); baseline 2273 — +19 new tests |
| Runtime harness | `pnpm db:generate` → Prisma Client generated OK. `pnpm build` → "Compiled successfully", 22/22 static pages generated. DB-backed manual checks (`GET /api/me` returns theme; `pnpm dev` painted `<html data-theme>`) NOT executed: no running Postgres in apply env; local Playwright failing pre-existing on clean `main`. Recommended as the sdd-verify runtime check with Docker DB |
| Rollback boundary | Revert `prisma/schema.prisma` + `prisma/migrations/20260908000000_user_theme/` + `lib/theme/` + `app/layout.tsx` + `app/api/me/route.ts` + `features/profile/api.ts` (commits f000298..4a90534). Cookie `bb-theme` ignored by older builds; migration additive with NOT NULL DEFAULT |

---

# SLICE B — Theme UI (PR 2, branch feat/theme-selector-slice-b)

**Status (Slice B)**: 8/8 tasks `[x]` — full user-facing switching.

## Executive Summary (Slice B)

Implemented the theme-selector UI layer per AS-8 / UP-4 (UI half):
`lib/theme/ThemeSwitcher.tsx` (auth-aware toggle mirroring `LocaleSwitcher`: session →
`patchMe({theme})` + provider apply; anonymous → provider + `bb-theme` cookie only; failed
PATCH keeps the theme and surfaces `nav.themeError`) → mounted in `AppNav` desktop right slot
(beside `LocaleSwitcher`, outside `<nav>`) and in the mobile drawer → a theme selector block in
`ProfilePanel` (`data-testid="profile-theme"`, `role="group"`, `aria-pressed`; account theme from
GET /api/me with provider fallback while loading; PATCH on change + provider flip) → 7 new i18n
keys × ES/EN with product naming (**Reglamento vintage / Tablón americano**, **Vintage rulebook /
Scoreboard** per ROADMAP + globals.css + theme.ts comments) → ROADMAP row moved to Completado.
`THEME_OPTIONS.labelKey` needed no change (design's "only if required" case did not trigger).

## Completed Tasks (Slice B)

- [x] 2.1 lib/theme/ThemeSwitcher.tsx (Vintage/Tablón toggle; session→patchMe, anon→cookie, error keeps theme + nav.themeError)
- [x] 2.2 lib/theme/ThemeSwitcher.test.tsx (anon→cookie no PATCH, authed→PATCH, failed→error)
- [x] 2.3 components/AppNav.tsx (ThemeSwitcher desktop right slot beside LocaleSwitcher + drawer)
- [x] 2.4 components/AppNav.test.tsx (switcher present desktop+drawer; `<nav>` link counts unchanged)
- [x] 2.5 features/profile/ProfilePanel.tsx (theme block `profile-theme` beside locale, aria-pressed)
- [x] 2.6 features/profile/ProfilePanel.test.tsx (group renders, PATCH on change, error on failure)
- [x] 2.7 lib/i18n/dictionaries.ts (7 keys × ES/EN)
- [x] 2.8 ROADMAP.md (theme selector marked shipped, row moved to Completado)

## Commits (Slice B work units, branch feat/theme-selector-slice-b)

| Commit | Work unit | Changed lines |
|--------|-----------|---------------|
| 2bfeae3 | feat(theme): auth-aware ThemeSwitcher nav toggle (+test, nav.theme/theme.* dict keys) | 216 |
| 67c24d2 | feat(ui): mount ThemeSwitcher in AppNav desktop slot + drawer (+tests) | 47 |
| 771dd2e | feat(profile): theme selector block in ProfilePanel (+tests, profile.theme.* dict keys) | 180 |
| 1a90dd4 | docs(roadmap): mark theme selector shipped, drop from planned | 2 |

**Slice B total (main...HEAD)**: 8 files, **445 changed lines** (439 insertions + 6 deletions).

## Work Unit Evidence (Slice B)

| Evidence | Required value |
|---|---|
| Focused test command & result | `pnpm exec vitest run lib/theme/ThemeSwitcher.test.tsx components/AppNav.test.tsx features/profile/ProfilePanel.test.tsx lib/i18n/i18n.test.tsx` → ThemeSwitcher 6/6 · AppNav 13/13 (10 existing + 3 new) · ProfilePanel 21/21 (16 existing + 5 new) · i18n parity 15/15. Full suite `pnpm test` → **2306/2306 passed** (163 files); Slice A end-state 2292 — **+14 new tests** |
| Runtime harness | Client-UI-only slice: no new server boundary. Browser-level persistence round-trip (`pnpm dev` → toggle in AppNav/ProfilePanel, reload, confirm session→account vs anon→cookie) NOT executed in the apply env (no Postgres/server run); component layer proves the flows with mocked `patchMe` + real provider cookie/`data-theme` writes (document.cookie + documentElement.dataset asserted). Recommended as the sdd-verify runtime check with Docker DB |
| Rollback boundary | Revert commits 2bfeae3..1a90dd4 (`lib/theme/ThemeSwitcher.tsx` + test, `components/AppNav.tsx` + test, `features/profile/ProfilePanel.tsx` + test, `lib/i18n/dictionaries.ts` theme keys, `ROADMAP.md`) — Slice A (schema/migration, resolver/provider base, layout, /api/me, `features/profile/api.ts`) unaffected; stale `bb-theme` cookie ignored by the removed UI |

## TDD Cycle Evidence (Slice B)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 2.1+2.2 (+ nav.theme/theme.* keys) | `lib/theme/ThemeSwitcher.test.tsx` | Unit/component | ✅ 54/54 (5 touched files) | ✅ module-not-found (6 tests) | ✅ 6/6 | ✅ 6 cases: active×2 states, anon→cookie no PATCH, authed→PATCH, es error, en error, ignore active | ✅ Clean |
| 2.3+2.4 | `components/AppNav.test.tsx` | Component | ✅ suite green | ✅ 2 failed (group "Tema" absent) | ✅ 13/13 | ✅ desktop + drawer + nav-count regression guards (3 new) | ✅ stale drawer doc comment refreshed |
| 2.5+2.6 (+ profile.theme.* keys) | `features/profile/ProfilePanel.test.tsx` | Component | ✅ 54/54 pre-edit | ✅ 5 failed (group absent) | ✅ 21/21 | ✅ 5 new: bound-to-account, provider fallback while loading, PATCH reflect, provider apply (data-theme + cookie), error keeps theme | ✅ distinct theme hint copy — duplicate locale hint broke existing locale test (ambiguity) |
| 2.7 | dictionaries parity via `lib/i18n/i18n.test.tsx` | Unit | ✅ 54/54 | ➖ cumulative (keys landed with their component steps; copy asserted by component tests) | ✅ key-for-key es/en sync 15/15 | ✅ es + en added per key in lockstep | ✅ Clean |
| 2.8 | (ROADMAP doc) | n/a | ✅ suite green | ➖ no logic | ✅ suite green post-commit | ➖ Skipped: docs only | ✅ Clean |

### Test Summary (Slice B)

- **Total tests written**: 14 (ThemeSwitcher 6 · AppNav +3 · ProfilePanel +5)
- **Total tests passing**: 2306/2306 (full suite) · focused files all green
- **Layers used**: Unit/component (14)
- **Approval tests** (refactoring): none needed — no behavior-preserving refactor tasks; existing locale-selector tests acted as regression guards (one caught the duplicate-hint ambiguity)
- **Pure functions created**: none new (toggle/selector handlers are thin component state; real side effects stay in `patchMe`/provider as designed)

## Deviations from Design (Slice B)

1. **Line budget**: Slice B measured **445** changed lines vs forecast ~330. Nothing was cut — mirror-pattern component tests (ThemeSwitcher 127 + ProfilePanel +110 = 237 of the 445) carry the weight and are spec-required (AS-8 scenarios). See Workload for the PR-boundary options.
2. **`profile.theme.hint` copy is NOT the locale hint copy**: design said mirror the locale block, but reusing "Se aplicará a tu cuenta…" for two stacked blocks made the existing locale test ambiguous (getByText matched two `<p>`). Chose descriptive distinct copy: ES "Cambia el aspecto: Reglamento vintage o Tablón americano." / EN "Choose the app look: Vintage rulebook or Scoreboard."
3. **Theme labels follow ROADMAP/globals.css product naming** (Reglamento vintage / Tablón americano; Vintage rulebook / Scoreboard) rather than the shorter AS-8 shorthand labels ("Vintage"/"Tablón") — the spec scenario wording was shorthand; dictionary copy matches the shipped product vocabulary. `theme.vintage`/`theme.scoreboard` keys used by both ThemeSwitcher and ProfilePanel via `THEME_OPTIONS.labelKey` (no `theme.ts` change).
4. **ROADMAP row references the unmerged PR**: no PR number exists yet for the UI slice, so the Completado row links `#183, #184` (merged) + `PR 2 (feat/theme-selector-slice-b)` (follows the file's raw-ref precedent, e.g. line 25 commit refs). Orchestrator/branch-pr may append the PR number after creation.

## Workload / PR Boundary (Slice B)

- **Mode**: chained PR slice (Slice B as PR 2, `size:exception` candidate — see below)
- **Current work unit**: Slice B complete (4 commits) — start: `main@236ce46`, end: `1a90dd4`
- **Estimated review budget impact**: **445 changed lines — exceeds the 400 budget** (forecast ~330). Recommend `size:exception` for PR 2, OR split the existing branch history into two stacked PRs (commits already group cleanly, no code changes): **PR 2a switcher+shell** = 2bfeae3..67c24d2 (~263 lines: ThemeSwitcher + AppNav + nav.theme/theme.* dict keys) and **PR 2b profile** = 771dd2e..1a90dd4 (~182 lines: ProfilePanel block + profile.theme.* keys + ROADMAP). Both fit under 400; 2b depends on 2a (label keys + THEME_OPTIONS).
- Slice A already merged via #183/#184; this batch contains NO Slice A code.

## Verification Commands (Slice B, per tasks.md)

- `pnpm test`: ✅ **2306 passed (163 files), 0 failed** (also run by each commit's pre-commit hook)
- `pnpm lint`: ✅ exit 0, no findings
- `npx tsc --noEmit`: ✅ exit 0, no errors
- e2e AUTH gate: N/A (no auth change)
- `pnpm db:generate` / e2e local suite: N/A for this slice (no schema/server change; Playwright fails pre-existing on clean `main` — see Risks)

## Risks

1. **445 > 400 line budget** for PR 2 as planned (see Workload). Options: `size:exception`, or the 2a/2b stacked split described above — orchestrator decision before branch-pr.
2. **Local Playwright suite fails on clean `main`** (pre-existing/environmental, proven by Slice A stash-baseline: stale anonymous-session "Log in" dialog). Not gated by this change's verify; optional additive `profile.spec` e2e may run later.
3. **ROADMAP PR reference for the UI slice is provisional** (`PR 2 (feat/theme-selector-slice-b)`) until the PR exists — branch-pr may finalize.
4. **jsdom cannot prove visual fit**: the longer theme labels in the compact nav toggle ("Reglamento vintage"/"Tablón americano" at `text-xs`) are not asserted by unit tests; visual/overflow check belongs to a manual or e2e pass at verify.

## Next

- `sdd-verify` for the FULL change (Slice A + B unit evidence + optional DB-backed runtime: `pnpm dev` → toggle in AppNav/ProfilePanel, reload, session→account / anon→cookie persistence; `data-theme` SSR) after the orchestrator resolves the PR-2 budget question (size:exception vs 2a/2b split).
- Then `sdd-archive` (reconcile consolidated specs with the shipped behavior).

## Key Learnings

1. The theme-selector locale mirror lives in `lib/i18n/`, not `lib/locale/` as the design text suggested.
2. Vitest transpiles without type-checking, so type-contract RED for `patchMe({theme})` must be proven with `tsc --noEmit`, not vitest.
3. Mirroring a UI block verbatim can break existing tests when the copy duplicates an adjacent block (identical profile.locale/theme hint text → ambiguous `getByText`); new blocks need distinct descriptive copy.
4. The local Playwright e2e suite fails identically on clean `main` — always stash-baseline before blaming a change.
5. Mirror-pattern component tests (switcher/panel) again push the Slice B diff over its ~330 forecast to 445; report honestly and offer a 2a/2b stacked split instead of trimming spec-required coverage.
6. Theme UI labels resolve through `THEME_OPTIONS.labelKey` → shared `theme.vintage`/`theme.scoreboard` keys, so ThemeSwitcher and ProfilePanel stay in sync with zero `theme.ts` changes.
