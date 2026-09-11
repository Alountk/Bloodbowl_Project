```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:b4a5ba2b7739c651527965a1a93f608dafd783422062585c36bda202607e11fa
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 11/11
scenarios: 26/26
test_command: pnpm test
test_exit_code: 0
test_output_hash: sha256:ada611e14772905be82c04917731d3a0be1f2980233527e901cc660528dc6768
build_command: pnpm build
build_exit_code: 0
build_output_hash: sha256:fe7dbc0fab637315238c3c4ec729947624f70e248196fe0391a027e693d1d533
```

# Verification Report — match-share-link (RAU-7)

**Change**: match-share-link (RAU-7)
**Specs**: `openspec/changes/match-share-link/specs/{match-share-link,user-auth,app-shell,live-match-realtime,match-view}/spec.md`
**Mode**: Standard (no `openspec/config.yaml`; orchestrator did not declare STRICT TDD ACTIVE; apply used Strict TDD with RED/GREEN evidence, not re-run as a verify gate)
**Branch**: `main` @ `5eff57a` (PRs #210–#217 merged). Working tree clean except untracked `openspec/changes/match-share-link/`.
**Verification**: INDEPENDENT — source inspection against the real merged tree plus execution harness. No product code or tests modified.

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 17 |
| Tasks complete | 17 |
| Tasks incomplete | 0 |

`openspec/changes/match-share-link/tasks.md` shows all 17 tasks `[x]` (S1 5/5, S2 2/2, S3 3/3, S4 4/4, S5 3/3). Engram `sdd/match-share-link/tasks` (#811) is STALE — it predates S5 and still shows Phase 5 `[ ]`; the file is authoritative (see Warnings).

Changed-file scope (`git diff --name-only 18c3dfe~1..HEAD`): 33 files, all inside the design's planned list. **Pinned contracts untouched** — `lib/liveAccess.ts`, the member fixture GET `app/api/leagues/[id]/fixtures/[fixtureId]/route.ts`, and the member SSE route are NOT in the change diff.

## Build & Tests Execution

**Tests**: ✅ 2592 passed (2592), 0 failed, 178 files — `pnpm test` (vitest run) exit 0, 21.64s.
**Build**: ✅ `pnpm build` (next build) exit 0; `/watch/[token]`, `/api/watch/[token]`, `/api/watch/[token]/live`, and `/api/leagues/[id]/fixtures/[fixtureId]/share` all emitted in the route manifest.
**Type-check**: ✅ `npx tsc --noEmit` exit 0 (no output; sha256 of empty = e3b0c442…).
**Lint**: ✅ `pnpm lint` (eslint) exit 0, no findings.
**Prisma**: ✅ `pnpm db:generate` exit 0 — Prisma Client v6.19.3 generated.
**Migration**: ✅ Applied to dev DB (`localhost:5433/bloodbowl`). `prisma migrate status` → "Database schema is up to date!" (30 migrations). DB-level probe: `information_schema.columns` returns `shareToken text NULL` and `pg_indexes` returns `Fixture_shareToken_key`. Migration SQL is additive (`ALTER TABLE "Fixture" ADD COLUMN "shareToken" TEXT;` + unique index; no drop/backfill).
**Playwright e2e (local)**: ⚠️ NOT RUN — a user-owned dev server listens on :3000 (PID 60123); `playwright.config.ts` hardcodes `baseURL`/`webServer.url` to `http://localhost:3000` and `next dev` refuses a second instance; the auth suite needs Docker Postgres + `AUTH_MODE=auth` (`reuseExistingServer:false`). `e2e/watch.spec.ts` is wired into `playwright.config.auth.ts` and excluded from the local default suite. Deferred to CI (see Warnings).
**Coverage**: ➖ Not available — no coverage threshold configured.

## Spec Compliance Matrix

### match-share-link (7 requirements / 15 scenarios)

| Requirement | Scenario | Test / Evidence | Result |
|-------------|----------|-----------------|--------|
| MSL-1 Share Token Lifecycle | First share mints the token | `lib/watchAccess.test.ts` (16) "mints a 192-bit URL-safe token and persists it when absent" + `share/route.test.ts` "mints a stable URL-safe token for the home team owner" (`/^[A-Za-z0-9_-]{32}$/`) | ✅ COMPLIANT |
| MSL-1 | Repeat share is idempotent | `watchAccess.test.ts` "returns the existing token without regenerating or writing" + "is idempotent across a second call" + `share/route.test.ts` "returns the existing token idempotently without a new write" | ✅ COMPLIANT |
| MSL-2 Share Endpoint RBAC | Participant, owner, or admin shares | `share/route.test.ts` home owner / away owner / league owner / developer `live.manage` → 200 | ✅ COMPLIANT |
| MSL-2 | Spectator member denied | `share/route.test.ts` "returns 403 for a spectator member and mints nothing" | ✅ COMPLIANT |
| MSL-2 | Anonymous and foreign denied | `share/route.test.ts` 401 unauthenticated (no read) + 404 foreign non-member | ✅ COMPLIANT |
| MSL-3 Derived Expiry / Generic 404 | Valid while unresolved | `watch/[token]/route.test.ts` (14) "serves the reduced DTO for an active token without any session" (200) | ✅ COMPLIANT |
| MSL-3 | Played fixture closes the link | `route.test.ts` "returns the IDENTICAL generic 404 for a played fixture (expired == unknown)" | ✅ COMPLIANT |
| MSL-3 | Unknown token | `route.test.ts` "returns the generic 404 for an unknown token with no leak and no write" | ✅ COMPLIANT |
| MSL-4 Public Read Route / Reduced DTO | Reduced read | `route.test.ts` "returns only the whitelisted fixture, team, and live fields" (exact key sets) | ✅ COMPLIANT |
| MSL-4 | No private fields | `route.test.ts` "never exposes private fields on the reduced payload (MSL-4)" (structural + serialized absence) | ✅ COMPLIANT |
| MSL-5 Guest SSE Read | Every frame reduced | `watch/[token]/live/route.test.ts` (12) "reduces every hub frame so private fields never reach a guest frame" + reduced-snapshot test (`PRIVATE_MARKERS` absent) | ✅ COMPLIANT |
| MSL-5 | No grace handler | `live/route.test.ts` "subscribes as a coach-less guest" (`coachId:null`, `activeCoachId:null`, `onGraceExpired` undefined) + `lib/liveHub.test.ts` (16) guest-grace tests | ✅ COMPLIANT |
| MSL-6 Guest Watch Page | Guest page renders lean | `features/leagues/WatchMatchView.test.tsx` (5) render + "no member controls (viewerSide forced null)" (zero buttons) + `SessionAppProvider.test.tsx` (11) `/watch` shell exemption | ✅ COMPLIANT |
| MSL-7 Share UI | Participant shares | `features/leagues/MatchView.test.tsx` (95) participant/owner/developer show + click → POST + copy + "Copiado" + `features/leagues/api.test.ts` `createShareLink` | ✅ COMPLIANT |
| MSL-7 | Non-eligible viewer has no share | `MatchView.test.tsx` "hides 'Compartir' from a spectator member" | ✅ COMPLIANT |

### user-auth (1 requirement / 5 scenarios)

| Requirement | Scenario | Test / Evidence | Result |
|-------------|----------|-----------------|--------|
| Route Protection (MODIFIED) | Unauthenticated redirect | `lib/auth-mode.test.ts` (15) "keeps redirecting an unauthenticated user on protected routes other than the landing" | ✅ COMPLIANT |
| Route Protection | Authenticated access | `auth-mode.test.ts` existing protected-route allow cases | ✅ COMPLIANT |
| Route Protection | Authenticated blocks auth pages | `auth-mode.test.ts` "/login" + "/signup" → redirect-home | ✅ COMPLIANT |
| Route Protection | Guest opens a share link | `auth-mode.test.ts` "allows an unauthenticated user on the public share prefix" + `auth.config.test.ts` (13) "allows an unauthenticated guest to open a share link when auth is enabled" | ✅ COMPLIANT |
| Route Protection | Authenticated opens a share link | `auth-mode.test.ts` "allows an authenticated user on the public share prefix" + `auth.config.test.ts` "allows an authenticated coach to open a share link when auth is enabled" | ✅ COMPLIANT |

Anti-overreach: `auth-mode.test.ts` "does not open a route that merely starts with the watch word" (`/watchdog` stays protected).

### app-shell (1 requirement / 2 scenarios)

| Requirement | Scenario | Test / Evidence | Result |
|-------------|----------|-----------------|--------|
| AS-9 Public Watch Shell Exemption | Guest watch page has no chrome | `SessionAppProvider.test.tsx` "passes children through without the app shell on the /watch share route (AS-9)" + "exempts the bare /watch path too" | ✅ COMPLIANT |
| AS-9 | Other routes keep the shell | `SessionAppProvider.test.tsx` "keeps the app shell for a non-watch path that merely starts with /watch" + existing shell tests | ✅ COMPLIANT |

### live-match-realtime (1 requirement / 2 scenarios)

| Requirement | Scenario | Test / Evidence | Result |
|-------------|----------|-----------------|--------|
| LM-32 Guest Watch SSE Read Path | Member gates unchanged | Change diff excludes `lib/liveAccess.ts`, member fixture GET, member SSE; `lib/liveAccess.test.ts` (13) green | ✅ COMPLIANT |
| LM-32 | Reduced guest frames only | `live/route.test.ts` reduced-hub-frame + reduced-snapshot tests | ✅ COMPLIANT |

### match-view (1 requirement / 2 scenarios)

| Requirement | Scenario | Test / Evidence | Result |
|-------------|----------|-----------------|--------|
| MV-8 Match Share Affordance | Eligible viewer shares | `MatchView.test.tsx` participant / owner / developer share tests | ✅ COMPLIANT |
| MV-8 | Non-eligible viewer has no control | `MatchView.test.tsx` "hides 'Compartir' from a spectator member" | ✅ COMPLIANT |

**Compliance summary**: 11/11 requirements, 26/26 scenarios compliant, each backed by a passing runtime test in the current merged tree.

## Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| MSL-1 | ✅ Implemented | `prisma/schema.prisma:139` `shareToken String? @unique`; migration additive; `lib/watchAccess.ts:67-83` `ensureShareToken` read-then-conditional-update, `SHARE_TOKEN_BYTES=24`, `randomBytes(24).toString("base64url")` |
| MSL-2 | ✅ Implemented | `app/api/leagues/[id]/fixtures/[fixtureId]/share/route.ts:26-71` — 401 → `findFirst({id,leagueId})` 404 → participant/league-owner → `requirePermission("live.manage")` else 403 member / 404 foreign |
| MSL-3 | ✅ Implemented | `lib/watchAccess.ts:34-41` `isShareLinkActive` (all four null); `watch/[token]/route.ts:18-22` single `SHARE_LINK_GONE` body for unknown and played |
| MSL-4 | ✅ Implemented | `watch/[token]/route.ts:146-211` minimal `select` (result `{id:true}` nullness only) → `reduceWatchMatch`; `lib/watchAccess.ts:223-293` explicit whitelist picks, `viewerSide:null`, `isDisplayEvent` filter, summary derived from `live` (never `result`) |
| MSL-5 | ✅ Implemented | `watch/[token]/live/route.ts:111-138` buffers `reduceWatchFrame(payload)` on every hub publish; `:169-174` `subscribe({coachId:null, activeCoachId:null})` with no `onGraceExpired`; `lib/liveHub.ts:210` arms grace only when `!activeCoachConnected && !graceTimer` |
| MSL-6 | ✅ Implemented | `app/watch/[token]/page.tsx` → `WatchMatchView.tsx` (`viewerSide={null}`, no member control mounted); `SessionAppProvider.tsx:32-34` `isShellExempt` |
| MSL-7 | ✅ Implemented | `MatchView.tsx:1746-1750` `canShare`; `:1752-1761` `onShare` POST + copy; `:1879-1889` button + "Copiado"; `api.ts:370-379` `createShareLink` |
| user-auth | ✅ Implemented | `lib/auth-mode.ts:45` `isPublicShare` exact `/watch` or `/watch/` prefix, public for anon AND authed; `/watchdog` excluded |
| app-shell | ✅ Implemented | `SessionAppProvider.tsx:32-34` exact `/`, `/watch`, `/watch/` prefix |
| live-match-realtime | ✅ Implemented | Pinned member surfaces untouched (diff scope); guest subscription inert for LM-7 |
| match-view | ✅ Implemented | `canShare = user AND (viewerSide != null OR league.ownerId === user OR can(role,"live.manage"))` — server re-enforces |

**Security invariant**: no SSE frame and no GET watch DTO carries `mvpNominations` / `resolutionState` / `inducements` / `inducementBudget` / `pendingCasualty` / `concedeProposedBy` / `journeymen` / `mvpGrantees` / `liveWinnings` / `homeConsented` / `awayConsented` / `rosters` / `treasury` / PE. Enforced by whitelist-pick reducers (never spread) at `lib/watchAccess.ts:223-293` and asserted both structurally and on the serialized payload by the route tests.

**OUT of scope verified**: no per-league link (token is per-Fixture); no rotation/revocation (idempotent return, never regenerated); expired vs unknown indistinguishable (one byte-identical 404 body); no private data (above).

## Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| Token on `Fixture.shareToken @unique` (survives LiveMatch reset) | ✅ Yes | schema:139 + additive migration |
| `randomBytes(24).toString("base64url")` 192-bit | ✅ Yes | `watchAccess.ts:77`; 32-char URL-safe token asserted |
| Derived expiry, no timestamp | ✅ Yes | `isShareLinkActive` |
| Dedicated read route (no `?token=` on member GET) | ✅ Yes | new `app/api/watch/[token]/route.ts`; member route untouched |
| Dedicated SSE + `reduceWatchFrame` on every frame | ✅ Yes | new `.../live/route.ts` |
| Whitelist reduction (not blacklist spread) | ✅ Yes | explicit field picks |
| New lean `WatchMatchView` (not a `MatchView` mode) | ✅ Yes | zero blast radius on `MatchView`; presentational reuse via `toMatchTeamDetail` |
| Member fixture GET + `resolveLiveAccess` byte-for-byte unchanged | ✅ Yes | not in change diff; `liveAccess.test.ts` 13 green |
| Deviations from design (apply-progress) | ✅ Documented | `scheduledAt: string|null`; `deriveFixtureStatus` reuse; structural `LiveClockState` widening; `fetchWatchMatch` intentionally omitted (dead code) |

## Issues Found

**CRITICAL**: None.

**WARNING**:
1. Local Playwright e2e not executed: a user-owned dev server occupies :3000 (PID 60123) and the auth suite requires Docker Postgres + `AUTH_MODE=auth` with `reuseExistingServer:false`. `e2e/watch.spec.ts` is wired into `playwright.config.auth.ts` and excluded from the local default suite. The MSL-6 page scenario is still covered at runtime by the passing component tests; the e2e gap is harness coverage, not a scenario gap. Deferred to CI.
2. Engram tasks artifact drift: `sdd/match-share-link/tasks` (#811) predates S5 and still shows Phase 5 unchecked, while the canonical `tasks.md` shows 17/17. The Engram tasks artifact should be re-upserted (or is superseded by the file in hybrid mode).
3. Workload overages: S1 863, S2 591, S3 1046, S4 686 changed lines vs the 400-line budget (apply recommends `size:exception`); S5 285 lines within budget. Process note, not a defect.
4. Product behavior: the S5 share predicate is broader than `canResetLive` (no live-match/status gate), so an eligible coach can share an already-played fixture whose guest link then 404s. This matches the literal MSL-7/MV-8 contract; confirm product intent at archive time.

**SUGGESTION**:
1. Add a CI-run assertion for `e2e/watch.spec.ts` so the real-DB guest journey is self-verifying.
2. The watch GET triggers a bounded, idempotent lazy stale-live auto-close (LMR-3 parity) on an unauthenticated surface; keep this documented for reviewers.

## Verdict

**PASS WITH WARNINGS** — implementation matches the spec (11/11 requirements, 26/26 scenarios), all 17 tasks complete, full test/lint/type-check/build/db-generate harness green on `main` @ `5eff57a`, migration applied and verified at the DB level, and the security invariant holds. The warnings are harness/environment (local e2e) and artifact-hygiene (stale Engram tasks) items, none a code defect or regression.

## Command Evidence

- `pnpm test`: exit 0 — 2592/2592 passed (178 files) · output sha256 ada611e14772905be82c04917731d3a0be1f2980233527e901cc660528dc6768
- `pnpm lint`: exit 0 — no findings · output sha256 85b37f071cd58af45049ea2371c5b16c077b6d0eb5997fc63e5c3888a5f1b639
- `npx tsc --noEmit`: exit 0 — no errors · output sha256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 (empty)
- `pnpm build`: exit 0 — compiled successfully; new watch/share routes emitted · output sha256 fe7dbc0fab637315238c3c4ec729947624f70e248196fe0391a027e693d1d533
- `pnpm db:generate`: exit 0 — Prisma Client v6.19.3 generated
- `pnpm exec prisma migrate status`: exit 0 — "Database schema is up to date!" (30 migrations)
- DB probe: `information_schema` → `shareToken text NULL`; `pg_indexes` → `Fixture_shareToken_key`
- Focused suites (from the full run): `lib/watchAccess.test.ts` 16 · `app/api/watch/[token]/route.test.ts` 14 · `app/api/watch/[token]/live/route.test.ts` 12 · `share/route.test.ts` 9 · `lib/auth-mode.test.ts` 15 · `auth.config.test.ts` 13 · `lib/liveHub.test.ts` 16 · `lib/liveAccess.test.ts` 13 · `WatchMatchView.test.tsx` 5 · `MatchView.test.tsx` 95 · `SessionAppProvider.test.tsx` 11 · `useWatchLive.test.tsx` 9
- `AUTH_MODE=local pnpm exec playwright test e2e/watch.spec.ts`: NOT RUN (environment limitation documented above)
