# Tasks: theme-selector

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~610 total (Slice A ~280 · Slice B ~330) |
| 400-line budget risk | High (change total; each slice < 400) |
| Chained PRs recommended | Yes (2 slices) |
| Suggested split | PR 1 = Slice A plumbing → PR 2 = Slice B UI |
| Delivery strategy | ask-on-risk |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

> ask-on-risk: orchestrator MUST ask the user for the chain strategy before `sdd-apply`. Either `stacked-to-main` or `feature-branch-chain` fits (Slice B depends on Slice A). Default suggestion: `stacked-to-main`.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Theme plumbing: column + resolver + provider + SSR + API | PR 1 | `pnpm test -- lib/theme app/api/me/route.test.ts features/profile/api.test.ts` | `pnpm db:generate`; local `GET /api/me` returns `theme`; `pnpm dev` → `<html data-theme>` painted SSR | Revert schema+migration+`lib/theme/`+`app/layout.tsx`+`app/api/me/route.ts`+`features/profile/api.ts`; cookie ignored by older builds |
| 2 | User-facing switching: switcher + AppNav + ProfilePanel + i18n | PR 2 | `pnpm test -- lib/theme/ThemeSwitcher.test.tsx components/AppNav.test.tsx features/profile/ProfilePanel.test.tsx` | `pnpm dev` → toggle in AppNav/ProfilePanel, reload, confirm persistence (session→account, anon→cookie) | Revert `lib/theme/ThemeSwitcher.tsx`+`components/AppNav.tsx`+`features/profile/ProfilePanel.tsx`+`lib/i18n/dictionaries.ts`; backend slice unaffected |

## Slice A — Theme plumbing (~280 lines)

- [x] 1.1 Add `theme String @default("vintage")` to the `User` model in `prisma/schema.prisma` (after `locale`). — UP-7
- [x] 1.2 Create `prisma/migrations/20260908000000_user_theme/migration.sql` with `ALTER TABLE "User" ADD COLUMN "theme" TEXT NOT NULL DEFAULT 'vintage';`. — UP-7
- [x] 1.3 Create `lib/theme/theme.ts`: `Theme`, `isTheme`, `DEFAULT_THEME`, `THEME_OPTIONS` (`labelKey` → i18n). — TS-1
- [x] 1.4 Create `lib/theme/serverTheme.ts`: `resolveServerTheme({dbTheme?, cookieTheme?}): Theme` with precedence db→cookie→`vintage`; invalid values ignored. — TS-2
- [x] 1.5 Create `lib/theme/serverTheme.test.ts`: precedence + invalid-ignored cases (mirror `serverLocale.test.ts`). — TS-1, TS-2
- [x] 1.6 Create `lib/theme/index.tsx` (`"use client"`): `ThemeProvider` + `useTheme` (fallback `DEFAULT_THEME` + noop), seed from `initialTheme`, effect writes `bb-theme` cookie + `data-theme` on `documentElement`. — TS-3, TS-5
- [x] 1.7 Create `lib/theme/index.test.tsx`: mount applies SSR theme; change syncs attribute + cookie; no localStorage. — TS-3, TS-5
- [x] 1.8 Modify `app/layout.tsx`: read `bb-theme`, extend DB `select` to `{locale:true, theme:true}`, render `<html data-theme={initialTheme} lang>`, mount `ThemeProvider`. — TS-2, TS-4
- [x] 1.9 Modify `app/api/me/route.ts`: `patchUserData` theme allowlist (vintage|scoreboard else 400), add `theme` to `allowedKeys`, GET/PATCH select + return `theme`. — UP-4, UP-7
- [x] 1.10 Modify `app/api/me/route.test.ts`: theme valid/invalid in `patchUserData` + GET/PATCH responses. — UP-4, UP-7
- [x] 1.11 Modify `features/profile/api.ts`: `Profile.theme?: Theme` + `patchMe({theme?})`. — UP-4
- [x] 1.12 Modify `features/profile/api.test.ts`: `patchMe({theme})` body + `Profile.theme` (optional keeps factories green). — UP-4

## Slice B — Theme UI (~330 lines)

- [x] 2.1 Create `lib/theme/ThemeSwitcher.tsx`: Vintage/Tablón toggle mirroring `LocaleSwitcher`; session→`patchMe({theme})`, anon→cookie only, failed PATCH keeps theme + `nav.themeError`. — AS-8
- [x] 2.2 Create `lib/theme/ThemeSwitcher.test.tsx`: anon→cookie (no PATCH), authed→PATCH, failed→error (mirror `LocaleSwitcher.test.tsx`). — AS-8
- [x] 2.3 Modify `components/AppNav.tsx`: mount `<ThemeSwitcher/>` in desktop right slot (beside `LocaleSwitcher`) + drawer. — AS-8
- [x] 2.4 Modify `components/AppNav.test.tsx`: switcher present desktop+drawer; `<nav>` link counts unchanged. — AS-8
- [x] 2.5 Modify `features/profile/ProfilePanel.tsx`: theme selector block (`data-testid="profile-theme"`, `aria-pressed`) beside locale. — UP-4, AS-8
- [x] 2.6 Modify `features/profile/ProfilePanel.test.tsx`: `profile-theme` group renders, PATCH on change, error on failure. — UP-4, AS-8
- [x] 2.7 Modify `lib/i18n/dictionaries.ts`: add 7 keys ES+EN (`nav.theme`, `nav.themeError`, `profile.theme.title/hint/error`, `theme.vintage`, `theme.scoreboard`). — AS-8
- [x] 2.8 Modify `ROADMAP.md`: mark "Selector de tema (UI)" shipped (link PRs). — cleanup

## Verification per slice

- Slice A: `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `pnpm db:generate`
- Slice B: `pnpm test`, `pnpm lint`, `npx tsc --noEmit`
- No e2e AUTH gate: this change does not touch auth. Optional additive `profile.spec` e2e (`AUTH_MODE=local pnpm exec playwright test`) may follow, not gated.

## Out of scope (do not touch)

`app/globals.css` (`[data-theme="scoreboard"]` vars already exist), JWT/session types, signup route, designLock/MatchView tests.
