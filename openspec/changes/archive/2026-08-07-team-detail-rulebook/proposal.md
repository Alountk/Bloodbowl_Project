# Proposal: Team Detail Rulebook Restyle (Style A)

## Intent

Team detail renders a bare unstyled header with English copy. This change implements the user-approved Style A ("Todo libro") design: navy hero, book-styled sections, Spanish UI copy, rulebook coaching table, and hides the `CANT.` column in read-only roster mode (editable create-team keeps it). Presentation-only; no data or domain logic changes.

## Scope

### In Scope
- `TeamDetailView.tsx` rewrite to Style A: navy `#12225a` hero (name, `<b>Race</b> · League`, plain + gold "Tesorería: N" tags), book headings (Plantilla / Cuerpo técnico / Tesorería), `coach-a` table, 3 treasury cards, `formatRulebookCost` values.
- Stop passing `bannerText`/`apothecary` to `RosterTable` (hero replaces banner; coaching table replaces footer).
- `RosterTable.tsx`: readOnly hides `CANT.` (10 cols, no remove); totals colSpan 7+1+2=10 "N jugadores · Coste total"; readOnly footer colSpans 4+6=10. Editable unchanged (12).
- Tests: `TeamDetailView.test.tsx` (ES labels, `750 000`, Spanish headings, no footer); `RosterTable.test.tsx` (10 readOnly headers, totals/footer colSpan).

### Out of Scope
- Create team form (labels/layout/editable table) — unchanged.
- TeamList, race data, removing banner/footer props from `RosterTable` API.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `team-detail-view`: MODIFIED Identity Display (hero + treasury tag), Roster Display (10-col readOnly, no banner/apothecary props, ES totals), Coaching Staff Display (ES labels, Apotecario SÍ/NO row, total row, rulebook format), Derived Treasury Display (rulebook format, 3 cards).
- `roster-table`: MODIFIED Rulebook Column Set & Order (readOnly 10 headers), Totals Row (ES label, colSpan 10), Rulebook Footer (readOnly colSpans sum 10).

## Approach

Tailwind classes mirroring prototype CSS (`#12225a`, `#d11938`, zebra `#f1f5f9`, treasury cards). Reuse exported `formatRulebookCost` plus existing cost/treasury helpers. `RosterTable` branches headers/totals/footer on `readOnly`.

## Affected Areas

| Area | Impact |
|------|--------|
| `features/teams/detail/TeamDetailView.tsx` | Rewrite |
| `features/teams/roster-table/RosterTable.tsx` | Modified |
| `features/teams/detail/TeamDetailView.test.tsx` | Modified |
| `features/teams/roster-table/RosterTable.test.tsx` | Modified |
| `app/teams/[teamId]/page.test.tsx` | None expected |
| `openspec/changes/team-detail-rulebook/specs/team-detail-view.md` | New delta |
| `openspec/changes/team-detail-rulebook/specs/roster-table/spec.md` | New delta |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| readOnly+apothecary footer (now unused) misaligns | Low | colSpans 4+6=10, test updated |
| Full-view rewrite inflates diff | Med | Cohesive single-view PR |

## Rollback Plan

`git revert` the PR — UI-only, no migration/data impact.

## Dependencies

None — `formatRulebookCost` exported; coaching/treasury helpers exist.

## Success Criteria

- [ ] Detail view matches Style A: hero, 3 Spanish sections, treasury cards.
- [ ] readOnly roster = 10 columns (no CANT.); editable still 12; colSpans sum to header count.
- [ ] Detail copy Spanish; create form unchanged.
- [ ] Full suite green.
