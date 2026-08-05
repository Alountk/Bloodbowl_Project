# Proposal: BB2025 Rules Migration

## Intent

Migrate the core Blood Bowl race data from the BB2020 ruleset to the BB2025 ruleset to ensure rosters and team creation use the latest official rules. 

## Scope

### In Scope
- Update all stat, cost, and skill values in `features/teams/data/races.ts` to BB2025 values.
- Update `RULES_METADATA.version` to `"BB2025"`.
- Update test fixtures in `races.test.ts` and `roster.test.ts` to match BB2025 values.
- Assemble a verified BB2025 stat reference table prior to implementation.

### Out of Scope
- Schema changes to `types.ts` (none needed).
- Adding new races not in the BB2025 core book.
- Variant/Spike! team support.
- UI changes to display the ruleset version.
- Migration of persisted `Team` data in LocalStorage.
- Multi-version dataset or version selector UI.

## Capabilities

> This section is the CONTRACT between proposal and specs phases.

### New Capabilities
- `race-data-bb2025`: Defines the dataset for the 26 core BB2025 races, their positionals, stats, skills, and reroll costs.

### Modified Capabilities
- None

## Approach

**In-Place Data Swap**: We will replace the data content of `races.ts` with BB2025 values. `RULES_METADATA.version` becomes `"BB2025"`. The schema remains untouched. Test fixtures will be updated to BB2025 values to fix assertions.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `features/teams/data/races.ts` | Modified | Update all positional stats, costs, skills, and version. |
| `features/teams/data/races.test.ts` | Modified | Update version assertion and pinned stat fixtures. |
| `features/teams/roster.test.ts` | Modified | Update fixtures using specific player costs. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| BB2025 source data not verified | High | Assemble reference table before modifying data. |
| Tests pin specific BB2020 values | High | Update fixtures alongside data in the same commit. |
| Stored `Team` data relies on keys | Med | Do NOT rename existing `id`/`key` values; only update stat values. |

## Rollback Plan

Revert the commit modifying `races.ts` and the associated test files to restore BB2020 data and fixtures.

## Dependencies

- **Verified BB2025 stat reference table** (Hard blocker for implementation phase).

## Success Criteria

- [ ] All 26 races present with BB2025 data.
- [ ] `RULES_METADATA.version === "BB2025"`.
- [ ] No duplicate `race.id` or `positional.key` within a race.
- [ ] Test suite passes (`pnpm test`) with updated fixtures.
