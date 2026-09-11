# Tasks: match-share-link (RAU-7)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1,300–1,400 total (S1 ~310 · S2 ~240 · S3 ~260 · S4 ~360 · S5 ~200) |
| 400-line budget risk | High (total) |
| Chained PRs recommended | Yes |
| Suggested split | PR1 → PR2 → PR3 → PR4 → PR5 |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Token column + `watchAccess` + share route + `/watch` prefix | PR1 | `pnpm exec vitest run lib/watchAccess.test.ts auth.config.test.ts` | N/A — pure predicate/reducer + route logic, no browser boundary | Revert migration; delete `lib/watchAccess.ts`, share route, `/watch` prefix; feature inert |
| 2 | `GET /api/watch/[token]` reduced DTO | PR2 | `pnpm exec vitest run app/api/watch/[token]/route.test.ts` | N/A — route handler imported directly in vitest | Delete `app/api/watch/[token]/route.ts` + its test |
| 3 | Guest SSE + `useWatchLive` | PR3 | `pnpm exec vitest run app/api/watch/[token]/live/route.test.ts lib/liveHub.test.ts` | N/A — SSE route + hub unit, no browser | Delete `app/api/watch/[token]/live/route.ts`, `useWatchLive.ts` + tests |
| 4 | Guest page + `WatchMatchView` + AppShell + i18n + e2e | PR4 | `pnpm exec vitest run features/leagues/WatchMatchView.test.tsx` | `AUTH_MODE=local pnpm exec playwright test e2e/watch.spec.ts` (ports occupied locally → defer to CI) | Delete `app/watch/[token]/page.tsx`, `WatchMatchView.tsx`, provider line, i18n keys, e2e |
| 5 | Share button + `createShareLink` | PR5 | `pnpm exec vitest run features/leagues/MatchView.test.tsx` | N/A — component test | Revert `MatchView.tsx` button + `api.ts` additions |

## Phase 1 (S1) — Foundation: token + reducers + share + prefix

- [x] 1.1 Add `shareToken String? @unique` to `Fixture` in `prisma/schema.prisma` + additive migration (`prisma/migrations/`) — MSL-1
- [x] 1.2 Create `lib/watchAccess.ts`: `isShareLinkActive`, `ensureShareToken`, `reduceWatchFrame`, `reduceWatchMatch`, types `WatchTeam`/`WatchEvent`/`WatchLiveView`/`WatchMatchDto` — MSL-1/3/4/5
- [x] 1.3 Create `app/api/leagues/[id]/fixtures/[fixtureId]/share/route.ts` POST: `auth()` → 401; `findFirst({id, leagueId})` → 404 foreign; participant/league-owner/`live.manage` → idempotent `{token}`; else 403 — MSL-2
- [x] 1.4 Add `/watch` public prefix to `resolveAuthGate` in `lib/auth-mode.ts` (public for anon AND authed) — user-auth
- [x] 1.5 Create `lib/watchAccess.test.ts` + extend `auth.config.test.ts` (idempotency, expiry, reduction, prefix) — MSL-1/3/user-auth

## Phase 2 (S2) — Public read route

- [x] 2.1 Create `app/api/watch/[token]/route.ts` GET: resolve fixture FROM token, generic 404 on unknown/played, whitelist reduced DTO — MSL-3/4
- [x] 2.2 Create `app/api/watch/[token]/route.test.ts` (200 reduced, no private keys, unknown==played 404) — MSL-3/4

## Phase 3 (S3) — Guest SSE

- [x] 3.1 Create `app/api/watch/[token]/live/route.ts` GET SSE: token gate, `liveHub.subscribe({coachId:null, activeCoachId:null, onGraceExpired:undefined})`, ticker, `reduceWatchFrame` on snapshot AND hub frames — MSL-5/LM-32
- [x] 3.2 Create `features/leagues/useWatchLive.ts` EventSource hook for `/api/watch/[token]/live` — MSL-5
- [x] 3.3 Create `app/api/watch/[token]/live/route.test.ts` + extend `lib/liveHub.test.ts` (frames reduced; guest never arms grace) — MSL-5/LM-32

## Phase 4 (S4) — Guest page + chrome exemption

- [x] 4.1 Exempt `/watch` from `AppShell` in `app/providers/SessionAppProvider.tsx` (render children like `/`) — AS-9
- [x] 4.2 Create `app/watch/[token]/page.tsx` + `features/leagues/WatchMatchView.tsx` (reuse `LiveEventCards`/`MatchTimelineBar`/`useLiveClock`, force `viewerSide:null`) — MSL-6
- [x] 4.3 Add `watch.closed` (+ `match.share`/`match.shareCopied`) es/en in `lib/i18n/dictionaries.ts` — MSL-6/7
- [x] 4.4 Create `features/leagues/WatchMatchView.test.tsx` + `e2e/watch.spec.ts` (no chrome/controls; played → 404) — MSL-6

## Phase 5 (S5) — Share UI

- [x] 5.1 Add `fetchWatchMatch`/`createShareLink` + `WatchMatchDto` types to `features/leagues/api.ts` — MSL-7
- [x] 5.2 Add "Compartir" button in `features/leagues/MatchView.tsx` (participant OR `canResetLive` eligibility), POST share, copy `${origin}/watch/${token}` + "Copiado" — MSL-7/MV-8
- [x] 5.3 Extend `features/leagues/MatchView.test.tsx` (eligible shows + copies; spectator hides) — MSL-7/MV-8

## Cross-slice verification (every slice)

- `pnpm test` · `pnpm lint` · `npx tsc --noEmit` stay green; existing `MatchView.test.tsx`, `auth.config.test.ts`, `liveAccess.test.ts` untouched.
