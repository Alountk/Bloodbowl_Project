# Design: BB2025 Rules Migration

## Technical Approach

In-place BB2025 data migration in `races.ts` with atomic fixture updates, using the verified BB2025 reference table as the source of truth. No schema changes. This migration intentionally applies a finite, approved roster-composition delta (race and positional additions/removals) while preserving every other existing identifier unchanged.

## Architecture Decisions

| Option | Tradeoff | Decision |
|--------|----------|----------|
| In-place data swap (single file) | Minimal blast radius; schema unchanged | **Chosen** |
| Separate BB2025 data file with version selector | Future-proof but adds runtime complexity outside scope | Rejected (out-of-scope per proposal) |
| Automated script to transform data | Useful at scale; overkill for one file of ~320 lines | Rejected |
| Multi-commit (data first, fixtures second) | Creates a transient red test state between commits | Rejected |

## Data Flow

```
BB2025 Reference Table (external, verified)
        │
        ▼
races.ts  ──exports──▶  getRaceById()  ──▶  roster.ts / useCreateTeamForm.ts
                    └──exports──▶  RULES_METADATA   ──▶  races.test.ts
```

Only `races.ts` and related tests change. Every consumer receives updated data automatically at runtime — no downstream runtime code changes needed.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `features/teams/data/races.ts` | Modify | Update positional stats, costs, skills, and reroll costs to BB2025 values. Change `RULES_METADATA.version` from `"BB2020"` to `"BB2025"`. Apply only the approved key delta: remove `high-elf`, add `bretonnian`; remove `chaos-chosen.beastman-runner`, `chaos-renegade.renegade-beastman`, `tomb-kings.bone-giant`, `vampire.vampire`; add `chaos-renegade.renegade-minotaur`, `chaos-renegade.renegade-rat-ogre`, `vampire.vampire-runner`, `vampire.vampire-thrower`, `vampire.vampire-blitzer`, `vampire.vargheist`. Preserve every other existing `race.id` and `positional.key` unchanged. |
| `features/teams/data/races.test.ts` | Modify | Update `version` assertion (`"BB2020"` → `"BB2025"`). Update the Human Lineman pinned-stat fixture to BB2025 values. Update the test description strings referencing "BB2020" to "BB2025". |
| `features/teams/roster.test.ts` | Modify | Update `computeRosterCost` fixture if Human Blitzer/Lineman/Thrower costs differ in BB2025. Update `computeRosterCostFromPlayers` fixture (currently pins `2 * 50_000 + 90_000`). |

**No other files require modification.** `types.ts`, `roster.ts`, and all UI components are unaffected.

## Interfaces / Contracts

No interface changes. The `Race` and `Positional` types in `types.ts` are already compatible with BB2025 data — no additions or removals needed.

The identifier contract for this migration is:
- Approved finite delta only:
  - Race: remove `high-elf`, add `bretonnian`
  - Positionals removed: `chaos-chosen.beastman-runner`, `chaos-renegade.renegade-beastman`, `tomb-kings.bone-giant`, `vampire.vampire`
  - Positionals added: `chaos-renegade.renegade-minotaur`, `chaos-renegade.renegade-rat-ogre`, `vampire.vampire-runner`, `vampire.vampire-thrower`, `vampire.vampire-blitzer`, `vampire.vargheist`
- Every other `race.id` and `positional.key` remains frozen (used by `Team.raceId` and `PlayerEntry.positionalKey` in LocalStorage).

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (GREEN) | `RULES_METADATA.version === "BB2025"` | Update existing assertion in `races.test.ts` |
| Unit (GREEN) | Human Lineman pinned stats match BB2025 | Update fixture values in `races.test.ts` |
| Unit (GREEN) | `computeRosterCost` / `computeRosterCostFromPlayers` | Update expected sums in `roster.test.ts` if costs changed |
| Unit (INVARIANT) | Race count = 26 with BB2025-approved composition (includes `bretonnian`, excludes `high-elf`), unique ids, unique keys per race, AG/PA/AV format | Regression guards with updated composition assumptions |
| Unit (INVARIANT) | All rerollCosts > 0, all positional roles present | Unchanged — structural integrity guards |

**Sequencing rule**: data and fixture changes land in a single commit. Never commit `races.ts` without the fixture update — doing so leaves the suite red.

**Pre-flight**: run `pnpm test` against current main to establish a clean baseline before touching any file.

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

**LocalStorage / compatibility**: Stored `Team` objects hold `raceId` and `PlayerEntry.positionalKey`. This migration intentionally introduces a user-approved compatibility break for the finite BB2025 key delta above. Existing saved teams referencing removed keys may require follow-up migration or fallback handling in a separate change.

**Rollback**: `git revert <commit>` on the single data-swap commit restores BB2020 state completely. No database or external state to roll back.

## Gate Condition

**REQ-RACE-01 is a hard blocker.** Before modifying a single line of `races.ts`, a verified BB2025 stat reference table must be present and signed off. The apply-phase sub-agent must confirm this gate is satisfied before proceeding.

## Open Questions

- [ ] Define follow-up data migration strategy for persisted teams that still reference removed `race.id`/`positional.key` values (`high-elf`, removed positionals).
