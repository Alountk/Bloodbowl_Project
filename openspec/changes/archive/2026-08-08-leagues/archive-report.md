# Archive Report: leagues

**Archived**: 2026-08-08
**Change**: leagues (team grouping)
**Cycle Status**: COMPLETE — SDD cycle closed
**Mode**: openspec — delta specs merged into `openspec/specs/`, change folder archived.
**Archive classification**: intentional-with-warnings (review disabled by kill switch; two archive-phase tasks reconciled at archive time).

## Final State (at close)

Verify: **PASS** — 10/10 requirements, 36/36 scenarios across the 5 delta spec artifacts (leagues, team-persistence, team-detail-view, create-team, app-shell), 569 unit + 21 local e2e + 5 auth e2e green, 0 blockers, lint/type-check clean.

Review gate: **`disabled/unmanaged`**. Per review mode status (`gentle-ai review mode status`) the kill switch is OFF (global/review-mode = off, source = global). The user chose to temporarily disable receipt-driven review to close already-merged changes (repo precedent, four times). No `reviewGate.result: allow` was manufactured — the archive proceeds solely under the `disabled/unmanaged` relaxation. There are no explicit review artifacts (receipt/ledger/transaction) that failed validation; the gate simply does not apply while the kill switch is off.

## Task Reconciliation (exceptional, orchestrator-approved)

Tasks **3.5** and **4.2** were unchecked in the persisted `tasks.md` at the start of archive. They are **not** product-code work — they are archive-phase responsibilities explicitly deferred here by `apply-progress` and `verify-report`, and the orchestrator instructed archive to complete them:

- **3.5** (verify-report regen + `sdd-archive` merges all five delta specs into main specs): verify-report regeneration was completed in the verify phase; **the five delta-spec merges were completed in this archive phase** (see Spec Sync table).
- **4.2** (update `openspec/specs/*` Test Coverage tables to reflect no-league-type assertions): only `app-shell/spec.md` carries a Test Coverage table; it was updated to reflect the shared Teams+Ligas nav assertions. The other three specs (create-team, team-detail-view, team-persistence) and the new leagues spec have no Test Coverage table.

Both checkboxes are now marked `[x]` in the archived `tasks.md`. This is the exceptional mechanical reconciliation permitted by the Task Completion Gate with explicit orchestrator direction and `apply-progress`/`verify-report` proving the underlying implementation work complete. The archived audit trail contains **no unchecked implementation tasks**.

## Spec Sync (delta → main)

| Domain | Action | Details |
|--------|--------|---------|
| leagues | **Created** | `openspec/specs/leagues/spec.md` — new full spec: League Model, League User-Scoped API, Team Membership Assignment (3 requirements, 12 scenarios) |
| team-persistence | **Updated** | Replace Persistent Schema (leagueId FK SetNull, leagueType dropped, +2 scenarios) and User-Scoped Team API (+"Deletion blocked for league member" scenario); REMOVE the deferred "Future Invariant (leagues)" section (Reason/Migration present in delta); preserve ApiTeamStore Contract, Existing Store Interface Preserved, localStorage Migration, Archived Team Table State |
| team-detail-view | **Updated** | Replace Identity Display (league name/"Sin liga" label, LEAGUE_LABELS gone; new scenarios: Unassigned→Sin liga, Superhero league name; drop League-type display labels); preserve Route Resolution, Hydration Gating, Team Lookup, Roster Display, Mobile ReadOnly Roster, Coaching Staff Display, Derived Treasury Display, Race-not-in-catalog Fallback |
| create-team | **Updated** | Replace Native Select Wrapper with Chevron (league-type select removed), Coaching Staff English Labels (five, no League type), Submit Team (leagueId: null via ApiTeamStore); preserve Two-Step Wizard, Responsive Step 2 Hero, Plantilla, Mobile Availability, Availability Table, Default Naming, Editable POSICIÓN |
| app-shell | **Updated** | Replace Sidebar Structure (Teams + Ligas via shared NAV_ITEMS; scenarios Teams+Ligas nav, Ligas routes to /leagues); update Test Coverage table row; preserve Design Tokens, Light Body, Drawer, Topbar, Shell Gate, Logout |

## Artifacts

This is an **OpenSpec-mode** artifact store; there are **no Engram observation IDs** to trace (artifacts live on the filesystem). Archived change folder: `openspec/changes/archive/2026-08-08-leagues/` containing proposal.md, specs/ (5 deltas), design.md, tasks.md (28/28 complete), apply-progress.md, verify-report.md, archive-report.md.

## Notes / Warnings

- Archive is `intentional-with-warnings`: it proceeded under the `disabled/unmanaged` review relaxation (kill switch off), and two archive-phase tasks were reconciled at archive time rather than being completed by `sdd-apply`.
- `verify-report` notes: the N+1 league-detail fetch for card member counts is a deliberate documented deviation, flagged for growth. The e2e card-count ("N equipos") step is unit-only (non-blocking suggestion to add to auth e2e). Neither is a CRITICAL; neither blocks closure.
- No destructive main-spec section removal occurred other than the delta-declared REMOVED requirement (Future Invariant), for which Reason+Migration were provided in the delta. No warnings required for confirmation.
