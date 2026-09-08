```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:efebd7a6e9859f7420c5491d99405f9ee23e9d3311c3939fbdb55e5ee6f74ff8
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 8/8
scenarios: 23/23
test_command: pnpm test
test_exit_code: 0
test_output_hash: sha256:a55c073b6b26d97f5323d410be61ecc37bcf622315f4734daf2606ad930a22cf
build_command: pnpm build
build_exit_code: 0
build_output_hash: sha256:338cc5ac43bef4ff45ef2212f9ffcf50f855c92b65d09c4414dc68be5aa51657
```

# Verification Report — theme-selector

**Change**: theme-selector
**Version**: N/A (delta specs at `openspec/changes/theme-selector/specs/{theme-switching,user-profile,app-shell}/spec.md`)
**Mode**: Standard (no `strict_tdd` config; orchestrator did not declare STRICT TDD ACTIVE)
**Branch**: `main` @ `499fd4e` (PRs #183, #184, #185, #186 merged). Working tree clean except untracked `openspec/changes/theme-selector/`.
**Verification**: INDEPENDENT — source inspection against the real merged tree plus execution harness. No product code or tests modified.

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 20 |
| Tasks complete | 20 |
| Tasks incomplete | 0 |

Changed-file scope (git diff `7fc3f66^1..499fd4e`): 20 files, all inside the design's planned file list. Out-of-scope files untouched: `app/globals.css`, JWT/session types, signup route, `designLock.test.tsx`, `MatchView.test.tsx`, e2e specs.

## Build & Tests Execution

**Build**: ✅ Passed — `pnpm build` exit 0; "✓ Compiled successfully in 1676ms", 22/22 static pages generated.
**Tests**: ✅ 2306 passed (2306), 0 failed, 163 files — `pnpm test` (vitest run) exit 0, 23.59s.
**Type-check**: ✅ `npx tsc --noEmit` exit 0 (no output).
**Lint**: ✅ `pnpm lint` (eslint) exit 0, no findings.
**Prisma**: ✅ `pnpm db:generate` exit 0 — Prisma Client v6.19.3 generated. Migration SQL is additive (single `ALTER TABLE "User" ADD COLUMN "theme" TEXT NOT NULL DEFAULT 'vintage';`, no destructive statements).
**Playwright e2e (local)**: ⚠️ NOT RUN — environment: a user-owned dev server listens on :3000 (PID 60123) and another on :3001; `playwright.config.ts` hardcodes `baseURL`/`webServer.url` to `http://localhost:3000` (no alternate-port support) and `next dev` refuses a second instance for the same project. Static selector audit of the runnable local specs instead (see Warnings). e2e AUTH gate: N/A (no auth change).
**Runtime SSR probe (this verification)**: ✅ `next start -p 3100` on the production build (user servers untouched, probe server killed after):
- no cookie → `<html lang="en" data-theme="vintage">`
- `Cookie: bb-theme=scoreboard` → `<html lang="en" data-theme="scoreboard">`
- `Cookie: bb-theme=grimdark` (invalid) → `<html lang="en" data-theme="vintage">` (ignored)

**Coverage**: ➖ Not available — no coverage threshold configured.

## Spec Compliance Matrix

| Requirement | Scenario | Test / Evidence | Result |
|-------------|----------|-----------------|--------|
| TS-1 Theme Set | Default theme | `lib/theme/serverTheme.test.ts` (> defaults to vintage; THEME_OPTIONS) + SSR probe (no cookie → data-theme=vintage) | ✅ COMPLIANT |
| TS-1 Theme Set | Unknown theme rejected | `serverTheme.test.ts` (> ignores invalid: grimdark/VINTAGE/Tablón/…) + `app/api/me/route.test.ts` (> rejects invalid theme 400) + SSR probe (grimdark → vintage) | ✅ COMPLIANT |
| TS-2 Server Resolution | Account theme wins | `serverTheme.test.ts` (> prefers fresh DB account theme over cookie, both directions) | ✅ COMPLIANT |
| TS-2 Server Resolution | Anonymous cookie fallback | `serverTheme.test.ts` (> falls back to cookie) + SSR probe (bb-theme=scoreboard → data-theme=scoreboard) | ✅ COMPLIANT |
| TS-2 Server Resolution | Nothing set | `serverTheme.test.ts` (> vintage when nothing set) + SSR probe | ✅ COMPLIANT |
| TS-3 Theme Cookie | Cookie written on change | `lib/theme/index.test.tsx` (> syncs attribute+cookie, never localStorage) — asserts `bb-theme=scoreboard` + localStorage null; source `index.tsx:25-31` sets `path=/; max-age=31536000; SameSite=Lax` | ✅ COMPLIANT |
| TS-4 Anti-FOUC SSR | Initial HTML themed | Runtime SSR probe (verify-time): `<html data-theme="scoreboard">` served with cookie; layout `app/layout.tsx:84` renders `data-theme={initialTheme}` | ✅ COMPLIANT (probe evidence, see Warning 3) |
| TS-5 Client Sync | Mount applies SSR theme | `index.test.tsx` (> seeds from SSR initialTheme, applies data-theme + cookie on mount) | ✅ COMPLIANT |
| TS-5 Client Sync | Later change syncs attribute | `index.test.tsx` (> syncs data-theme + cookie on change; SSR value wins over stale cookie) | ✅ COMPLIANT |
| UP-7 Theme Field | Fresh user defaults vintage | `prisma/schema.prisma:31` `theme String @default("vintage")` + migration.sql `NOT NULL DEFAULT 'vintage'` (static DB-constraint evidence; dev-DB deploy pending, Warning 2) | ✅ COMPLIANT (static evidence) |
| UP-7 Theme Field | Additive migration | migration.sql inspection (single additive ALTER, no DROP/data loss) + `pnpm db:generate` exit 0 | ✅ COMPLIANT |
| UP-4 Current User API | Read own profile | `route.test.ts` (> selects and returns the account theme; GET returns id/name/email/avatar/locale/theme) | ✅ COMPLIANT |
| UP-4 Current User API | Update display name | `route.test.ts` (> updates the display name) | ✅ COMPLIANT |
| UP-4 Current User API | Clear avatar with null | `route.test.ts` (> clears the avatar with null) | ✅ COMPLIANT |
| UP-4 Current User API | External avatar URL rejected | `route.test.ts` (> rejects data:/external avatar 400, stored value unchanged) | ✅ COMPLIANT |
| UP-4 Current User API | Update locale | `route.test.ts` (> updates the account locale) | ✅ COMPLIANT |
| UP-4 Current User API | Update theme | `route.test.ts` (> updates the account theme; PATCH returns theme) | ✅ COMPLIANT |
| UP-4 Current User API | Invalid theme rejected | `route.test.ts` (> rejects invalid theme 400, leaves stored unchanged) + `patchUserData` unit test | ✅ COMPLIANT |
| AS-8 Theme Toggle | Desktop toggle present | `components/AppNav.test.tsx` (> mounts toggle in desktop right slot beside locale switcher; `<nav>` link counts unchanged) | ✅ COMPLIANT |
| AS-8 Theme Toggle | Drawer toggle present | `AppNav.test.tsx` (> mounts toggle in mobile drawer) | ✅ COMPLIANT |
| AS-8 Theme Toggle | Signed-in selection persists account | `lib/theme/ThemeSwitcher.test.tsx` (> authenticated click calls `patchMe({theme:"scoreboard"})` then flips provider + cookie) | ✅ COMPLIANT |
| AS-8 Theme Toggle | Anonymous selection persists cookie | `ThemeSwitcher.test.tsx` (> anonymous click writes cookie, no PATCH) + `index.test.tsx` cookie assertions | ✅ COMPLIANT |
| AS-8 Theme Toggle | Failed save surfaces error | `ThemeSwitcher.test.tsx` (> failed PATCH keeps current theme, surfaces `nav.themeError` ES/EN) | ✅ COMPLIANT |

**Compliance summary**: 23/23 scenarios compliant (22 with committed passing repo tests; TS-4 additionally proven by an independent verification-time runtime SSR probe; UP-7 fresh-user default proven by the DB DEFAULT constraint in schema + migration).

Additional UI evidence: `features/profile/ProfilePanel.test.tsx` (21 tests) covers the profile theme selector (bound-to-account, provider fallback while loading, PATCH reflect, provider apply data-theme+cookie, error keeps theme); `lib/i18n/i18n.test.tsx` (15) asserts ES/EN key parity including the 7 new theme keys.

## Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| TS-1 | ✅ Implemented | `lib/theme/theme.ts` — `Theme`, `isTheme`, `DEFAULT_THEME="vintage"`, `THEME_OPTIONS` with labelKey |
| TS-2 | ✅ Implemented | `lib/theme/serverTheme.ts:24-27` — db → cookie → vintage; invalid ignored; always concrete |
| TS-3 | ✅ Implemented | `lib/theme/index.tsx:25-31` — `bb-theme` cookie path=/, max-age=31536000, SameSite=Lax; no localStorage |
| TS-4 | ✅ Implemented | `app/layout.tsx:44,49-62,81-84` — reads `bb-theme`, single-PK select `{locale,theme}`, `<html data-theme={initialTheme}>` |
| TS-5 | ✅ Implemented | `lib/theme/index.tsx:42-67` — seeds from initialTheme, effect syncs attribute + cookie |
| UP-7 | ✅ Implemented | `prisma/schema.prisma:31` + `20260908000000_user_theme/migration.sql` (additive) |
| UP-4 | ✅ Implemented | `app/api/me/route.ts:61-74` theme allowlist (vintage\|scoreboard else 400), allowedKeys line 69, GET select 99, PATCH response 157; `features/profile/api.ts:22` `theme?: Theme`, `patchMe({theme?})` line 66-71 |
| AS-8 | ✅ Implemented | `lib/theme/ThemeSwitcher.tsx` (role=group, aria-label `nav.theme`, aria-pressed, session→PATCH/anon→cookie/error keeps theme); `components/AppNav.tsx:100` desktop right slot + `:184` drawer; `features/profile/ProfilePanel.tsx:256-290` `data-testid="profile-theme"` block |

## Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| Mirror RAU-58 locale end-to-end | ✅ Yes | resolver/provider/switcher/layout/API follow the locale pattern |
| `theme.ts` holds Theme/isTheme/DEFAULT_THEME/THEME_OPTIONS | ✅ Yes | consumed by resolver + client UI |
| `serverTheme.ts` pure resolver, cookie read stays in layout | ✅ Yes | `cookies()` in layout; resolver db→cookie→vintage |
| ThemeProvider + useTheme (fallback DEFAULT + noop) | ✅ Yes | mirrors `useI18n` |
| Switcher mirrors LocaleSwitcher (session/anon/error) | ✅ Yes | ThemeSwitcher + tests |
| No JWT/session change | ✅ Yes | DB fresh read covers account |
| `Profile.theme?: Theme` optional | ✅ Yes | keeps factories green |
| Single DB read in layout | ✅ Yes | extended select `{locale:true, theme:true}` |
| no suppressHydrationWarning | ✅ Yes | attribute applied in post-hydration effect matching SSR value |
| Cookie-only anonymous persistence | ✅ Yes | no localStorage |
| Slice splits (A plumbing / B UI) delivered stacked-to-main | ✅ Yes | PRs #183/#184/#185/#186, each < 400 lines |
| Deviations (apply-progress) | ✅ Documented | distinct `profile.theme.hint` copy (locale-test ambiguity); product labels via labelKey (Reglamento vintage / Tablón americano); ROADMAP provisional PR ref |

## Issues Found

**CRITICAL**: None.

**WARNING**:
1. Local Playwright e2e suite not executed: user-owned dev servers occupy :3000 (PID 60123) and :3001; `playwright.config.ts` hardcodes the baseURL/webServer to :3000 with no alternate-port option, and Next refuses a second `next dev` instance for the project. Static selector audit of the locally runnable specs (chromium project: `create-team.spec.ts`, `delete-team.spec.ts`; `mobile.spec.ts`; plus the name-qualified locale/rulesets header lookups) shows the added `ThemeSwitcher` group (`aria-label` "Tema"/"Theme") collides with no existing selector: locale.spec/rulesets.spec use `getByRole("group", { name: /Idioma|Language/ })`, mobile.spec asserts only drawer links, create/delete-team touch no header groups, and none of the new theme labels ("Reglamento vintage", "Tablón americano", "Vintage rulebook", "Scoreboard") appear in any e2e assertion. Apply-baseline also documents pre-existing local e2e failures on clean main (stale anonymous-session dialog).
2. The additive migration is committed but NOT yet deployed to the local docker dev DB (`bloodbowl_web-postgres-1`, port 5433, db `bloodbowl`): `_prisma_migrations` has no `user_theme` row and `User.theme` does not exist there. `pnpm db:generate` passes and the SQL is additive, so this is an environment/deploy step (run `pnpm db:migrate` against that container / dev-docker), not a code defect. Until deployed, signed-in GET/PATCH `/api/me` against that dev DB errors on the theme select; the root layout is try/catch-guarded.
3. TS-4 (SSR `data-theme`) has no committed repo test asserting the layout's server-rendered HTML; it was proven at verification time by a runtime SSR probe (`next start -p 3100`). UP-7 (fresh user defaults vintage) is proven by the DB DEFAULT constraint in schema + migration rather than a DB round-trip (which requires deploying the migration).

**SUGGESTION**:
1. Update ROADMAP line 40's provisional reference `PR 2 (feat/theme-selector-slice-b)` to the merged `#185/#186` (docs-only; orchestrated at archive/docs time).
2. Add a committed SSR assertion (layout render test or an additive e2e `data-theme` check) so TS-4 becomes self-verifying in CI.
3. After `pnpm db:migrate` on the dev container, run the optional DB-backed `profile.spec` e2e to close the session→account persistence round trip.

## Verdict

**PASS WITH WARNINGS** — implementation matches the spec (8/8 requirements, 23/23 scenarios), all tasks complete, full test/lint/type/build harness green on `main`; the three warnings are environmental/deploy or evidence-robustness items, none a code defect or regression.

## Command Evidence

- `pnpm test`: exit 0 — 2306/2306 passed (163 files) · output sha256 a55c073b6b26d97f5323d410be61ecc37bcf622315f4734daf2606ad930a22cf
- `pnpm lint`: exit 0 — no findings · output sha256 85b37f071cd58af45049ea2371c5b16c077b6d0eb5997fc63e5c3888a5f1b639
- `npx tsc --noEmit`: exit 0 — no errors · output sha256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 (empty)
- `pnpm build`: exit 0 — Compiled successfully, 22/22 static pages · output sha256 338cc5ac43bef4ff45ef2212f9ffcf50f855c92b65d09c4414dc68be5aa51657
- `pnpm db:generate`: exit 0 — Prisma Client v6.19.3 generated
- SSR probe: `next start -p 3100` → HTTP 200; anon/scoreboard/invalid cookies → data-theme vintage/scoreboard/vintage (probe server stopped; user servers on :3000/:3001 untouched)
- `AUTH_MODE=local pnpm exec playwright test`: NOT RUN (environment limitation documented above); e2e AUTH gate N/A (no auth change)
