# Archive Report — league-season

**Change**: league-season — Public Open Leagues + Round-Robin Jornadas
**Archived**: 2026-08-09
**Artifact store**: openspec
**Delivery**: chained stacked-to-main — PR1 (DB+API+algorithm) → PR2 (UI) → PR3 (e2e+polish). All three slices merged (main, PR1 #34 + PR2 #37 + PR3 #38).

## Archive Mode / Gate Resolution

**Native Review Receipt Gate**: `gentle-ai review mode status` reports `receipt-driven development: off (decided by global)` — the user-owned kill switch is OFF globally. Archive proceeds under the `disabled/unmanaged` relaxation. This is a deliberate `gentle-ai review mode disable` (repo precedent, used several times to close already-merged changes); the archive does NOT fabricate `allow`. No terminal review receipt exists (`reviewReceipt` absent in dispatcher status) because review was disabled before receipt production; the `disabled/unmanaged` relaxation permits archiving without one.

**Task Completion Gate**: checked BEFORE spec sync / archive move. `openspec/changes/league-season/tasks.md` shows 25/25 implementation tasks `[x]` across Phase 1 (1.1–1.12), Phase 2 (2.1–2.9), Phase 3 (3.1–3.4). Dispatcher `taskProgress`: total 25, completed 25, pending 0, `allComplete: true`. No stale unchecked tasks.

**Action Context Guard**: structured status reports `actionContext.mode: repo-local`, `allowedEditRoots: ["/Volumes/Mac_Nvme/Dev/bloodbowl_web"]`. All archive operations stayed inside that root. No `workspace-planning` mode.

## Final Verification State

The canonical verification artifact is `verify.md` (schema `gentle-ai.verify-result/v1`) — the verify phase persisted it under this filename (the openspec-convention calls the artifact `verify-report.md`; named `verify.md` in this change — noted for audit-trail traceability). No `verify-report.md` exists; the content contract is identical.

- **Verdict**: PASS WITH WARNINGS
- **Evidence revision**: `sha256:66244f1ff6735442314bc9626e5a2d38944c1e23d32c1e39e977a558a31bd884`
- **Blocker / CRITICAL findings**: 0 / 0
- **Requirements**: 11/11 compliant (per verify.md matrix)
- **Scenarios**: 32/32 compliant (per verify.md matrix)
- **Tests at verification time**: 612 unit (49 files) + 21 local e2e + 8 auth e2e (real Postgres) — aggregate 641 passing; `pnpm lint` 0 errors; `npx tsc --noEmit` clean.
- **Per Final-State Authority**: the orchestrator confirmed these final-state numbers at archive time (highest-ranked source, no later work changed them). The verify.md numbers are corroborated and carried forward as final.

### Documented Warnings (non-blocking, from verify.md)

These are implementation notes recorded in verify.md with running evidence; none is a failing scenario and all were accepted as non-blocking at verification time. They remain documented in the archive so a future reader understands the accepted deviations:

1. **Owner joins own open league via public join select** — design deviation: a single-owner open league must reach ≥2 members to be startable, so the owner joins their own league through the shared public "Unirse" select. Coherent, no spec broken, exercised in the e2e journey.
2. **Session identity via `useSession().user.id` on the client** — the role-aware partition depends on the JWT `id` claim; correct and consistent with existing app patterns; exercised end-to-end by the real auth e2e journey.
3. **Auth e2e bootstrap fragility** — `playwright.config.auth.ts` webserver boots `next dev` + `migrate deploy` on a fixed poll with documented cold-start races; canonical run is 8/8 green with Postgres healthy. Operational note carried from PR1/PR2.

**SUGGESTION** (non-blocking, carried from PR2): consider disabling `StartLeagueModal`'s submit when `teamCount < 2` for belt-and-suspenders; detail already disables "Iniciar liga" below 2 members.

## Specs Synced (FINAL)

Two delta specs merged into main specs BEFORE the archive move.

| Domain | Action | Main spec | Requirements | Scenarios |
|--------|--------|-----------|--------------|-----------|
| `league-season` | Created (NEW — no main spec existed) | `openspec/specs/league-season/spec.md` | 5 | 13 |
| `leagues` | Updated (MODIFIED) | `openspec/specs/leagues/spec.md` | 6 | 19 |

**Total authoritative counts**: 11 requirements / 32 scenarios — matches verify.md.

### `leagues` merge detail (copy-full-then-edit)

Applied to `openspec/specs/leagues/spec.md`:

- **MODIFIED — League Model** (replaced full requirement block): added `status`/`seasonLength`/`startedAt`, `Fixture` model with `[leagueId, round]` index, started-delete 409 + no SetNull-clearing. Scenarios preserved: League persisted, Duplicate name rejected, Open-league delete clears members (renamed per new open-only scoping); added "Started league delete blocked".
- **MODIFIED — League User-Scoped API** (replaced full requirement block): list becomes open+own union with memberCount, detail open→any / started→owner/member with foreign non-member 404. Preserved: Unauthenticated 401, League detail with members; replaced owner-scoped "List only own leagues" and "Foreign league denied" (superseded by the new public-open visibility model — intentional design migration); added "List own plus open leagues" and "Foreign member started detail allowed".
- **MODIFIED — Team Membership Assignment** (replaced full requirement block): public join by id to any OPEN league with started→409, admin OR team-owner leave/expel while OPEN. Preserved: already-member rejected, foreign/archived denied, expel non-member denied; replaced "Assign own unassigned team" and "Expel member clears membership" (superseded — join now targets any open league, expel only while open); added "Assign to started league rejected" and "Admin expels member while open".
- **ADDED**: Public Open League Listing (3 scenarios), Open League Detail Public (1 scenario), Member Self-Leave (1 scenario) — appended after existing requirements.

**Migration notes** — the two superseded owner-scoped behaviors (list foreign denied, delete clears members) were intentionally replaced by the public-open + started-lock model per the proposal design. This is a deliberate behavioral migration from owner-scoped leagues to public-open leagues with a started lock, NOT accidental requirement loss. Requirement names preserved; prior `(Previously: ...)` context retained in the delta was incorporated into the merged requirement text.

### `league-season` (NEW domain)

No main spec existed. Delta spec IS a full spec; copied directly to `openspec/specs/league-season/spec.md` (5 requirements / 13 scenarios) as the new source of truth.

## Archive Contents

Moved `openspec/changes/league-season/` → `openspec/changes/archive/2026-08-09-league-season/`:

- `proposal.md` ✅
- `specs/league-season/spec.md` ✅
- `specs/leagues/spec.md` ✅
- `design.md` ✅
- `tasks.md` ✅ (25/25 tasks `[x]` — no unchecked implementation tasks)
- `apply-progress.md` ✅ (final slice PR3 records accumulate PR1 12 + PR2 9 + PR3 4 = 25/25)
- `verify.md` ✅ (canonical verification report)

The active `openspec/changes/` directory no longer contains `league-season` — only `archive/` remains. The archive is an audit trail; no archived content was modified.

## Intentional-With-Warnings Classification

This archive records three accepted non-critical warnings (see above device deviations). Per the skill, this is classified **intentional-with-warnings**: the orchestrator explicitly confirmed archiving under PASS-WITH-WARNINGS with 0 blockers / 0 CRITICAL, and the warnings were accepted at verification time as documented implementation notes with running evidence.

## Notes

- No `openspec/config.yaml` exists in this repo → no `rules.archive` overrides applied (default: warn before destructive merge; none needed — MODIFIED blocks are complete, non-destructive requirement replacements).
- Archived `tasks.md` has 25/25 `[x]` — no stale unchecked tasks. No archive-time reconcile was needed.
- **Commit responsibility**: the orchestrator commits; this phase performs no git commit (per launch instructions).
