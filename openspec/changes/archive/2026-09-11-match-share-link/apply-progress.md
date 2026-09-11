# Apply Progress: match-share-link (RAU-7)

**Mode**: Strict TDD
**Branch chain**: `feat/match-share-link-s1` (merged) → `feat/match-share-link-s2` (merged, base `main` @ `591c5f7`) → `feat/match-share-link-s3` (merged, base `main` @ `3be3302`) → `feat/match-share-link-s4` (merged, base `main` @ `3be3302`) → `feat/match-share-link-s5` (base `main` @ `54ca1ec`)
**Slices done**: S1, S2, S3, S4, S5 · **Remaining**: none

---

## Slice 1 (S1) — Foundation: token + reducers + share + prefix

**Batch**: S1 / Phase 1
**Branch**: `feat/match-share-link-s1` (base `main` @ `a9cccf3`)

### Completed Tasks

- [x] 1.1 `Fixture.shareToken String? @unique` + additive migration (`prisma/migrations/20260911120000_fixture_share_token/`) — MSL-1
- [x] 1.2 `lib/watchAccess.ts`: `isShareLinkActive`, `ensureShareToken`, `reduceWatchFrame`, `reduceWatchMatch`, types `WatchTeam`/`WatchEvent`/`WatchLiveView`/`WatchMatchDto` — MSL-1/3/4/5
- [x] 1.3 `app/api/leagues/[id]/fixtures/[fixtureId]/share/route.ts` POST RBAC — MSL-2
- [x] 1.4 `/watch` public prefix in `resolveAuthGate` (`lib/auth-mode.ts`) — user-auth
- [x] 1.5 `lib/watchAccess.test.ts` + `lib/auth-mode.test.ts` + `auth.config.test.ts` — MSL-1/3/user-auth

### Files Changed (S1)

| File | Action | What Was Done |
|------|--------|---------------|
| `prisma/schema.prisma` | Modified | Added `shareToken String? @unique` to `Fixture` |
| `prisma/migrations/20260911120000_fixture_share_token/migration.sql` | Created | Additive `ALTER TABLE ... ADD COLUMN` + unique index (no drop/backfill) |
| `lib/watchAccess.ts` | Created | Derived-expiry predicate, idempotent 192-bit token mint, whitelist reducers |
| `lib/watchAccess.test.ts` | Created | 16 unit tests (predicate, idempotency, token shape, reduction, summary) |
| `app/api/leagues/[id]/fixtures/[fixtureId]/share/route.ts` | Created | POST share: 401 / 404 / 403 / 200 `{token}` |
| `app/api/leagues/[id]/fixtures/[fixtureId]/share/route.test.ts` | Created | 9 route tests (RBAC matrix + idempotency) |
| `lib/auth-mode.ts` | Modified | `/watch` and `/watch/*` public for anon AND authed |
| `lib/auth-mode.test.ts` | Modified | 4 new prefix tests (incl. `/watchdog` anti-overreach) |
| `auth.config.test.ts` | Modified | 2 new integration tests (guest + coach open a share link) |

### Commits (S1)

| Commit | Message |
|--------|---------|
| `3945707` | `feat(db): add Fixture.shareToken for public share links` |
| `f49f568` | `feat(watch): add share-token lifecycle and whitelist reducers` |
| `4bc45a3` | `feat(watch): add fixture share endpoint with participant/owner/admin RBAC` |
| `0225e50` | `feat(auth): allow public /watch share prefix in the route gate` |

---

## Slice 2 (S2) — Public reduced read route

