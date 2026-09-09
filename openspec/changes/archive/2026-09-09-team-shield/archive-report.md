# Archive Report: team-shield (RAU-78)

## Cycle Status

**Status**: CLOSED — archived
**Verdict**: PASS WITH WARNINGS (verify `gentle-ai.verify-result/v1`, evidence revision `sha256:4626a3e86cf537cbdd522c9c5761e907cd32ed23949349639b410d1bcc17e0a2`)
**Verdict source**: `verify-report.md` (file) + Engram #779, persisted at verification time 2026-09-09 18:11. 0 blockers, 0 CRITICAL findings. No CRITICAL override was needed or given.
**Merged state**: Change fully delivered to `main` @ `7bcdb68` (merge of PR #191, S4). All facts below are final-state at close, per the persisted tasks artifact and the orchestrator's final-state handoff.

## Artifact Lineage (Engram observation IDs read)

| Artifact | Engram obs | File (archived) |
|----------|-----------|-----------------|
| explore | #773 | — (explore not persisted as file) |
| proposal | #774 | `proposal.md` |
| spec (all deltas) | #775 | `specs/team-shield/spec.md`, `specs/team-persistence/spec.md`, `specs/team-scouting/spec.md` |
| design | #776 | `design.md` |
| tasks | #777 | `tasks.md` (20/20 `[x]`) |
| apply-progress | #778 | `apply-progress.md` |
| verify-report | #779 | `verify-report.md` |

All observations confirmed active in Engram (project `bloodbowl_project`). Project name note: Engram project is `bloodbowl_project` (git-remote detected), not the directory name `bloodbowl_web`.

## Delivery (final state)

- 4 stacked-to-main PRs, all merged: #188 (S1, 240 lines), #189 (S2 shield backend, 573 — `size:exception`), #190 (S3 render FE, 261), #191 (S4 ShieldControl, 718 — `size:exception`).
- Tasks: 20/20 `[x]` in the persisted tasks artifact (archived copy re-verified: 0 unchecked).
- Migration `20260909000000_team_shield` (additive `ADD COLUMN emblem TEXT`) applied to dev DB; `prisma migrate status` up to date.
- Avatar refactor byte-identical: `app/api/me/avatar/route.test.ts` 0-line diff across the whole change range.
- Metrics at verification time (per #779, unchanged at close): 8/8 requirements, 20/20 scenarios, 2371/2371 tests (168 files), `pnpm lint`, `npx tsc --noEmit`, `pnpm db:generate`, `pnpm build` all exit 0. Build route table includes `/api/teams/[id]/shield` and `/uploads/shields/[key]`.

## Spec Reconciliation (deltas → consolidated source of truth)

| Domain | Action | Details |
|--------|--------|---------|
| `team-shield` | **Created** (`openspec/specs/team-shield/spec.md`) | New domain; delta spec was a full spec (no delta markers) → mechanical byte-identical copy (diff -r empty). TS-1..TS-6, 11 scenarios. |
| `team-persistence` | **Updated** (`openspec/specs/team-persistence/spec.md`) | MODIFIED "Persistent Schema": added nullable `emblem String?` (adapter-issued storage value), "(Previously: the Team model had no `emblem` field.)", scenario "Team persisted to DB" now asserts `emblem: null`, new scenario "Existing team gains null emblem". Applied via native `gentle-ai sdd-archive-compose` (exit 0). All unrelated requirements preserved (git diff verified). |
| `team-scouting` | **Updated** (`openspec/specs/team-scouting/spec.md`) | MODIFIED "Get Team Scouting Endpoint": response adds nullable `emblem`, "(Previously: the response carried no `emblem` field.)", scenario "Owner fetches own team" extended, new scenario "Emblem present in scouted payload". Applied via native compose (exit 0). All unrelated requirements preserved. |
| `storage-adapter` | No change | Already reserves namespace reuse for shields ("future image kinds (team shields) reuse the same interface unchanged"); no delta required. |

Compose seam repair: the native compose left no blank line between the appended delta scenario and the following `### Requirement:` heading in both `team-persistence` and `team-scouting`. Repaired mechanically — blank line only, per the known pattern. Final diffs verified against git: no unintended content changes.

## Deviations (documented at close)

1. **DELETE response codes** — Design interface line said `DELETE → 204 | 401 | 404`; implementation returns **200 `{emblem:null}`** for a stored-shield removal (satisfies TS-2 scenario text "and 200 returns" verbatim) and **204** for the no-op removal. Client (`removeTeamShield`) folds both into `{emblem:null}`. Flagged in apply-progress (S2) and verify-report warning #1. Spec-compliant; no spec break.
2. **FE types optional-nullable** — `emblem?: string|null` across `Team`, `ApiTeam`, `teamFromApi` (normalizes `?? null`), `LeagueMemberTeam`, `ScoutedTeamDetail`; `TeamEmblem` accepts `emblem?: string|null` treating `null`/`undefined`/`""` as fallback. Deliberate additive-type choice, verified compliant.
3. **testid divergence** — Shield `<img>` uses `data-testid=shield-<id>` while the deterministic placeholder keeps `data-testid=emblem-<id>` (testids/aria preserved for the placeholder per TS-6). Deliberate and covered by `teamEmblemShield.test.tsx`.
4. **Local e2e not executed** — An alien `next-server` (PID 60123, ~6-day uptime) holds :3000; Playwright `reuseExistingServer` would adopt a non-authoritative server. Shield routes 401 under `AUTH_MODE=local` (no local upload path). TS-1/TS-4 owner-upload and rival read-only flows proven at the integration layer (page tests with real `ApiTeamStore` + mocked fetch). Documented limitation in verify-report warning #2; not a blocker.

## Follow-ups (out of archive scope — NOT handled here)

1. **ROADMAP row RAU-78** ("Escudo de equipo personalizado") still sits under "Features planificadas". Deliberately NOT moved in this phase (ROADMAP is outside openspec scope). Docs follow-up if desired.
2. **`treasury` spec gap** — Real `GET /api/teams/[id]` route returns `treasury: team.treasury` (verified at `app/api/teams/[id]/route.ts:95`), but neither the old nor the new `team-scouting` "Get Team Scouting Endpoint" requirement mentions it. Pre-existing gap not introduced by this change; left as a follow-up rather than silently expanding the delta.

## Archive Operations

- Destination: `openspec/changes/archive/2026-09-09-team-shield/`
- Method: recursive snapshot → `git mv` (failed: source untracked, "source directory is empty") → snapshot-diff guard passed → plain `mv` fallback → source-gone check → mandatory `diff -r` readback (snapshot vs destination) **empty — byte-identical**.
- This `archive-report.md` is additive-only, written after the readback; excluded from the comparison.
- No commits made; the orchestrator owns docs delivery (specs consolidated + archive folder are uncommitted: 2 modified spec files + 2 untracked paths).
- No `openspec/config.yaml` present → no `rules.archive` to apply.

## Intentional Archive Warnings

None. Clean close: no partial archive, no stale-checkbox reconciliation, no CRITICAL override. Archive proceeded on native status (`dependencies.archive: ready`, `nextRecommended: archive`, `blockedReasons: []`).
