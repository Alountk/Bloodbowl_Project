# Apply Progress: Matchday — PR1 + PR2 + PR3 (DB+API + UI + e2e/Polish)

**Change**: `league-matchday`
**PR**: PR1 (DB + API) → PR2 (UI Pattern B) → PR3 (e2e journeys + polish) — stacked-to-main chain
**Branch**: `feat/league-matchday-pr1` (base `main`) → `feat/league-matchday-pr2` (from PR1) → `feat/league-matchday-pr3` (from PR2)
**Mode**: Strict TDD (runner `pnpm test`)
**Status**: PR1 1.1–1.14 ✅, PR2 2.1–2.12 ✅, PR3 3.1–3.4 ✅ (all tasks complete). Ready for `sdd-verify`.

---

## PR3 — e2e Journeys + Polish

**Branch**: `feat/league-matchday-pr3` (created FROM `feat/league-matchday-pr2`, stacked-to-main — the final slice)
**Scope**: Real-DB multi-user e2e journeys for negotiation, forfeit/completion, and rival scouting (the PR2-verify deferred items), plus a polish fix surfaced while writing them. This closes the PR chain.

### Work Units Delivered (PR3)

| # | Unit | Commit | Scope | Focused test | Runtime harness | Rollback |
|---|------|--------|-------|--------------|-----------------|----------|
| 1 | Matchday e2e journeys | ``ea10ea2`` | New `e2e/league-matchday.spec.ts` (3 real-DB journeys) + register in `playwright.config.auth.ts` testMatch + ignore in local `playwright.config.ts` | auth config run `--grep matchday` → **3 passed** (negotiation / forfeit / scouting) | full `playwright.config.auth.ts` → **12 passed** (9 legacy + 3 new) against real Postgres | revert `e2e/league-matchday.spec.ts` + both playwright configs only |
| 2 | Polish: scheduled footer shows agreed time | ``3e99650`` | MatchCard scheduled footer now shows date AND time (was date-only), so the agreed slot a participant negotiated is fully visible | `pnpm vitest run features/leagues/MatchCard.test.tsx` → **13 pass** (RED→GREEN: new time-on-footer test failed before the change) | covered by the negotiation e2e (asserts the agreed date+time on the Programado card) | revert `features/leagues/MatchCard.tsx` + `.test.tsx` only |

### TDD Cycle Evidence (PR3)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 3.1–3.3 journeys (negotiation/forfeit/scouting) | `e2e/league-matchday.spec.ts` | E2E (real Postgres) | ✅ 21 local + 9 auth green before changes; not touched | ✅ Journey written first against existing PR1/PR2 behavior | ✅ Negotiation 1 pass, forfeit 1 pass, scouting 1 pass | ✅ 3 distinct journeys with different data (2/3-user setups, distinct slots) | ✅ Pair-discovery refactor (`adminAsBye` retry + async-commit polling) |
| 3.4 polish (scheduled footer time) | `features/leagues/MatchCard.test.tsx` | Unit + Integration | ✅ 10/10 pre-existing MatchCard tests green | ✅ Written first — `Programado: DD/MM/YYYY HH:MM` fails against date-only footer | ✅ Passed (13) after `formatMatchDate` adds time | ✅ 2 slots (10:00, 20:30) + null/invalid edge | ✅ Clean (`formatMatchDate` pure, es-ES 24h) |

### Work Unit Evidence (PR3)

| Evidence | Required value |
|---|---|
| Focused test command and exact result | `pnpm exec playwright test --config playwright.config.auth.ts --grep matchday` → **3 passed** (17.7s / 15.3s / 16.5s individually; rerun-safe, idempotent unique names/emails per run) |
| Runtime harness command/scenario and exact result | Full `AUTH_MODE=local pnpm exec playwright test` → **21 passed**; full `playwright.config.auth.ts` → **12 passed**; real-DB Postgres journey (negotiate + forfeit + scouting) exercised each mutation end-to-end |
| Rollback boundary | Commit A revert removes only the e2e spec + config wiring; commit B revert removes only the MatchCard polish + tests. No route/schema/other UI changes were touched in PR3 |

### Verification Results (PR3)