**Batch**: S2 / Phase 2
**Branch**: `feat/match-share-link-s2` (base `main` @ `aa6bdf6`, contains S1 via PRs #210/#211)

### Completed Tasks

- [x] 2.1 `app/api/watch/[token]/route.ts` GET: resolve fixture FROM token, generic 404 on unknown/played, whitelist reduced DTO — MSL-3/4
- [x] 2.2 `app/api/watch/[token]/route.test.ts` (200 reduced, no private keys, unknown==played 404) — MSL-3/4

### Files Changed (S2)

| File | Action | What Was Done |
|------|--------|---------------|
| `app/api/watch/[token]/route.ts` | Created | Public token-gated GET → reduced `WatchMatchDto`; generic 404; lazy stale sweep; unified clock via `deriveLiveClock` |
| `app/api/watch/[token]/route.test.ts` | Created | 14 route tests (public/no-session, reduced whitelist, no private fields, clock, summary, sweep parity, generic 404) |

### S2 Design Decisions

- **Resolve FROM token, no `leagueId`**: `prisma.fixture.findUnique({ where: { shareToken: token } })`. `shareToken` is `@unique`, so the token resolves to exactly one fixture. The member fixture GET and `resolveLiveAccess` are untouched.
- **Generic 404 (MSL-3)**: one `SHARE_LINK_GONE = "Este link ya no está disponible"` body for BOTH an unknown token and a fixture with a recorded outcome (`homeScore`/`awayScore`/`winnerId`/`result`). No existence leak, no expired-vs-unknown distinction. The token-resolution read is a lightweight gate; an inactive token short-circuits with zero further reads/writes.
- **Stale sweep = YES, scoped to the fixture (LMR-3 parity)**: the route runs `expireStaleLiveMatches({ prisma, hub: liveHub }, { fixtureId })` AFTER the token resolves to an active fixture and BEFORE the reduced read, mirroring the member fixture GET. Rationale: the watch route serves the SAME live view (reduced); serving a >8h stale "live" clock would violate the invariant the member surfaces enforce and would diverge member vs guest. The sweep is seq-guarded/idempotent and wrapped in try/catch so a failure never breaks the read. Consequence: if the sweep freezes the scoreboard, the derived expiry flips the link to the generic 404 (re-checked after the sweep) — an abandoned match is no longer "unresolved".
- **Clock parity**: the route maps the raw `LiveMatch` row to `WatchFrameInput` using the SAME `deriveLiveClock` helper `serializeLive`/`toLiveViewState` use, so the guest clock can never drift from the member clock. `reduceWatchFrame` still forces `viewerSide: null` and filters events via `isDisplayEvent`.
- **Derived `status`**: reuses `deriveFixtureStatus` from `app/api/leagues/[id]/route` (same helper the member surfaces use; the fixture route already imports from that module). For an active link the status is `pending`/`scheduled`; `played` never reaches the DTO (it 404s).
- **Minimal select**: the reduced read selects only fixture identity, the two team identities (`id/name/raceId/emblem`), and the live row + events. `result` is selected as `{ id: true }` for nullness only — the `MatchResult` payload is never loaded, and `summary` is derived from `live` + display events (never `result`).

### TDD Cycle Evidence (S2)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 2.1–2.2 | `app/api/watch/[token]/route.test.ts` | Route (unit, mocked deps) | N/A (new) | ✅ Written — `./route` missing → import error | ✅ 14/14 passed | ✅ 14 cases: no-session 200, token-scoped query, reduced whitelist, private-field absence (structural + serialized), display-event filter, clock derivation (fake timers), derived summary, no-live null, sweep scope + failure tolerance, post-sweep close, unknown 404, played 404, result-only 404 | ✅ `ReducedBody` test type; route-local `toWatchFrame`/`gone` helpers |

### Work Unit Evidence (S2)

| Unit | Focused test command and exact result | Runtime harness command/scenario and exact result | Rollback boundary |
|------|---------------------------------------|--------------------------------------------------|-------------------|
| 2.1–2.2 watch GET | `pnpm exec vitest run "app/api/watch/[token]/route.test.ts"` → 14/14 | N/A — route handler imported directly in vitest; no browser/DB boundary | Delete `app/api/watch/[token]/route.ts` + `app/api/watch/[token]/route.test.ts` |

**Full-suite gates (S2)**: `pnpm test` → 175 files / 2549 tests passed · `pnpm lint` clean · `npx tsc --noEmit` clean.

### Commits (S2)

| Commit | Message |
|--------|---------|
| `7785226` | `feat(watch): add public reduced read route for share links` |

---

## Slice 3 (S3) — Guest SSE

**Batch**: S3 / Phase 3
**Branch**: `feat/match-share-link-s3` (base `main` @ `591c5f7`, contains S1+S2)

### Completed Tasks

- [x] 3.1 `app/api/watch/[token]/live/route.ts` GET SSE: token gate, `subscribe({coachId:null, activeCoachId:null, onGraceExpired:undefined})`, ticker, `reduceWatchFrame` on snapshot AND hub frames — MSL-5/LM-32
- [x] 3.2 `features/leagues/useWatchLive.ts` EventSource hook for `/api/watch/[token]/live` — MSL-5
- [x] 3.3 `app/api/watch/[token]/live/route.test.ts` + extended `lib/liveHub.test.ts` (frames reduced; guest never arms grace) — MSL-5/LM-32

### Files Changed (S3)

| File | Action | What Was Done |
|------|--------|---------------|
| `app/api/watch/[token]/live/route.ts` | Created | Public token-gated SSE: generic 404, snapshot-first reduced view, every hub frame reduced, ticker, heartbeat 15s, flush 250ms, reset forwarded, member-only `ack` skipped |
| `app/api/watch/[token]/live/route.test.ts` | Created | 12 route tests (404 unknown/played/result-only, no-session, subscribe args, ticker start/not, reduced snapshot, reduced hub frame, ack skip, tick reduce+kind, reset forward) |
| `features/leagues/useWatchLive.ts` | Created | `EventSource` hook: snapshot REPLACES, deltas upsert-by-seq (cap 200), tick skip, `live:null` clears, connected/error |
| `features/leagues/useWatchLive.test.tsx` | Created | 9 hook tests (URL + encoding, snapshot, live:null, delta merge, reconnect, tick skip, connectivity, unmount) |
| `lib/liveHub.ts` | Modified | `unsubscribe` arms grace only when no window is already pending (a guest disconnect must not extend the coach's window) |
| `lib/liveHub.test.ts` | Modified | 4 new guest-grace tests |

### S3 Design Decisions

- **Reduce EVERY hub frame (MSL-5)**: the guest `notify` buffers `reduceWatchFrame(payload)` so the stream never carries a private field. The original `kind` discriminator is re-attached on the emitted frame (not a private field) so the client can skip 1s ticks.
- **`coachId:null`, no `onGraceExpired` (MSL-5/LM-32)**: the guest subscription is inert for LM-7. `activeCoachId:null` does not overwrite the channel's known active coach (`?? ch.activeCoachId`), and the absent handler leaves the coach's handler intact.
- **Guest never re-arms grace**: `lib/liveHub.unsubscribe` now arms only when `!activeCoachConnected && !ch.graceTimer`. A guest leaving while the coach's grace is pending preserves the ORIGINAL 10s window (test drives this).
- **`ack` frames skipped**: the rival ✓/✗ is a member-only affordance; the ack carries an event seq that may sit below the cursor and its `event` is not in the guest whitelist → never forwarded.
- **Reset frames forwarded** as `{seq, live:null}` (already minimal/public) so the guest drops the live view.
- **Snapshot parity**: builds the snapshot from `liveMatchRowToState` + `toLiveViewState` + `reduceWatchFrame`, reusing the member route's exact clock derivation (no drift). Ticker started idempotently.
- **No stale sweep** in the SSE route (mirrors the member SSE route, which does not sweep).

### TDD Cycle Evidence (S3)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 3.1 | `app/api/watch/[token]/live/route.test.ts` | Route (unit, mocked deps) | N/A (new) | ✅ Written — `./route` missing → import error | ✅ 12/12 passed | ✅ 12 cases: 3× 404 (unknown/played/result-only), no-session 200, subscribe args, ticker start/not, reduced snapshot + display filter + private absence, reduced hub frame + event filter, ack skip, tick reduce+kind, reset forward | ✅ route-local `gone`/`toWatchEventInputs` helpers; kind preserved via spread |
| 3.2 | `features/leagues/useWatchLive.test.tsx` | Hook (RTL, fake EventSource) | N/A (new) | ✅ Written — `./useWatchLive` missing → import error | ✅ 9/9 passed | ✅ 9 cases: URL + token encoding, snapshot, live:null clear, delta merge/upsert, reconnect replace, tick skip, open/error, unmount | ✅ shared `upsertEvents`/`parseFrame` mirror `useLiveMatch` |
| 3.3 | `lib/liveHub.test.ts` | Unit (fake timers) | ✅ 12/12 baseline | ✅ Written — re-arm test failed (handler fired 0× at t=10s) | ✅ 16/16 passed | ✅ 4 cases: guest subscribe preserves window, guest disconnect no re-arm, guest ≠ active coach connected, activeCoachId preserved | ✅ guard `!ch.graceTimer` added to `unsubscribe` |

### Work Unit Evidence (S3)

| Unit | Focused test command and exact result | Runtime harness command/scenario and exact result | Rollback boundary |
|------|---------------------------------------|--------------------------------------------------|-------------------|
| 3.1 guest SSE route | `pnpm exec vitest run "app/api/watch/[token]/live/route.test.ts"` → 12/12 | N/A — SSE route handler imported directly in vitest; no browser/DB boundary | Delete `app/api/watch/[token]/live/route.ts` + `route.test.ts` |
| 3.2 useWatchLive hook | `pnpm exec vitest run features/leagues/useWatchLive.test.tsx` → 9/9 | N/A — hook tested with a fake `EventSource`; no browser boundary | Delete `features/leagues/useWatchLive.ts` + `useWatchLive.test.tsx` |
| 3.3 hub guest grace | `pnpm exec vitest run lib/liveHub.test.ts` → 16/16 | N/A — pure hub unit with fake timers | Revert the `lib/liveHub.ts` `unsubscribe` guard + the 4 new tests |

**Full-suite gates (S3)**: `pnpm test` → 177 files / 2574 tests passed · `pnpm lint` clean · `npx tsc --noEmit` clean.

### Commits (S3)

| Commit | Message |
|--------|---------|
| `a378fc3` | `fix(live): preserve a pending grace window when a non-coach disconnects` |
| `eb45714` | `feat(watch): add guest SSE route with whitelist-reduced frames` |
| `e9e8193` | `feat(watch): add useWatchLive hook for the guest stream` |

---

## Slice 4 (S4) — Guest page + chrome exemption

**Batch**: S4 / Phase 4
**Branch**: `feat/match-share-link-s4` (base `main` @ `3be3302`, contains S1+S2+S3)

### Completed Tasks

- [x] 4.1 Exempt `/watch` from `AppShell` in `app/providers/SessionAppProvider.tsx` (render children like `/`) — AS-9
- [x] 4.2 `app/watch/[token]/page.tsx` + `features/leagues/WatchMatchView.tsx` (reuse `LiveEventCards`/`MatchTimelineBar`/`useLiveClock`, force `viewerSide:null`) — MSL-6
- [x] 4.3 `watch.title`/`watch.shared`/`watch.finished`/`watch.loading`/`watch.closed` (+ `match.share`/`match.shareCopied`) es/en in `lib/i18n/dictionaries.ts` — MSL-6/7
- [x] 4.4 `features/leagues/WatchMatchView.test.tsx` + `e2e/watch.spec.ts` (no chrome/controls; played → 404) — MSL-6

### Files Changed (S4)

| File | Action | What Was Done |
|------|--------|---------------|
| `app/providers/SessionAppProvider.tsx` | Modified | `isShellExempt(pathname)` exempts exact `/watch` + `/watch/*` from `AppShell` (same raw-children branch as `/`) |
| `app/providers/SessionAppProvider.test.tsx` | Modified | 3 new tests: `/watch/tok` raw, bare `/watch` raw, `/watchlist` keeps the shell (anti-overreach) |
| `lib/i18n/dictionaries.ts` | Modified | 7 new keys es/en (watch page + share affordance) |
| `lib/i18n/i18n.test.tsx` | Modified | Key/value assertions for the 7 new keys in both locales |
| `features/leagues/useLiveClock.ts` | Modified | Input widened to a structural `LiveClockState` (`Pick<LiveMatchViewState, 9 clock fields>`) so the guest `WatchLiveView` reuses the clock without fabricated member fields |
| `features/leagues/useLiveClock.test.ts` | Modified | Guest-shaped (reduced) view case |
| `features/leagues/WatchMatchView.tsx` | Created | Lean public guest view: initial reduced GET + `useWatchLive`, header score/clock/status, `MatchTimelineBar` + `LiveEventCards`, `viewerSide:null` |
| `features/leagues/WatchMatchView.test.tsx` | Created | 5 tests (render, zero controls, generic 404, finished badge, SSE score update) |
| `app/watch/[token]/page.tsx` | Created | Thin server page → `WatchMatchView` |
| `e2e/watch.spec.ts` | Created | Real-DB journey: share token → guest opens → walkover → generic 404 |
| `playwright.config.ts` | Modified | `watch.spec.ts` excluded from the local default suite |
| `playwright.config.auth.ts` | Modified | `watch.spec.ts` added to the auth suite `testMatch` |

### S4 Design Decisions

- **New lean `WatchMatchView` (not a `MatchView` mode)**: follows the design decision row. Zero blast radius on the 2300-line `MatchView.tsx`/`MatchView.test.tsx`; the guest reuses only the presentational pieces.
- **Presentational reuse with a team adapter**: `MatchTimelineBar` + `LiveEventCards` expect `MatchTeamDetail`; the guest DTO carries no roster/owner, so `toMatchTeamDetail` maps `WatchTeam` → `{ id, name, raceId, user:null, players:[] }`. Player cards render their label-only fallback; no private field can leak.
- **Clock reuse (MSL-6)**: `useLiveClock`/`deriveDisplayClock` now accept a structural `LiveClockState` — the 9 fields the clock actually reads. Both the member `LiveMatchViewState` and the guest `WatchLiveView` satisfy it, so no fabricated consent/MVP/resolution state is needed. Zero runtime change; existing member callers/tests unaffected.
- **AppShell exemption (AS-9)**: `isShellExempt` mirrors the `/` raw-children branch for exact `/watch` and the `/watch/` prefix only. `/watchlist` keeps the shell (tested).
- **Generic 404 (MSL-3)**: the client maps the server's generic 404 (and any fetch failure) to `watch.closed` — the byte-identical Spanish copy — never distinguishing expired from unknown.
- **No controls**: `viewerSide` is forced `null` and no member control is mounted; the guest render asserts ZERO buttons (no share/begin/concede/ack).

### TDD Cycle Evidence (S4)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 4.1 | `app/providers/SessionAppProvider.test.tsx` | Component (RTL, mocked nav/session) | ✅ 8/8 baseline | ✅ Written — `/watch` mounted the shell (2 failing) | ✅ 11/11 | ✅ 3 cases: `/watch/tok`, bare `/watch`, `/watchlist` anti-overreach | ➖ None needed |
| 4.2 | `features/leagues/WatchMatchView.test.tsx` | Component (RTL, fake fetch + EventSource) | N/A (new) | ✅ Written — `./WatchMatchView` missing → import error | ✅ 5/5 | ✅ 5 cases: reduced render, zero controls, generic 404, finished badge, SSE score update | ✅ extracted `formatHms`/`toMatchTeamDetail` |
| 4.2 | `features/leagues/useLiveClock.test.ts` | Unit | ✅ 12/12 baseline | ➖ Type-only widening (not runtime-observable; behavioral proof via WatchMatchView) | ✅ 13/13 | ✅ guest-shaped reduced view | ➖ None needed |
| 4.3 | `lib/i18n/i18n.test.tsx` | Unit | ✅ 16/16 baseline | ✅ Written — keys returned the key itself | ✅ 17/17 | ✅ 7 es/en key pairs | ➖ None needed |
| 4.4 | `e2e/watch.spec.ts` | E2E (real DB) | N/A (new) | ➖ Authored (journey; not runnable locally) | ⏸ NOT executed — port 3000 occupied + auth suite needs Docker Postgres | ✅ 1 journey: share → guest → walkover → 404 | ➖ None needed |

### Work Unit Evidence (S4)

| Unit | Focused test command and exact result | Runtime harness command/scenario and exact result | Rollback boundary |
|------|---------------------------------------|--------------------------------------------------|-------------------|
| 4.1 `/watch` shell exemption | `pnpm exec vitest run app/providers/SessionAppProvider.test.tsx` → 11/11 | N/A — provider unit with mocked `next/navigation` + session; no browser/DB boundary | Revert `isShellExempt` + the 3 new tests |
| 4.2 guest page + view | `pnpm exec vitest run features/leagues/WatchMatchView.test.tsx features/leagues/useLiveClock.test.ts` → 18/18 | `AUTH_MODE=local pnpm exec playwright test e2e/watch.spec.ts` → **NOT executed locally**: port 3000 is occupied by a running dev server and the auth suite needs Docker Postgres (`reuseExistingServer:false`). Wired into the auth suite; `--list` collects 1 test. Deferred to CI/verify. | Delete `app/watch/[token]/page.tsx`, `WatchMatchView.tsx` + test; revert the `useLiveClock.ts` type widening + guest case |
| 4.3 i18n | `pnpm exec vitest run lib/i18n/i18n.test.tsx` → 17/17 | N/A — dictionary parity unit | Remove the 7 keys + the new test |
| 4.4 e2e | `pnpm exec vitest run features/leagues/WatchMatchView.test.tsx` → 5/5 | (as above — deferred to CI) | Delete `e2e/watch.spec.ts` + the two config lines |

**Full-suite gates (S4)**: `pnpm test` → 178 files / 2584 tests passed · `pnpm lint` clean · `npx tsc --noEmit` clean.

### Commits (S4)

| Commit | Message |
|--------|---------|
| `d4d4677` | `feat(auth): exempt /watch from the app shell` |
| `1653e53` | `feat(i18n): add public watch page and share copy` |
| `2104ddf` | `feat(watch): add the public guest watch page and view` |
| `88595ba` | `test(e2e): cover the public share-link watch journey` |

---

## Slice 5 (S5) — Share UI (FINAL)

**Batch**: S5 / Phase 5
**Branch**: `feat/match-share-link-s5` (base `main` @ `54ca1ec`, contains S1–S4)

### Completed Tasks

- [x] 5.1 `createShareLink(leagueId, fixtureId)` in `features/leagues/api.ts` (POST share route + `readJson`, encoded ids) — MSL-7
- [x] 5.2 "Compartir" button in `features/leagues/MatchView.tsx`: visible to participant / league owner / `live.manage` only; POSTs the share route, copies `${origin}/watch/${token}` with a `navigator.clipboard` + `execCommand` fallback, flips to "Copiado", surfaces an alert on failure — MSL-7/MV-8
- [x] 5.3 `features/leagues/MatchView.test.tsx` share suite (participant/owner/dev show; spectator hides; click → POST + copy + "Copiado"; copy-failure alert; clipboard fallback) — MSL-7/MV-8
- [x] i18n: added `match.shareError` es/en (key-for-key sync + value assertion) — MSL-7

### Files Changed (S5)

| File | Action | What Was Done |
|------|--------|---------------|
| `features/leagues/api.ts` | Modified | `createShareLink` client helper (POST share, `readJson`, encoded ids) |
| `features/leagues/api.test.ts` | Modified | 2 tests: POST route + token shape; URL encoding + HTTP-status propagation |
| `features/leagues/MatchView.tsx` | Modified | `copyToClipboard` helper (Clipboard API + `execCommand` fallback), share state, `canShare` eligibility, "Compartir"/"Copiado" button + error alert |
| `features/leagues/MatchView.test.tsx` | Modified | 6 share tests (participant, owner, developer, spectator, copy failure, clipboard fallback) |
| `lib/i18n/dictionaries.ts` | Modified | `match.shareError` es/en |
| `lib/i18n/i18n.test.tsx` | Modified | `match.shareError` es/en value assertion |

### S5 Design Decisions

- **Eligibility mirrors the endpoint RBAC (MSL-7/MV-8)**: `canShare = session user present AND (viewerSide != null OR league.ownerId === user OR can(role, "live.manage"))`. The server re-enforces it, so the UI gate is display-only. A spectator member (no side, not owner, no role) sees no control.
- **No fixture-state gating**: unlike `canResetLive`, the share affordance is NOT gated on a live match or the league status — the link is about sharing the fixture; the endpoint mints the token regardless. This matches the MSL-7/MV-8 wording (participant/owner/admin).
- **Clipboard**: prefers `navigator.clipboard.writeText`, falls back to a hidden `<textarea>` + `document.execCommand("copy")` for non-secure/older contexts; a rejection of either path drives the error state.
- **Absolute URL**: `${window.location.origin}/watch/${encodeURIComponent(token)}` (the token is already URL-safe base64url; encoding is defensive).
- **Placement**: the share button joins the existing owner/dev action bar (now rendered when `canResetLive || canShare`); the error alert sits in the same bar with `role="alert"`.
- **`data-testid="share-link"`** added for future e2e symmetry (assertions use role + accessible name).

### TDD Cycle Evidence (S5)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 5.1 | `features/leagues/api.test.ts` | Unit (stubbed fetch) | ✅ 33/33 baseline | ✅ Written — `createShareLink is not a function` (2 failing) | ✅ 35/35 | ✅ 2 cases: success route+token; URL encoding + 403 status | ➖ None needed |
| 5.2/5.3 | `features/leagues/MatchView.test.tsx` | Component (RTL, stubbed fetch + clipboard + EventSource) | ✅ 89/89 baseline | ✅ Written — 4 failing (button missing) | ✅ 94/94 | ✅ 6 cases: participant, owner, developer, spectator hides, copy failure, clipboard fallback | ✅ extracted `copyToClipboard`; shared bar for reset+share |
| i18n | `lib/i18n/i18n.test.tsx` | Unit | ✅ 16/16 baseline | ✅ Written — key returned itself | ✅ 17/17 | ✅ es/en pair + key-for-key sync | ➖ None needed |

### Work Unit Evidence (S5)

| Unit | Focused test command and exact result | Runtime harness command/scenario and exact result | Rollback boundary |
|------|---------------------------------------|--------------------------------------------------|-------------------|
| 5.1 share client | `pnpm exec vitest run features/leagues/api.test.ts` → 35/35 | N/A — client helper over stubbed fetch; no browser boundary | Revert the `createShareLink` export + its 2 tests |
| 5.2/5.3 share UI | `pnpm exec vitest run features/leagues/MatchView.test.tsx` → 95/95 | N/A — component test with stubbed `navigator.clipboard`/fetch/EventSource; no real browser/DB boundary | Revert the `MatchView.tsx` button/state/helper + the 6 tests |
| i18n | `pnpm exec vitest run lib/i18n/i18n.test.tsx` → 17/17 | N/A — dictionary parity unit | Remove the `match.shareError` key + assertion |

**Full-suite gates (S5)**: `pnpm test` → 178 files / 2592 tests passed · `pnpm lint` clean · `npx tsc --noEmit` clean.

### Commits (S5)

| Commit | Message |
|--------|---------|
| `f4ba730` | `feat(leagues): add createShareLink client helper` |
| `4be4c20` | `feat(match): add share link affordance to the match view` |

---

## Deviations from Design

- None functionally.
- The design's `WatchMatchDto.fixture.scheduledAt` was given no explicit type; implemented as `string | null` (ISO-serialized by the reducer) so the DTO is JSON-ready (S1).
- S2 reuses `deriveFixtureStatus` from the member league route module (the fixture route already imports from there) instead of duplicating the 3-line derivation — no drift, no member-route change.
- Added extra tests beyond the task list where they document a decision: `/watch` prefix cases in `lib/auth-mode.test.ts` (S1), stale-sweep scope/failure/post-sweep-close cases (S2).
- S3 keeps the generic 404 string locally in the live route (same literal as the S2 GET route) to keep the slice self-contained; both are asserted in tests.
- S3 forwards a reduced tick frame with its `kind` re-attached (the tick's reduced view omits `half`/`turnNumber`); the client skips it. This honors "reduce every hub frame" without breaking the client.
- S4 reuses the clock via a **structural `LiveClockState` type widening** (the 9 fields `useLiveClock` reads) instead of an adapter that fabricates the member-only consent/MVP/resolution fields — cleaner interface segregation, zero runtime change. The task wording suggested "adapter/cast"; this is the type-safe equivalent.
- S4 adds `match.share`/`match.shareCopied` i18n keys ahead of S5 per task 4.3; they are inert until the share button ships (no UI wired).
- S5 adds only `createShareLink` to `api.ts`; task 5.1 also named `fetchWatchMatch`/`WatchMatchDto`, but S4's `WatchMatchView` already fetches the guest DTO inline using the `lib/watchAccess` types. Adding an unused `fetchWatchMatch` would be dead code and refactoring S4 is out of scope, so it was intentionally omitted (documented, not silently skipped).

## Issues Found

- **S1 workload overage**: S1 authored diff = **862 insertions + 1 deletion = 863 changed lines** vs the tasks forecast `~310`. The thorough Strict-TDD suites drive the overage (production code ~380). Recommend `size:exception` for the S1 PR or splitting S1 at PR time. No diff was minified.
- **S2 workload overage**: S2 authored diff = **591 insertions** (route ~214, test ~377) vs the tasks forecast `~240`. Strict-TDD test coverage is the driver; production code is ~214 lines. Recommend `size:exception` for the S2 PR. No diff was minified.
- **S3 workload overage**: S3 authored diff = **1046 insertions** (route 258, route test 384, hook 139, hook test 183, hub +82) vs the tasks forecast `~260`. Strict-TDD coverage is the driver. Recommend `size:exception` for the S3 PR. No diff was minified.
- **Public route side effect**: the watch GET can trigger the lazy stale-live auto-close (a bounded, idempotent write) for a valid token. This mirrors the member fixture GET and is scoped to the token's fixture; it is the deliberate LMR-3 parity choice documented above. A reviewer may want to confirm this is acceptable for an unauthenticated surface.
- **Hub grace nuance (S3)**: before the S3 guard, a non-active subscriber disconnect could RESET a pending grace window (extending the active coach's pause). The S3 guard prevents the reset; a guest never installs a grace handler.
- **S4 workload overage**: S4 authored diff = **682 insertions + 4 deletions = 686 changed lines** vs the tasks forecast `~360`. Strict-TDD component coverage + the real-DB e2e journey are the drivers. Recommend `size:exception` for the S4 PR. No diff was minified.
- **S4 e2e not executed locally**: port 3000 is occupied by a running dev server and the auth suite requires Docker Postgres + `AUTH_MODE=auth` (`reuseExistingServer:false`). The spec is wired into `playwright.config.auth.ts` and excluded from the local default suite; `playwright --list` collects 1 test. Deferred to CI/verify.
- **S5 workload**: authored diff = **271 insertions + 14 deletions = 285 changed lines** vs the tasks forecast `~200`. Strict-TDD component coverage is the driver; production code is ~107 lines (`api.ts` +19, `MatchView.tsx` +88) plus i18n +3. WITHIN the 400-line budget → single PR, no `size:exception` needed. No diff was minified.
- **S5 eligibility vs reset**: the share control intentionally does NOT reuse `canResetLive`'s live-match/status gating — it is a broader predicate (participant OR owner OR `live.manage`). This is the literal MSL-7/MV-8 contract, but a reviewer should confirm sharing a played fixture (whose guest link then 404s) is acceptable product behavior.

## Remaining Tasks (S5)

- [x] 5.1–5.3 share button + `createShareLink` + tests (participant/owner/admin only; copy + "Copiado")

## Workload / PR Boundary

- Mode: chained PR slices (S5 of 5 — FINAL)
- Current work unit: S5 — Share UI (`createShareLink` + `MatchView` "Compartir" button + i18n + tests)
- Boundary: starts from `main @ 54ca1ec` (S4 merged); ends with an eligible coach able to mint + copy the public `/watch/[token]` link from the match page. Rollback = revert the `api.ts` helper and the `MatchView.tsx` button/state/helper + their tests; the rest of the feature is untouched.
- Review budget impact: ~285 authored lines (within the 400 budget) → single PR.

## Status

17/17 tasks complete (S1 5/5, S2 2/2, S3 3/3, S4 4/4, S5 3/3). All slices implemented. Ready for `sdd-verify` of the complete change.
