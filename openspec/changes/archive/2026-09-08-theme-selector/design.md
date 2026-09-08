# Design: theme-selector

## Technical Approach

Mirror RAU-58 `locale` end-to-end, scoped to the lighter theme problem: `User.theme` (additive, default `vintage`) → `lib/theme/` resolver/provider/switcher → SSR `data-theme` on `<html>` (anti-FOUC) → GET/PATCH `/api/me` allowlist → switcher in AppNav + selector in ProfilePanel. No JWT, no signup inheritance, no localStorage, no accept-language (both themes are light; `vintage` is the uniform default).

## Architecture Decisions

| Decision | Option | Tradeoff | Choice |
|---|---|---|---|
| Theme type location | `lib/theme/theme.ts` (shared const + type) | THEME_OPTIONS is consumed by both client components AND server resolver, unlike locale where LOCALE_OPTIONS is inlined per component | **`theme.ts`** holds `Theme`, `isTheme`, `DEFAULT_THEME`, `THEME_OPTIONS` |
| Resolver | `lib/theme/serverTheme.ts` | pure `resolveServerTheme(db→cookie→vintage)`; no `readThemeFromRequest` needed (cookie read stays in layout via `cookies()`, like locale) | **`serverTheme.ts`** |
| Provider | `lib/theme/index.tsx` ("use client") | mirrors `I18nProvider`: seed from SSR `initialTheme`, effect writes cookie + sets `documentElement` `data-theme` | **`ThemeProvider` + `useTheme`** (fallback `DEFAULT_THEME` + noop, like `useI18n`) |
| Switcher | `lib/theme/ThemeSwitcher.tsx` | mirrors `LocaleSwitcher`: session→`patchMe({theme})`, anonymous→cookie only, failed PATCH keeps theme + `nav.themeError` | **`ThemeSwitcher`** |
| JWT theme | skip | no client consumer; DB fresh-read covers account; `vintage` default covers DB-fail case | **no JWT/session/type change** |
| `Profile.theme` | optional | test factories/fixtures (api.test, ProfilePanel factory) stay green without edits | **`theme?: Theme`** |
| DB read in layout | extend existing `select:{locale:true}` → `{locale:true, theme:true}` | one PK lookup, not two | **single read** |
| suppressHydrationWarning | not needed | attribute is set in a post-hydration `useEffect` matching the SSR value; `<html>` is outside the client hydration boundary; locale pattern uses none | **no flag** |

## Data Flow

```
SSR (layout)                              Client
db theme ─┐
cookie    ─┼─► resolveServerTheme ─► <html data-theme lang>
           │                                  │ initialTheme
           └──────────────────────────────────┼─► ThemeProvider(seed)
                                              │      │ useEffect: setAttribute + cookie
          PATCH /api/me (validated)  ◄── ThemeSwitcher/ProfilePanel ─► setTheme ─► cookie + data-theme
```

## File Changes

| File | Action | Description |
|---|---|---|
| `prisma/schema.prisma` | Modify | `User.theme String @default("vintage")` after `locale` |
| `prisma/migrations/20260908000000_user_theme/migration.sql` | Create | `ALTER TABLE "User" ADD COLUMN "theme" TEXT NOT NULL DEFAULT 'vintage';` |
| `lib/theme/theme.ts` | Create | type, `isTheme`, `DEFAULT_THEME`, `THEME_OPTIONS` (labelKey → i18n) |
| `lib/theme/serverTheme.ts` | Create | `resolveServerTheme` (db→cookie→vintage) |
| `lib/theme/index.tsx` | Create | `ThemeProvider` + `useTheme` (client) |
| `lib/theme/ThemeSwitcher.tsx` | Create | toggle Vintage/Tablón (mirrors LocaleSwitcher) |
| `app/layout.tsx` | Modify | read `bb-theme`, extend DB select, `data-theme={initialTheme}`, mount provider |
| `app/api/me/route.ts` | Modify | validate `theme` allowlist, GET select + PATCH response |
| `features/profile/api.ts` | Modify | `Profile.theme?`, `patchMe({theme?})` |
| `features/profile/ProfilePanel.tsx` | Modify | theme selector block (mirrors locale) |
| `components/AppNav.tsx` | Modify | `<ThemeSwitcher/>` desktop right slot + drawer |
| `lib/i18n/dictionaries.ts` | Modify | 7 keys × ES/EN |

## Interfaces / Contracts

```ts
// lib/theme/theme.ts
export type Theme = "vintage" | "scoreboard";
export const DEFAULT_THEME: Theme = "vintage";
export const THEME_OPTIONS = [
  { value: "vintage", labelKey: "theme.vintage" },
  { value: "scoreboard", labelKey: "theme.scoreboard" },
] as const;
export function isTheme(v: unknown): v is Theme;

// lib/theme/serverTheme.ts
resolveServerTheme({ dbTheme?, cookieTheme? }): Theme  // always concrete

// features/profile/api.ts
interface Profile { /* … */ theme?: Theme }
patchMe({ theme?: Theme })

// route.ts — patchUserData gains:
//   current: { …, theme?: string | null }
//   theme block: vintage|scoreboard else 400 'theme must be "vintage" or "scoreboard"'
//   allowedKeys += "theme"
```

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit | `serverTheme.ts` | precedence db>cookie>vintage, invalid ignored (mirror serverLocale.test) |
| Unit | `patchUserData` | theme valid/invalid (mirror locale cases) |
| Unit | `features/profile/api.ts` | `patchMe({theme})` body + `Profile.theme` |
| Component | `ThemeSwitcher` | mock `patchMe`; anon→cookie no PATCH, authed→PATCH, failed→error (mirror LocaleSwitcher.test) |
| Component | `ProfilePanel` | new `profile-theme` group, PATCH/error (mirror locale block) |
| Component | `AppNav` | switcher present desktop+drawer; link counts in `<nav>` unchanged (buttons outside nav) |
| E2E | profile.spec | theme persists account/cookie (additive, no existing assertions break) |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

Additive migration, no data destroyed, `NOT NULL DEFAULT 'vintage'`. Per-PR git revert (UI first, backend). Cookie `bb-theme` ignored by older builds.

## Slices / PRs (~630 lines, budget 400/PR)

- **Slice A — plumbing** (~280): schema + migration, `theme.ts`/`serverTheme.ts`/`index.tsx` + tests, `layout.tsx` SSR, `/api/me` + tests, `features/profile/api.ts` + test. Autonomous: column + resolution + provider exist, SSR paints `data-theme`. Commits: schema+migration → resolver+test → provider+test → layout → api+test.
- **Slice B — UI** (~330): `ThemeSwitcher.tsx` + test, `AppNav.tsx`, `ProfilePanel.tsx` + test, `dictionaries.ts` keys. Autonomous: full user-facing switching. Commits: switcher+test → AppNav → ProfilePanel+test → i18n.

## Open Questions

- [ ] None blocking — delivery strategy (`ask-on-risk` default) must be resolved by orchestrator before `sdd-apply`.
