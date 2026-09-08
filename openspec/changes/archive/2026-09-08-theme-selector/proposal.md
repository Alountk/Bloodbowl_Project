# Proposal: theme-selector

## Intent

ROADMAP "Selector de tema (UI)": Reglamento vintage is default; Tablón (`[data-theme="scoreboard"]`) is reachable only by manually setting the attribute. Ship UI to switch themes per account, mirroring the RAU-58 `User.locale` pattern.

**Confirmed decisions** (user 2026-09-08; exploration obs #762): per-account DB column + cookie (NO localStorage); controls on BOTH AppNav (desktop + drawer) and ProfilePanel; ONLY `vintage`/`scoreboard` (Grimdark dropped); no JWT theme; no signup inheritance.

## Scope

### In Scope
- Additive `User.theme` column + migration (`NOT NULL DEFAULT 'vintage'`).
- `lib/theme/`: server resolver, client ThemeProvider, ThemeSwitcher; SSR `data-theme` in layout (anti-FOUC).
- GET/PATCH `/api/me` validates/allowlists `theme`; `Profile.theme` (optional) + `patchMe`.
- Selector in ProfilePanel (next to locale) + toggle in AppNav desktop and drawer.
- i18n keys ES+EN; unit/e2e tests.

### Out of Scope
- JWT theme snapshot; signup inheritance; Grimdark; localStorage; token restyle (existing `@theme` overrides reused).

## Capabilities

### New Capabilities
- `theme-switching`: theme set {vintage, scoreboard}; server resolution db→cookie→`vintage`; cookie `bb-theme`; SSR `data-theme`; client ThemeProvider sync.

### Modified Capabilities
- `user-profile`: `User` gains `theme`; Current User API returns/accepts it (repo spec lists only name/avatar — delta MUST reconcile the locale already shipped in code).
- `app-shell`: shell chrome (AppNav right slot + mobile drawer) gains a theme toggle.

## Approach

Mirror RAU-58: `resolveServerTheme` (db→cookie→`vintage`; no accept-language — both themes light) → layout SSR reads DB `select:{theme:true}` and renders `<html data-theme>`. Client ThemeProvider writes cookie `bb-theme` and applies `data-theme` on later changes. Logged-in toggle → `patchMe({theme})`; anonymous → cookie only. `Profile.theme` optional so test factories/fixtures stay green. i18n (both dicts): `nav.theme`, `nav.themeError`, `profile.theme.title/hint/error`, `theme.vintage`, `theme.scoreboard`.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `prisma/schema.prisma` + `prisma/migrations/` | Modified/New | `User.theme` + additive migration |
| `lib/theme/{serverTheme.ts,index.tsx,ThemeSwitcher.tsx}` | New | resolver, provider, toggle |
| `app/layout.tsx` | Modified | SSR theme + `<html data-theme>` |
| `app/api/me/route.ts` (+test) | Modified | validate `theme` in allowlist |
| `features/profile/api.ts`, `ProfilePanel.tsx` (+tests) | Modified | `Profile.theme`, selector UI |
| `components/AppNav.tsx` | Modified | toggle desktop + drawer |
| `lib/i18n/dictionaries.ts` | Modified | 7 keys × ES/EN |
| `app/globals.css`, designLock/MatchView tests | Untouched | vars reused; raw-class locks safe |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| FOUC on reload | Med | SSR always paints `data-theme` pre-hydration |
| designLock/MatchView raw-class locks | Low | jsdom asserts class strings, not styles; don't alter CSS bytes |
| Repo spec stale (locale absent) | Med | sdd-spec reconciles against real code contract |
| ~630 lines > 400 budget | Med | 2 chained PRs (~330 backend / ~300 UI); ask-on-risk |

## Rollback Plan

Per-PR git revert (UI first, then backend). Column additive with default — no destructive SQL; drop later via additive migration if desired. Cookie `bb-theme` ignored by older builds.

## Dependencies

- None external. Migration timestamped after `20260903094743_live_match_last_turn_reason`.

## Success Criteria

- [ ] Logged-in theme persists across reload and devices; anonymous persists via cookie.
- [ ] Initial HTML contains `data-theme` (no FOUC).
- [ ] Scoreboard selectable from AppNav and ProfilePanel without manual attribute edits.
- [ ] `pnpm test`, local e2e, lint, `tsc --noEmit` green.

## Workload Forecast

- Decision needed before apply: Yes
- Chained PRs recommended: Yes
- 400-line budget risk: High