| Command | Result |
|---------|--------|
| `pnpm test` | **56 files / 692 tests** passed (baseline 689 → +3 polish) |
| `AUTH_MODE=local pnpm exec playwright test` | **21 passed** |
| `pnpm exec playwright test --config playwright.config.auth.ts` | **12 passed** (9 legacy + 3 new matchday journeys) |
| `pnpm lint` | clean (0 errors, 0 warnings) |
| `npx tsc --noEmit` | clean |

### Files Changed (PR3)

| File | Action | What Was Done |
|------|--------|---------------|
| `e2e/league-matchday.spec.ts` | Created | 3 real-DB journeys: (1) negotiation — participants propose/counter/accept → Programado + agreed time, member-non-participant sees read-only history; (2) forfeit — admin walkover → Jugado + winner + Jornada completa, non-admin API 403; (3) scouting — member views rival read-only roster, outsider → Team not found boundary |
| `playwright.config.auth.ts` | Modified | Added `**/league-matchday.spec.ts` to the auth-suite `testMatch` |
| `playwright.config.ts` | Modified | Added `**/league-matchday.spec.ts` to the local project `testIgnore` (auth-only spec) |
| `features/leagues/MatchCard.tsx` | Modified | `formatMatchDate` now renders DD/MM/YYYY HH:MM (es-ES 24h) so the agreed slot shows its time |
| `features/leagues/MatchCard.test.tsx` | Modified | New time-on-scheduled-footer test (RED→GREEN) + `formatMatchDate` describe (null/invalid + two distinct slots) |
| `openspec/changes/league-matchday/tasks.md` | Updated | PR3 tasks 3.1–3.4 marked `[x]` |

