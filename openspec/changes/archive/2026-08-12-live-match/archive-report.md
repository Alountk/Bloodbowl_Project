# Archive Report: live-match

**Archived**: 2026-08-12
**Change**: `live-match` (MVP match detail view)
**Artifact store**: openspec (filesystem source of truth) + engram archive summary (per orchestrator instruction)
**Predecessor chain**: PR1 `feat/live-match-api` (#57, fixture GET + result snapshot winnings/mvp) → PR2 `feat/live-match-client` (#58, getMatchDetail + pure matchSummary mapping) → PR3 `feat/live-match-page` (#59, MatchView 3-state page + inert live shells) → PR4 `feat/live-match-nav` (#60, MatchCard "Ver partido" + configs + e2e/match-view.spec.ts) — all merged to main. Stacked-to-main chain.
**Status**: ✅ SDD cycle closed. Verified PASS, 0 blockers.
**Archive**: standard (no warnings carried; 0 CRITICAL / 0 WARNING / 1 SUGGESTION resolved as future work)

---

## Final State (at close)

The change shipped the **MVP match detail view** — the per-fixture match page with three states — across four merged, stacked-to-main PRs:

- **PR1 #57 — API + snapshot persistence**: new per-fixture GET `GET /api/leagues/[id]/fixtures/[fixtureId]` (MV-1). Auth-gated 401/404 no-leak, normalized payload `{fixture, result, homeTeam, awayTeam}` (nested teams stripped, `result` nullable), `enrichFixture` reused (D7). Result route POST persists per-side `winnings` + `mvp` in the snapshot JSON (D4); PUT recomputes `mvp` and preserves prior `winnings`; legacy rows lacking `winnings`/`mvp` unaffected (forward-only, MV-6 no migration).
- **PR2 #58 — Client fetch + pure mapping**: `getMatchDetail(leagueId, fixtureId)` client fn + types (D2/D3); pure `matchSummary.ts` section builders (D5): MVP persisted-`scores.mvp` first, legacy fallback (max-`pe`, floor≥4, tie-first, unresolved→omit-not-crash), weather/casualty Spanish labels, omit-if-empty sections, walkover detection.
- **PR3 #59 — Page + MatchView**: thin server page `app/leagues/[id]/fixtures/[fixtureId]/page.tsx` (D2) + client `MatchView.tsx`: 3-state rendering (played full summary / scheduled "Programado:" es-ES / pending notice), walkover notice, 404→`notFound`. `LiveTurnBar/LiveClock/LiveEventFeed` inert shells receive `live:null` → render null, no visible placeholder any static state (MV-5), no timeline (MV-6). Spanish copy + rulebook-light tokens only, no deps/icons (MV-7).
- **PR4 #60 — Navigation + E2E**: MatchCard always-rendered footer with "Ver partido" as the LAST DOM link (MV-4); scheduled/played lines byte-identical (Jornadas/match-report e2e green, AC-3); card-body click still negotiates. `playwright.config.ts` `testIgnore` + `playwright.config.auth.ts` `testMatch` route `match-view.spec.ts` into the auth suite only; new real-DB `e2e/match-view.spec.ts` (2 journeys).

**Two surgical fixes merged in PR 4** (both corroborated by git history in PR 4):
- **Per-side `winnings` in the result snapshot** (commit `9d39a55`, "fix(leagues): persist winnings per-side in the result snapshot"): result route POST writes `winnings` inside `home`/`away` per the `MatchScoreboard` contract consumed by `matchSummary.ts`/`MatchView`; PUT preserves prior per-side winnings. Legacy rows omit-if-empty, forward-only; no migration (MV-6). Recognized as a PR-1 latent bug corrected in PR 4.
- **`adminAsBye` harness guard** (commit `66e7e4e`, "fix(e2e): make the adminAsBye guard retry when admin is the second team"): `e2e/league-matchday.spec.ts` retry now checks both `t1 === teamAName || t2 === teamAName`, closing the admin-as-second-team flake. Test-harness only; no product behavior change. Auth e2e 18/18 confirms no regression.

**Verification (terminal, per `verify-report.md`)**: verdict **PASS**, 0 blockers, 0 CRITICAL, 0 WARNING, 1 SUGGESTION. **7/7 requirements, 13/13 scenarios COMPLIANT** with passing runtime evidence. At close: **`pnpm test` 962/962 (84 files)**, `pnpm lint` 0, `npx tsc --noEmit` clean, `AUTH_MODE=local playwright` 21/21 (match-view spec excluded via `testIgnore`), `test:e2e:auth` 18/18 real-DB (incl. two new match-view journeys). Strict TDD 6/6. No CRITICAL findings, no blockers.

**The 1 SUGGESTION** (non-blocking, future refactor): `enrichFixture` is cast-imported from `@/app/api/leagues/[id]/route` (D7), coupling the fixture route to the detail route — extract to `lib/fixtures.ts` in a later refactor PR. Pre-existing acknowledged tech debt noted in `tasks.md` Risks. Carried into archive as future work; not a defect.

## Review Gate (Native Review Receipt — structurally absent)

Following the repo precedent established by prior completed changes (`match-report` 2026-08-11 and earlier): no receipt-driven review governed this change. The change was archived under ordinary repository policy with `reviewGate` structurally absent — the kill switch is off and/or no review was ever started for this candidate, so zero review code ran and there is nothing to read or block on. The orchestrator launch confirmed `dependencies.archive: ready`. Per the Native Review Receipt Gate, this absence is not itself a defect and does not demand a receipt. **No `allow` was fabricated; this is not evidence of a receipt-validated review — it is a fully verified, four-PR-merged change closed under ordinary policy.**

## Task Completion Gate

All 21 implementation tasks (1.1–4.4) are `[x]` in `tasks.md`; 0 unchecked implementation tasks remain. The verification metrics confirm `Tasks complete: 21/21`, `incomplete: 0`. **No reconciliation was required.** The archived `tasks.md` carries zero `[ ]` rows and 21 `[x]` rows.

## Spec Sync to Source of Truth

The change carried a single delta spec, `match-view`, containing 7 purely ADDED requirements (MV-1…MV-7, 13 scenarios) in a **new capability domain** — it extends no existing requirement and modifies/removes none.

| Main spec | Action | Merge detail |
|-----------|--------|--------------|
| `openspec/specs/match-view/spec.md` | **Created** (NEW full spec) | Copied mechanically from delta, byte-identical (`diff -r` empty) — 7 ADDED requirements (MV-1 Auth-Gated Endpoint, MV-2 Played Snapshot Summary, MV-3 Scheduled/Pending, MV-4 MatchCard Access, MV-5 Inert Live Shells, MV-6 Out-of-Scope Lock, MV-7 Design System + Copy), 13 scenarios. |

**Merge note (least-destructive)**: `match-view` is a self-contained new capability (per the repo's capability-per-domain convention — `team-detail-view`, `matchday-forfeit`, `match-result`, etc. each live in their own `openspec/specs/<capability>/spec.md`). The delta was 100% ADDED requirements, so the consolidated main spec is the delta spec itself, copied byte-identical. No existing spec (`league-season`, `match-result`, `bb2025-rules`, `leagues`) was modified or required any merge — the match view's requirements sit atop the already-consolidated fixture/matchday/match-result requirements without conflicting with them (MV-1 builds on the league-secured fixture GET; MV-2 consumes the `MatchResult` snapshot from `match-result`; MV-4 extends the MatchCard already governed by `league-season`/`leagues`). **No requirement was lost in the merge.** Authoritative totals preserved: 7 requirements / 13 scenarios.

## Artifacts Archived

- `exploration.md` ✅
- `proposal.md` ✅
- `specs/match-view/spec.md` ✅ (delta spec)
- `design.md` ✅
- `tasks.md` ✅ (21/21 tasks all `[x]`, no unchecked)
- `apply-progress.md` ✅ (intermediate snapshot — final state per Final-State Authority supersedes; PR 4 merge note `205b8c9` "docs(leagues): merge PR 4 apply progress")
- `verify-report.md` ✅ (PASS; 7/7 reqs, 13/13 scenarios; this is the terminal report)
- `archive-report.md` ✅ (this file)

Engram traceability: archive summary persisted to engram topic `sdd/live-match/archive-report` (`capture_prompt: false`). The change's authoritative artifacts live on the openspec filesystem (this is an openspec-store change).

## Verification Checklist

- [x] Main specs updated correctly (`openspec/specs/match-view/spec.md` created; byte-identical `diff -r` empty; 7 reqs / 13 scenarios fully present)
- [x] Change folder moved to `openspec/changes/archive/2026-08-12-live-match/` (mechanical `mv` + recursive snapshot, `diff -r` empty)
- [x] Archive contains all artifacts (exploration, proposal, match-view spec, design, tasks, apply-progress, verify-report, archive-report)
- [x] Archived `tasks.md` has no stale unchecked tasks (21/21 `[x]`, zero `[ ]`)
- [x] Active `openspec/changes/` no longer contains `live-match` (only `archive`)
- [x] Verbatim `diff -r` readbacks both empty (spec sync + folder move) — byte-identity proven

## Future Work (out of scope, carried)

- **Realtime live mode** (turns/half/clock/event feed) — explicitly out of MVP scope (MV-5/MV-6). The inert shells (`LiveTurnBar/LiveClock/LiveEventFeed`) are in place to receive live data in a future change; the chronological timeline remains future work.
- **Standings** (tabla de posiciones) — remaining roadmap item after result loading and matchday completion.
- **`enrichFixture` extraction** to `lib/fixtures.ts` (from the 1 SUGGESTION / D7 tech debt) — later refactor PR.

## SDD Cycle Complete

`live-match` has been fully planned, proposed, specified, designed, implemented (PR1 #57 → PR2 #58 → PR3 #59 → PR4 #60, stacked-to-main), independently verified (PASS), merged, spec-synced (1 new domain `match-view` created), and archived. Ready for the next change. The next roadmap feature is **standings** (tabla de posiciones); the realtime **Partido en vivo** feature itself remains future work.
