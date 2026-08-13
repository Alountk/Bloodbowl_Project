# Archive Report: live-match-flow

**Archived**: 2026-08-12
**Change**: `live-match-flow` (Live Match Flow — consent phase, event permissions, turn nudge, rejornar, participant result correction; turn-clock deprecation)
**Artifact store**: openspec (filesystem source of truth) + engram archive summary (per orchestrator instruction)
**Predecessor chain**: PR1a `feat/live-match-flow-1a` (#71, server core) → PR1b `feat/live-match-flow-1b` (#72, client + deprecation + e2e) → PR2 `feat/live-match-flow-2` (#73, permissions + nudge) → PR3 `feat/live-match-flow-3` (#74, rejornar) → PR4 `feat/live-match-flow-4` (#75, correction) — all merged to main, stacked-to-main.
**Status**: ✅ SDD cycle closed. Verify **PASS WITH WARNINGS** (validator-admitted); single WARNING resolved post-verify.
**Archive**: standard — 0 CRITICAL, 0 blockers, 0 SUGGESTIONs; the 1 WARNING (stale doc comment) fixed in commit `b87fc39` and confirmed at HEAD.

---

## Final State (at close)

The change shipped the **live-match flow refinement** across five merged, stacked-to-main PRs (#71–#75):

- **PR1a #71 — Server core**: additive migration `20260812130000_add_live_match_flow` (ALTER TYPE `LiveMatchStatus` +`ready`, adds consent booleans + `startedAt` + `homeTurnMs`/`awayTurnMs`). New `consentStart`/`retractConsent`/`beginMatch` (LM-11; `ready → live` ONLY via the first turn). Unified server-owned match clock (LM-5): persisted `startedAt` kickoff, `homeTurnMs`/`awayTurnMs` accumulate over the active turn, `deriveLiveClock` shared by `toLiveViewState` and `serializeLive`; informational — no per-turn auto-end. **D4 removed** (`autoEndTurnOnClockZero`/`onClockExpired` deleted; grep audits 0 refs). Grace now pauses the unified clock via the persisted `paused` flag (LM-7). Per-viewer `viewerSide` in snapshot/POST/GET, hub frames null (D19).
- **PR1b #72 — Client + deprecation + e2e**: league creation modal/API **drop the per-turn clock option**; `turnClockEnabled`/`turnClockSeconds` become DEPRECATED (columns retained, no destructive drop; POST /api/leagues ignore-not-persisted per D15). MatchView consent/ready/begin flow + unified clock UI; e2e begin-step derives the coach side from the real fixture owner map (randomized home/away).
- **PR2 #73 — Permissions + nudge**: `lib/livePhase.ts` `resolveEventPermission` 6-cell matrix (D14): active coach may record all; non-active may record ONLY own-casualty; spectator 403 / foreign 404. `turnStart` + `requestTurn` events with 60s cooldown (D17); labels "Tu turno" / "Te piden el turno"; MatchView controls by `viewerSide`.
- **PR3 #74 — Rejornar**: propose/accept 409 ONLY on `played`/result fixtures (scheduled-not-played re-negotiable at any time before play); `accept` updates `scheduledAt` (including already-scheduled); NegotiationPanel gate widened to `pending` OR `scheduled`; history keeps old proposals; one-active-proposal invariant preserved via tx re-check.
- **PR4 #75 — Correction**: result PUT gate extended to `isAdmin ‖ isCaptain` (both participant coaches may correct; forfeit stays admin-only); `ResultAuthorization` + `Correction Authorization with Audit` (correction audit row, PE re-run, spent PE never revoked); MatchCard `(owner||participant)&&played` reveals "corregir"; new participant-correction e2e (match-report spec).

**Verify (terminal, validator-admitted PASS WITH WARNINGS)**: verdict `pass_with_warnings`, 0 blockers, 0 CRITICAL, 0 SUGGESTIONs. **14/14 requirements, 60/60 scenarios COMPLIANT**, 22/22 tasks `[x]`. Evidence at close: full `pnpm test` **1124/1124 (93 files)**, focused **237/237** (16 work-unit files), `pnpm lint` clean, `npx tsc --noEmit` clean, local e2e **21/21** (live-match begin-step excluded), authoritative auth e2e **31/31 passed twice** (deterministic across randomized home/away begin-step). Grep audits: `autoEndTurnOnClockZero` 0 refs, `onClockExpired` 0 functional refs, no turn-clock reads in the live stack or creation UI/API (League columns remain, deprecated).

## WARNING Resolution (single finding, fixed post-verify)

The terminal verify-report recorded **1 WARNING** (no CRITICAL, no blockers, no SUGGESTION): a stale top-of-file doc comment in `app/api/leagues/[id]/fixtures/[fixtureId]/propose/route.ts` stated a scheduled fixture was locked → 409, contradicting the implemented (correct) rejornar behavior (scheduled-not-played is re-negotiable). **Fixed post-verify in commit `b87fc39`** ("docs(leagues): update propose route comment for rejornar semantics", pushed to `main`, currently HEAD), which rewrote the comment to state a fixture `pending` OR `scheduled`-but-not-played is proposable and only `played` is locked → 409. The archive records **PASS + the doc-comment follow-up as resolved**. Git-corroborated: `b87fc39` is HEAD on `main`.

## Documented Ops Constraint (runbook note — MUST be preserved)

- **Deploy MUST run a single `next start` process** (in-memory `liveHub`) for the SSE fan-out to broadcast between coaches; under `next dev` module isolation the hub is re-instantiated per request. Safe on the single Arcane container (production runs one `next start`).
- **Additive migration deploy-ahead**: `20260812130000_add_live_match_flow` is applied via `prisma migrate deploy` in the container entrypoint before the live code runs.
- **Local mode**: `AUTH_MODE=local` realtime routes return 401 by design (LM-2 parity); the live e2e runs only in the auth suite.
- **Auth e2e runtime requirement**: `test:e2e:auth` requires Docker/Postgres (`POSTGRES_PORT=5433`) and a single running `next start` for full fan-out observability.

## Review Gate (Native Review Receipt — structurally absent)

Following the repo precedent of prior completed changes (live-match-realtime 2026-08-12 and earlier): no receipt-driven review governed this change. The change was archived under ordinary repository policy with `reviewGate` structurally absent — the kill switch is off and/or no review was ever started for this candidate. The orchestrator launch confirmed `dependencies.archive: ready`. Per the Native Review Receipt Gate, this absence is not itself a defect and does not demand a receipt. **No `allow` was fabricated; this is not evidence of a receipt-validated review — it is a fully verified, five-PR-merged change closed under ordinary policy.**

## Task Completion Gate

All 22 implementation tasks (1.1–4.3) are `[x]` in `tasks.md`; 0 unchecked implementation tasks. Verify confirms `Tasks complete: 22/22`, `incomplete: 0`. **No reconciliation was required.** The archived `tasks.md` carries zero `[ ]` rows and 22 `[x]` rows.

## Spec Sync to Source of Truth

The change carried four MODIFIED/ADDED/RENAMED delta specs. Per the repo's capability-per-domain convention, each delta was merged into its existing main spec (least-destructive block replacement; unrelated requirements preserved verbatim). All merges verified byte-identical in content (normalized `diff` shows no content difference; only boundary blank-line placement and next-heading lines differ, plus the intentional rename-traceability notes).

| Main spec | Action | Merge detail |
|-----------|--------|--------------|
| `openspec/specs/live-match-realtime/spec.md` | **Updated** (3 ADDED, 3 MODIFIED, 1 RENAMED) | ADDED LM-11 (Consent/Ready), LM-12 (Turn-Phase Permissions), LM-13 (Turn Nudge); MODIFIED LM-3 (consent/begin lifecycle), LM-5 (RENAMED → Unified Match Clock, unified per-side accumulation, D4 removed), LM-7 (grace pauses unified clock via persisted `paused`). Rename note preserved as a traceability block inside LM-5. LM-1/2/4/6/8/9/10 and the AC table preserved verbatim. |
| `openspec/specs/matchday-negotiation/spec.md` | **Updated** (1 ADDED, 3 MODIFIED) | ADDED "Rejornar — Re-Open Negotiation Before Play"; MODIFIED "One Active Proposal Invariant" (propose on scheduled re-opens; only played → 409), "Accept Sets scheduledAt" (re-schedules already-scheduled), "Status Transition" (scheduled re-negotiable, result untouched). "Participant-Only Negotiation", "Propose Date", "Negotiation History Visible" preserved verbatim. |
| `openspec/specs/match-result/spec.md` | **Updated** (1 RENAMED, 2 MODIFIED) | RENAMED "Admin-Only Correction with Audit" → "Correction Authorization with Audit" (rename note preserved); MODIFIED "Result Authorization" (captain correction 200, not 403) and "Correction Authorization with Audit" (admin OR either captain; forfeit stays admin-only; audit + PE re-run + spent PE never revoked; +participant-correction e2e scenario). "Score Validation", "Atomic Result Transaction", "Already-Played Guard and Idempotency" preserved verbatim. |
| `openspec/specs/leagues/spec.md` | **Updated** (2 MODIFIED — deprecation) | MODIFIED "League Model" (turn-clock columns DEPRECATED, retained for backward compatibility, +1 scenario "Deprecated clock columns retained") and "League User-Scoped API" (POST no longer accepts/validates turn-clock fields, ignore-not-persisted, creation UI drops the option, +3 scenarios). The prior "active per-turn clock option" scenarios removed per the delta (replaced by deprecated semantics); "Team Membership Assignment", "Public Open League Listing", "Open League Detail Public", "Member Self-Leave" preserved verbatim. |

**Merge note (least-destructive)**: all four syncs preserve authoritative totals — every delta requirement/scenario is present byte-identical in the consolidated main specs, and all non-delta requirements/scenarios are preserved verbatim. Verified by normalized block-level diff + scenario counting. **No requirement was lost in the merge.** Consolidated totals: live-match-realtime 13 reqs / 45 scenarios; matchday-negotiation 7 reqs / 21 scenarios; match-result 5 reqs / 14 scenarios; leagues 6 reqs / 24 scenarios.

## Deprecation Note (per-turn clock option)

The `League.turnClockEnabled`/`turnClockSeconds` per-turn clock option (introduced in the live-match-realtime change, PR #61) is now **deprecated but not removed**. The unified server-owned match clock (LM-5) replaced it: clocks no longer have a per-turn hard limit, the option no longer constrains live matches nor appears in the live DTO, and the creation UI/API no longer expose the toggle/duration select. The columns remain on the League model for backward compatibility (additive migration, no destructive drop). A future cleanup migration may drop the deprecated columns (see Future Work).

## Artifacts Archived

- `exploration.md` ✅
- `proposal.md` ✅
- `specs/` ✅ (4 delta specs: live-match-realtime, matchday-negotiation, match-result, leagues)
- `design.md` ✅
- `tasks.md` ✅ (22/22 tasks all `[x]`, no unchecked)
- `apply-progress.md` ✅ (intermediate snapshot — final state per Final-State Authority supersedes; PR 4 merge note `9c12f16` "record live-match-flow PR 4 apply progress (FINAL)")
- `verify-report.md` ✅ (`pass_with_warnings` — terminal; 14/14 reqs, 60/60 scenarios)
- `archive-report.md` ✅ (this file)

Engram traceability: archive summary persisted to engram topic `sdd/live-match-flow/archive-report` (`capture_prompt: false`). The change's authoritative artifacts live on the openspec filesystem (this is an openspec-store change).

## Verification Checklist

- [x] Main specs updated correctly (4 merged: live-match-realtime, matchday-negotiation, match-result, leagues; no requirement/scenario lost — all delta content byte-identical, unrelated preserved)
- [x] Change folder moved to `openspec/changes/archive/2026-08-12-live-match-flow/` (mechanical `mv` + recursive snapshot, `diff -r` empty)
- [x] Archive contains all artifacts (exploration, proposal, 4 specs, design, tasks, apply-progress, verify-report, archive-report)
- [x] Archived `tasks.md` has no stale unchecked tasks (22/22 `[x]`, zero `[ ]`)
- [x] Active `openspec/changes/` no longer contains `live-match-flow` (only `archive`)
- [x] Verbatim `diff -r` readbacks both empty (spec sync + folder move) — byte-identity proven

## Future Work (out of scope, carried)

- **Standings** (tabla de posiciones) — the next roadmap feature after result loading, matchday completion, the realtime live mode, and the live-match flow.
- **Notificaciones** (channel undecided) — roadmap pending.
- **Histórico completo con replay / taxonomía amplia** — replay, full event taxonomy (interceptions/skills/weather), filters, public viewing remain OUT of scope per MV-6.
- **Cleanup migration dropping the deprecated `League` turn-clock columns** (`turnClockEnabled`/`turnClockSeconds`) — future, once backward compatibility is no longer needed.
- **`enrichFixture` extraction** to `lib/fixtures.ts` (D7 tech-debt SUGGESTION carried from the live-match MVP archive) — later refactor PR.

## SDD Cycle Complete

`live-match-flow` has been fully planned, proposed, specified, designed, implemented (PR1a #71 → PR1b #72 → PR2 #73 → PR3 #74 → PR4 #75, stacked-to-main), independently verified (PASS WITH WARNINGS, the single WARNING fixed in `b87fc39` and confirmed at HEAD), merged, spec-synced (4 domains merged), and archived. Ready for the next change. The next roadmap feature is **standings** (tabla de posiciones).