### Deviations from Design (PR3)
1. **Spec/journey conflict surfaced**: the `matchday-negotiation` spec forbids the league OWNER from negotiating ("The league owner ... MUST NOT negotiate"), even when the owner's own team is a fixture participant. The orchestrator's literal journey described "A proposes → A accepts" with A the admin — which the spec (and PR1/PR2 behavior) disallows. The negotiation journey therefore partners the two NON-ADMIN members as the negotiators (`adminAsBye` retry ensures the admin lands as the round's non-participant) and asserts the admin's team sees the history read-only, exactly per spec. This is a test-scenario resolution, not a production change.
2. **Deterministic pairing via retry**: the start route shuffles team ids (nondeterministic), and with an odd team count the round-1 fixture + bye are random. The negotiation journey retries a fresh league (bounded, unique data) until the admin is the round-1 bye, guaranteeing the fixture pairs two non-admin members. Bounded 8 attempts (~2/3 success per attempt → ~feasible within test timeout).
3. **Cross-user commit visibility**: each member page holds a snapshot of the league detail, so a proposal made by one user is not visible to another until that page reloads. The journey reloads each page before opening the negotiation panel and polls the proposals API until the mutation commits (the propose/accept POSTs are dispatched async after the form submit). Deterministic across users.
4. The "Jornada completa" completion badge lives in the round header, not inside the cards' `region` — the forfeit journey asserts it at page scope and documented the DOM.

### Issues Found (PR3)
- **Initial run failures were test-design bugs, not product defects**: (a) members B/C were not navigated to the STARTED jornada before negotiating (fixed by reloading after start); (b) the round-robin shuffle made the "which two members negotiate" nondeterministic (fixed via `adminAsBye` retry); (c) cross-page proposal visibility needed a reload + commit poll. All resolved; final runs green.
- The custom `app/teams/[teamId]/not-found.tsx` renders "Team not found" (not the Next default), which the scouting journey asserts.

### Workload / PR Boundary (PR3)
- Mode: **chained stacked-to-main slice** (PR3 of 3 — final)
- Current work unit: matchday e2e journeys + scheduled-time polish
- Boundary: starts from `feat/league-matchday-pr2`, ends at the completed multi-user e2e journeys + polish. Finishes the chain.
- Review budget impact: ~380 authored +/− lines (spec + configs + polish) across 2 work-unit commits + docs; well under the 400-line chained guard.
- PR creation: deferred to the orchestrator after `sdd-verify` (do NOT create the PR).

---

## PR2 — UI (Pattern B)

**Branch**: `feat/league-matchday-pr2` (created FROM `feat/league-matchday-pr1`, stacked-to-main)
**Scope**: Jornadas round tabs + MatchCards, NegotiationPanel (participant-only), ForfeitModal (admin-only), rival scouting fallback on the team detail page. PR3 (dedicated forfeit/negotiation e2e journeys, polish) explicitly NOT included.

### Work Units Delivered (PR2)

| # | Unit | Commit | Scope | Focused test | Runtime harness | Rollback |
|---|------|--------|-------|--------------|-----------------|----------|
| 1 | Components: MatchCard + NegotiationPanel + ForfeitModal | `cd2d3b4` | Pattern B card (VS, owner below, status badge, team scouting link, card→negotiate), participant-only propose/accept panel, admin forfeit modal + pure helpers | `pnpm vitest run features/leagues/MatchCard.test.tsx features/leagues/NegotiationPanel.test.tsx features/leagues/ForfeitModal.test.tsx` → **24 pass** | Rendered/clicked in the restarted dev server during component work; full league-season auth e2e (below) proves no selector regressions | `git revert cd2d3b4` — removes only the three components |
| 2 | Jornadas tabs + wiring + completion badge | `d3a7cf1` | LeagueDetail `Jornadas` → Pattern B round tabs (default first/current), MatchCard grid per round, negotiation/forfeit wiring, round-completion badge, `rounds` on LeagueDetail type, hook propose/accept/forfeit | `pnpm vitest run features/leagues/LeagueDetail.test.tsx` → **12 pass** (tabs/default/completion/links/participant/admin) | league-season auth e2e green (jornada region, vs count, Iniciada badge preserved) | `git revert d3a7cf1` — only the Jornadas wiring |
| 3 | Rival scouting fallback | (pending) | Team detail page fetches `GET /api/teams/[id]` for teams missing from the store; renders read-only; `notFound()` on 404 | `pnpm vitest run "app/teams/[teamId]/page.test.tsx"` → **8 pass** (incl. 3 scouting-fallback cases) | Real-DB run: outsider scouting returns 404 (scouting GET route already e2e-covered in PR1) | `git revert` the page.tsx/page.test.tsx changes only |

### TDD Cycle Evidence (PR2)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 2.1 tabs / default round | `features/leagues/LeagueDetail.test.tsx` | Integration (RTL) | ✅ 658 baseline | ✅ Written (tabs render, round 1 aria-selected) | ✅ Passed | ✅ 2 cases (default round 1; switch to round 2) | ✅ Clean |
| 2.2–2.4 MatchCard + rival link | `features/leagues/MatchCard.test.tsx` | Unit + Integration | N/A (new) | ✅ Written first (VS center, owner below, status, team link, card click) | ✅ Passed (10) | ✅ statuses pending/scheduled/played + links + owner-differs | ✅ Clean (pure `matchStatusLabel`/`formatMatchDate`) |
| 2.5–2.6 NegotiationPanel | `features/leagues/NegotiationPanel.test.tsx` | Unit + Integration | N/A (new) | ✅ Written first (participant propose/accept, read-only others/admin) | ✅ Passed (9) | ✅ self vs other accept, date+time, non-participant/admin | ✅ Clean (pure `buildProposalDateTime`) |
| 2.7–2.8 ForfeitModal | `features/leagues/ForfeitModal.test.tsx` | Integration | N/A (new) | ✅ Written first (admin home/away pick, closed state) | ✅ Passed (5) | ✅ home winner + away winner + closed + cancel | ➖ None needed |
| 2.9–2.10 completion badge | `features/leagues/LeagueDetail.test.tsx` | Integration | ✅ (above) | ✅ Written first (round 1 pending → no badge; round 2 played → badge) | ✅ Passed | ✅ 2 cases (incomplete vs complete round) | ✅ Clean |
| 2.11–2.12 scouting fallback | `app/teams/[teamId]/page.test.tsx` | Integration (RTL) | ✅ 5/5 (existing) | ✅ Written first (rival fetch → read-only; 404 → notFound; local team preserved) | ✅ Passed (8) | ✅ 3 cases (rival 200, rival 404, local no-fetch) | ✅ Clean (no sync setState in effect — lint compliant) |

### Test Summary (PR2)
- **Total tests written (new)**: 31 (10 MatchCard + 9 NegotiationPanel + 5 ForfeitModal + 7 LeagueDetail rewrites/additions + 3 team-detail scouting)
- **Total tests passing**: **689** (`pnpm test` = 56 files; baseline 658 → +31)
- **Layers used**: Unit (pure helpers), Integration (RTL renders with mocked fetch), E2E (local 21 + auth 9)
- **Approval/safety nets**: existing LeagueDetail + team-detail tests updated to Pattern B; league-season auth e2e preserved (region/vs selectors intact)
- **Pure functions created**: `matchStatusLabel`, `formatMatchDate`, `buildProposalDateTime`, `formatProposalDateTime`

### Verification Results (PR2)

| Command | Result |
|---------|--------|
| `pnpm test` | **56 files / 689 tests** passed (baseline 658) |
| `AUTH_MODE=local pnpm exec playwright test` | **21 passed** |
| `pnpm exec playwright test --config playwright.config.auth.ts` | **9 passed** (incl. league-season journey) |
| `pnpm lint` | clean (0 errors, 0 warnings) |
| `npx tsc --noEmit` | clean |

### Files Changed (PR2)

| File | Action | What Was Done |
|------|--------|---------------|
| `features/leagues/MatchCard.tsx` + `.test.tsx` | Created | Pattern B card: header "Partido N · status", centered VS, team name + owner below (from homeOwner/awayOwner), team→scouting link, card→negotiate; status badges Pendiente/Programado/Jugado |
| `features/leagues/NegotiationPanel.tsx` + `.test.tsx` | Created | Participant-only propose (date+time→ISO) / accept-other-active-proposal; history with ✓ Acordado; read-only for non-participants/admin |
| `features/leagues/ForfeitModal.tsx` + `.test.tsx` | Created | Admin-only walkover: list two teams, pick winner → forfeit |
| `features/leagues/LeagueDetail.tsx` + `.test.tsx` | Modified | `Jornadas` → Pattern B round tabs (default first/current), MatchCard grid, completion badge, negotiation/forfeit wiring |
| `features/leagues/api.ts` | Modified | `LeagueDetail` now carries `rounds: FixtureRound[]` (completion flags) |
| `features/leagues/useLeagueDetail.ts` | Modified | Added `propose`/`accept`/`forfeit` actions (each refreshes after mutation) |
| `app/teams/[teamId]/page.tsx` + `.test.tsx` | Modified | Rival-scouting fallback: fetch `getScoutedTeam` when not in store; render read-only; `notFound()` on 404; local owner path unchanged |

### Deviations from Design (PR2)
1. The negotiation/forfeit are opened as **overlay modals** from the card (not a persistent side panel). Pattern B's prototype ("cards + panel") is realized as a modal opened on card click, keeping the tabbed grid uncluttered; the NegotiationPanel/ForfeitModal components remain independently testable and reusable.
2. Round **completion badge** reads the detail GET's `rounds[].complete` (as dered in PR1) rather than recomputing client-side — avoids duplicating the played-derivation logic.
3. The status is rendered inline in the card header ("Partido N · Jugado") plus a footer (Programado date / Ganador name) rather than a separate floating badge, matching the prototype's header copy while keeping the badge text queryable.

### Issues Found (PR2)
- The `react-hooks/set-state-in-effect` lint rule flagged an initial effect that reset scouting state synchronously on the team page. Reworked to avoid synchronous setState in the effect body (set only inside async fetch callbacks, derive the loading skeleton from `scouted === null && !scoutFailed`). Lint clean.
- The existing "jornadas as Home vs Away" LeagueDetail test and the type-constructed `LeagueDetail` fixtures in `api.test.ts` were updated for Pattern B (rounds on the type). None of these are behavioral regressions — they codify the new tabbed UI.

### Workload / PR Boundary (PR2)
- Mode: **chained stacked-to-main slice** (PR2 of 3)
- Current work unit: PR2 — Pattern B UI + negotiation + forfeit + rival scouting
- Boundary: starts from `feat/league-matchday-pr1`, ends at the completed Pattern B UI + scouting fallback; PR3 (dedicated e2e journeys + polish) explicitly NOT included
- Review budget impact: ~640 authored +/− lines across 3 work-unit commits, each independently revertable and verified (24 + 12 + 8 new focused tests)
- PR creation: deferred to the orchestrator after `sdd-verify` (do NOT create the PR)

---

## PR1 — DB + API (kept as delivered)

**Branch**: `feat/league-matchday-pr1`
**Status**: All PR1 tasks (1.1–1.14) complete + verified PASS.

| # | Unit | Commit | Scope |
|---|------|--------|-------|
| 1 | Schema + migration + client API | `f31f9c0` | Fixture `scheduledAt`/`winnerId`, `ScheduleProposal`, `add_matchday` migration; `features/leagues/api.ts` types + helpers |
| 2 | propose/accept/forfeit/proposals routes | `416561f` | Participant-only negotiation + admin forfeit + history |
| 3 | Scouting GET `/api/teams/[id]` | `a8a1705` | Read-only visibility-gated scouting |
| 4 | League detail enrichment | `d987322` | Per-fixture status/owners/proposals + per-round completion |
| — | PR1 verify record | `68a7b48` | `docs(league-matchday): record PR1 verify PASS` |

### TDD Cycle Evidence (PR1, as delivered to verify)

| Task | Test File | Layer | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|-----|-------|-------------|----------|
| 1.1 schema+migration | `features/leagues/api.test.ts` | Unit/type | ✅ Written | ✅ Passed (12) | ✅ 3 cases | ✅ Clean |
| 1.2–1.3 propose route | `.../propose/route.test.ts` | Integration | ✅ Written first | ✅ Passed (7) | ✅ 7 cases | ✅ Clean |
| 1.4–1.5 accept route | `.../accept/route.test.ts` | Integration | ✅ Written first | ✅ Passed (6) | ✅ 6 cases | ✅ Clean |
| 1.6–1.7 forfeit route | `.../forfeit/route.test.ts` | Integration | ✅ Written first | ✅ Passed (6) | ✅ 6 cases | ✅ Clean |
| 1.8–1.9 proposals route | `.../proposals/route.test.ts` | Integration | ✅ Written first | ✅ Passed (4) | ✅ 4 cases | ✅ Clean |
| 1.10–1.11 scouting GET | `app/api/teams/[id]/route.test.ts` | Unit + Integration | ✅ Written first | ✅ Passed (19) | ✅ 12 cases | ✅ Clean |
| 1.12–1.13 detail enrich | `app/api/leagues/[id]/route.test.ts` | Unit + Integration | ✅ Written first | ✅ Passed (15) | ✅ 5 cases | ✅ Clean |
| 1.14 client API helpers | `features/leagues/api.test.ts` | Unit | ✅ Written first | ✅ Passed (5 new) | ✅ 5 cases | ✅ Clean |

### Files Changed (PR1)

| File | Action | What Was Done |
|------|--------|---------------|
| `prisma/schema.prisma` + `prisma/migrations/20260809121445_add_matchday/migration.sql` | Modified / Created | Fixture `scheduledAt`/`winnerId`, `ScheduleProposal`, additive migration |
| `features/leagues/api.ts` | Modified | FixtureStatus, ScheduleProposal, enriched FixtureDraft, FixtureRound; propose/accept/forfeit/getProposals/getScoutedTeam |
| `app/api/leagues/[id]/fixtures/[fixtureId]/{propose,accept,forfeit,proposals}/route.ts` + tests | Created | Negotiation + admin forfeit + history |
| `app/api/teams/[id]/route.ts` + test | Modified | Scouting GET with visibility gate |
| `app/api/leagues/[id]/route.ts` + test | Modified | Enriched detail + per-round `complete` |
| `openspec/changes/league-matchday/tasks.md` | Modified | PR1 tasks 1.1–1.14 marked `[x]` |

### Verification Results (PR1)

| Command | Result |
|---------|--------|
| `pnpm test` | 49 files / 658 tests passed |
| `AUTH_MODE=local pnpm exec playwright test` | 21 passed |
| `pnpm exec playwright test --config playwright.config.auth.ts` | 9 passed |
| `pnpm lint` | clean |
| `npx tsc --noEmit` | clean |

### Workload / PR Boundary (PR1)
- Mode: **chained stacked-to-main slice** (PR1 of 3)
- Boundary: starts from `main`, ends at the API/enrichment layer; UI (PR2) and e2e polish (PR3) not included.
