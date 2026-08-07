# Proposal: Create Team Rulebook Form

## Intent

Restyle `CreateTeamForm` to the shipped "rulebook light" system (TeamDetailView grammar: navy `#12225a` hero, red-bordered section h2s, light fields), move RosterTable to the top of the Roster builder, and drop the CANT. column in editable mode. Styling/layout only — zero logic change; all e2e + unit contracts stay green.

## Scope

### In Scope
- Full light restyle: navy hero "Create Team", h2s with 3px `#d11938` border, light inputs/selects, light budget bar, role add-sections, Coaching Staff.
- RosterTable reordered to top of `<section aria-label="Roster builder">` (above budget bar + add sections).
- RosterTable: CANT. header + qty cell removed in BOTH modes; colSpans updated (editable totals 9+1+1=11, footer 4+6+1=11).
- Update `roster-table` spec (editable 11 cols, Qty removed) + `RosterTable.test.tsx` (11/10 cols, qty cell removed).
- New `create-team` spec (layout/style/contract).

### Out of Scope
- TeamList / TeamDetailView (readOnly table unchanged).
- `useCreateTeamForm.ts`, all logic/state/validation.
- Contract strings: budget texts, region names, "Add X" labels, `(n/max)` counters, error messages.
- Spanish coaching labels (kept English — assumption, see Risks).

## Capabilities

### New Capabilities
- `create-team`: light rulebook form layout — navy hero, section grammar, light fields, table-first builder ordering, preserved regions/aria/budget texts.

### Modified Capabilities
- `roster-table`: editable mode drops CANT. → 11 columns (10 rulebook + blank remove th); Qty derivation removed; editable totals/footer colSpans 12→11.

## Approach

Exploration Option 1 + A: reorder within the existing `Roster builder` region (regions/aria preserved); restyle using TeamDetailView classes (`max-w-[900px] mx-auto bg-white shadow`, `#12225a` hero, `border-b-[3px] border-[#d11938] text-[16px] text-[#12225a]` h2s, `bg-white border-slate-300 text-slate-900` fields). CANT. removal: merge `EDITABLE_HEADERS` into `RULEBOOK_HEADERS`, delete qty `<td>` and `min` logic, adjust colSpans. Keep every e2e-asserted string byte-identical; budget bar restyled via classes only.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `features/teams/create/CreateTeamForm.tsx` | Modified | Light restyle + table-first reorder |
| `features/teams/roster-table/RosterTable.tsx` | Modified | Drop CANT. both modes, colSpans 12→11 |
| `features/teams/roster-table/RosterTable.test.tsx` | Modified | 11/10 col asserts, qty cell removed |
| `openspec/specs/roster-table/spec.md` | Modified | Editable set 11, Qty removed, colSpan sums |
| `openspec/specs/create-team/spec.md` | New | Form layout/style/contract spec |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| e2e text regressions from restyle | Low | Assert by text/role; strings byte-identical |
| RosterTable colSpan mistakes | Med | Update component + test + spec in lockstep; sums asserted 11/10 |
| Coaching labels EN vs ES (detail view is Spanish) | Med | Assumption flagged; e2e/unit mandate English labels |

## Rollback Plan

Single PR — `git revert` of the change commit. Self-contained (no data migration); specs/tests revert with code.

## Dependencies

- None external. Reuses shipped TeamDetailView/RosterTable rulebook classes.

## Success Criteria

- [ ] All 14 e2e + unit tests green; no string changes
- [ ] Table renders above budget bar/add sections inside `Roster builder`
- [ ] No CANT./qty cell in editable; colSpan sums 11/10
- [ ] Form matches rulebook light grammar (hero, red-bordered h2s, light fields)
