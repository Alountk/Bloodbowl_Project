# Archive Report: live-match-realtime

**Archived**: 2026-08-12
**Change**: `live-match-realtime` (Interactive 2-coach Live Match — realtime live mode)
**Artifact store**: openspec (filesystem source of truth) + engram archive summary (per orchestrator instruction)
**Predecessor chain**: PR1 `feat/live-match-realtime-pr1` (#61, migration + league clock option) → PR2 `feat/live-match-realtime-pr2` (#62, SSE subscribe hub + GET) → PR3 `feat/live-match-realtime-pr3` (#63, control + transitions + POST) → PR4 `feat/live-match-realtime-pr4` (#64, client `useLiveMatch` hook + DTO) → PR5 `feat/live-match-realtime-pr5` (#65, MatchView live shells + timeline + labels) → PR6 `feat/live-match-realtime-pr6` (#66, result prefill + e2e) → **remediation PR7 `feat/live-match-realtime-fix` (#67, verify-finding fixes: e2e home/away + hook flake + D4 clock-0 auto-end)**. All 7 merged to main, stacked-to-main.
**Status**: ✅ SDD cycle closed. Verified PASS (re-run after #67 remediation).
**Archive**: standard — 0 CRITICAL, 0 blocking WARNING, 2 SUGGESTIONs carried as future work.

---

## Final State (at close)

The change shipped the **interactive 2-coach realtime live mode** across seven merged, stacked-to-main PRs (#61–#67):

- **PR1 #61 — Migration + league clock option**: additive Prisma migration adding `League.turnClockEnabled Boolean @default(true)` + `turnClockSeconds Int @default(240)` (backfills existing rows enabled@240). League creation accepts the option (enabled toggle + 120/240/360 duration, else 400; 240 default; immutable after creation — no update path). `lib/liveAccess.ts` read/write role matrix (401/404/403; local parity 401).
- **PR2 #62 — SSE subscribe + hub**: `lib/liveHub.ts` in-memory hub (narrow interface, grace/ticker gated on `turnClockEnabled`, publish only when subs exist), `GET .../live` streams `text/event-stream` (snapshot-first, gap replay by `seq > snapshot.seq`, abort cleanup, `force-dynamic`).
- **PR3 #63 — Control + pure transitions**: pure `lib/liveMatch.ts` invariants (alternation, no-double-action, 8-turn/half flip, TD-auto-ends-turn, `endMatch`, start guards, clocks-disabled inertness), `lib/liveStore.ts` (`applyTransition` reads league option, optimistic `seq`, atomic `$transaction`, publish-after-commit), POST control `.../live` (401/404/403/409 seq-conflict on `updateMany` 0 rows → 409, start-on-played → 409). 10s active-coach grace pause/resume, restart-survives via persisted timestamps.
- **PR4 #64 — Client hook + DTO**: `useLiveMatch` SSE hook (connect, snapshot-first, reconnect via Last-Event-ID, control restored), DTO `turnClockEnabled` + nullable clocks/paused on disabled, `clockSeconds` absent.
- **PR5 #65 — MatchView + timeline + labels**: live UI from `useLiveMatch`; hidden clocks when `turnClockEnabled` false; static states keep `not.toContainText(/turno|tiempo|evento|minuto|½/i)`; Spanish `liveEventLabels.ts`; fixture GET returns `live: LiveMatchViewState | null`.
- **PR6 #66 — Prefill + e2e**: result modal prefill (scores + per-scorer TD from live DTO only; MJP/casualty/actions stay user input; POST authoritative), `e2e/live-match.spec.ts` (auth suite only; two-context + new-device recovery; local config exclusion).
- **PR7 #67 — Remediation** (after first verify FAIL): **e2e home/away nondeterminism** (`d735ae9` — derive `homeTeamName`/`awayTeamName` from the real fixture, no `admin=home` assumption), **hook-test flake** (`d735ae9` — `await act(async () => …)` + `waitFor`), and **D4 clock-0 auto-end** (`818d283` — pure `autoEndTurnOnClockZero` + hub `onClockExpired` seam + route persistence/publish). Re-verified PASS.

**Verify (terminal, re-run after #67 remediation)**: verdict **PASS**, 0 blockers, 0 CRITICAL, 0 blocking WARNING. **14/14 requirements, 37/37 scenarios COMPLIANT**, 23/23 tasks `[x]`. Validated evidence at close: focused units **156/156** (14 files), full `pnpm test` **1074/1074 (92 files) ×2** (flake confirmed gone), `pnpm lint` clean, `npx tsc --noEmit` clean, local e2e **21/21** (live-match spec excluded via `testIgnore`), authoritative auth e2e **27/27 passed twice** (real Postgres, home and away fixture sides both deterministic).

## Verify FAIL → Remediation → PASS audit trail (mandatory record)

- **Prior verdict** (pre-#67): **FAIL** — authoritative auth e2e red (`e2e/live-match.spec.ts:197` prefill assertion failed ~50% when round-robin placed the league-owner on the AWAY side), a flaky `useLiveMatch.test.tsx` hook test, and the D4 "clock reaching 0 auto-ends the turn" design gap (not yet implemented).
- **Remediated via PR #67** (`ec23a9a`, merged to `main`, 3 commits + docs): the three findings fixed as above and independently re-verified green (both auth e2e runs 27/27). Git-corroborated: FAIL recorded in `371ce9e` ("docs(sdd): record live-match-realtime verify FAIL"), remediation in `67bf77c` + `818d283` + `d735ae9`.
- **No CRITICAL findings at any point do not reverse the gate**: CRITICAL issues would always block archive; here the first run was a FAIL (not a CRITICAL-blocked state), fully remediated and re-verified PASS before archive.

## Documented Ops Constraint (runbook note — MUST be preserved)

- **Deploy MUST run a single `next start` process** for the SSE fan-out and the D4 clock ticker to broadcast between coaches. Under `next dev` (Turbopack module isolation), the in-memory `liveHub` singleton is re-instantiated per request, so a live SSE push between two co-tested browser contexts is not observable in the e2e. The e2e verifies Coach B / fresh-device convergence via the DB-backed snapshot-first (LM-8) path plus D4 expiry via DB state; the realtime fan-out and ticker are covered by the unit/route tests. This is a documented dev-mode constraint, not a product defect. Safe on the single Arcane container (one `next start` process is the production deployment shape).
- **Local mode**: `AUTH_MODE=local` realtime routes return 401 by design (LM-2 parity); the live e2e runs only in the auth suite.
- **Auth e2e runtime requirement**: `test:e2e:auth` requires Docker/Postgres (`POSTGRES_PORT=5433`) and a single running `next start` for full fan-out observability.

## Review Gate (Native Review Receipt — structurally absent)

Following the repo precedent of prior completed changes (`live-match` MVP 2026-08-12 and earlier): no receipt-driven review governed this change. The change was archived under ordinary repository policy with `reviewGate` structurally absent — the kill switch is off and/or no review was ever started for this candidate, so zero review code ran and there is nothing to read or block on. The orchestrator launch confirmed `dependencies.archive: ready`. Per the Native Review Receipt Gate, this absence is not itself a defect and does not demand a receipt. **No `allow` was fabricated; this is not evidence of a receipt-validated review — it is a fully verified, seven-PR-merged change closed under ordinary policy.**

## Task Completion Gate

All 23 implementation tasks (1.1–6.3, incl. new 3.4 for the D4 remediation) are `[x]` in `tasks.md`; 0 unchecked implementation tasks. Verify metrics confirm `Tasks complete: 23/23`, `incomplete: 0`. **No reconciliation was required.** The archived `tasks.md` carries zero `[ ]` rows and 23 `[x]` rows.

## Spec Sync to Source of Truth

The change carried three delta specs. Per the repo's capability-per-domain convention, deltas to existing capabilities were merged into those main specs (least-destructive MODIFIED block replacement, unrelated requirements preserved verbatim); the new capability became its own main spec byte-identical to its delta.

| Main spec | Action | Merge detail |
|-----------|--------|--------------|
| `openspec/specs/live-match-realtime/spec.md` | **Created** (NEW full spec) | Copied mechanically from delta, byte-identical (`diff -r` empty) — 10 requirements (LM-1..LM-10), 29 scenarios. |
| `openspec/specs/leagues/spec.md` | **Updated** (2 MODIFIED) | REPLACED the "League Model" block (adds `turnClockEnabled`/`turnClockSeconds`, +1 scenario) and the "League User-Scoped API" block (POST accepts turn-clock option, immutability, +3 scenarios; previously accepted no option). Both blocks byte-identical to the delta's MODIFIED content. All 4 unrelated requirements (Team Membership Assignment, Public Open League Listing, Open League Detail Public, Member Self-Leave) preserved verbatim. 23 scenarios total, no requirement/scenario lost. |
| `openspec/specs/match-view/spec.md` | **Updated** (2 MODIFIED + AC) | REPLACED the "MV-5 · Inert Live Shells" block (now renders live state via `useLiveMatch`, +1 scenario) and the "MV-6 · Out-of-Scope Lock" block (migration for LiveMatch/LiveEvent + live-and-played timeline now implemented; replay/taxonomy/public stay out; +1 scenario net). Updated the AC-4/AC-5 rows per the delta's supersede note. MV-1..MV-4 and MV-7 preserved verbatim. 15 scenarios total, no requirement/scenario lost. |

**Merge note (least-destructive)**: all three syncs preserve authoritative totals — the merged/main specs carry every delta requirement and scenario with byte-identical content where the delta governs, and preserve all non-delta requirements/scenarios verbatim. Verified by block-level diff (each MODIFIED block in the main spec byte-identical to the delta's requirement block) plus scenario counting. **No requirement was lost in the merge.** Consolidated totals: live-match-realtime 10 reqs / 29 scenarios; leagues main 6 reqs / 23 scenarios; match-view main 7 reqs / 15 scenarios.

## Artifacts Archived

- `exploration.md` ✅
- `proposal.md` ✅
- `specs/` ✅ (3 delta specs: live-match-realtime, leagues, match-view)
- `design.md` ✅
- `tasks.md` ✅ (23/23 tasks all `[x]`, no unchecked)
- `apply-progress.md` ✅ (intermediate snapshot — final state per Final-State Authority supersedes; PR 6 merge note `f482232` "complete live-match-realtime")
- `verify-report.md` ✅ (PASS — terminal re-run; 14/14 reqs, 37/37 scenarios)
- `archive-report.md` ✅ (this file)

Engram traceability: archive summary persisted to engram topic `sdd/live-match-realtime/archive-report` (`capture_prompt: false`). The change's authoritative artifacts live on the openspec filesystem (this is an openspec-store change).

## Verification Checklist

- [x] Main specs updated correctly (`live-match-realtime` new; `leagues` + `match-view` merged; no requirement/scenario lost — delta 10+2+2 MODIFIED reqs / 29+12+4 delta scenarios fully present)
- [x] Change folder moved to `openspec/changes/archive/2026-08-12-live-match-realtime/` (mechanical `git mv` + recursive snapshot, `diff -r` empty)
- [x] Archive contains all artifacts (exploration, proposal, 3 specs, design, tasks, apply-progress, verify-report, archive-report)
- [x] Archived `tasks.md` has no stale unchecked tasks (23/23 `[x]`, zero `[ ]`)
- [x] Active `openspec/changes/` no longer contains `live-match-realtime` (only `archive`)
- [x] Verbatim `diff -r` readbacks both empty (spec sync + folder move) — byte-identity proven

## SUGGESTIONs Carried Into Archive (future work)

Two non-blocking SUGGESTIONs from the terminal verify-report are carried — neither is a defect, both are deliberate/deferred:

- **`foul`/`casualty` are append-record-only** (no alternation check / turn flip) — deliberate per D9/LM-9 intent (result POST authoritative); the SUGGESTION is to make out-of-turn foul/casualty an explicit tested decision (currently not rejected).
- **Changed-file coverage tooling** (e.g. `@vitest/coverage-v8`) — quantify new D4/hub/route line coverage; repo-wide gap, informational.

## Future Work (out of scope, carried)

- **Standings** (tabla de posiciones) — the next roadmap feature after result loading, matchday completion, and the realtime live mode.
- **Notificaciones** (channel undecided) — roadmap pending.
- **Histórico completo con replay / taxonomía amplia** — replay, full event taxonomy (interceptions/skills/weather), filters, and public viewing remain explicitly OUT of scope per MV-6 (the migration and timeline shipped; replay/taxonomy/public did not).
- **`enrichFixture` extraction** to `lib/fixtures.ts` (D7 tech-debt SUGGESTION carried from the live-match MVP archive) — later refactor PR.

## SDD Cycle Complete

`live-match-realtime` has been fully planned, proposed, specified, designed, implemented (PR1 #61 → PR2 #62 → PR3 #63 → PR4 #64 → PR5 #65 → PR6 #66 → remediation #67, stacked-to-main), independently verified (FAIL → remediated → PASS), merged, spec-synced (1 new domain `live-match-realtime` created, `leagues` + `match-view` merged), and archived. Ready for the next change. The next roadmap feature is **standings** (tabla de posiciones).
