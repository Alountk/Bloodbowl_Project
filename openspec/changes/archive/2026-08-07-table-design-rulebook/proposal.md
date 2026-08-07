# Proposal: Rulebook-style RosterTable

## Intent
`RosterTable` renders dark-theme rows with English skill names, unlike the BB2025 rulebook's light team tables. Restyle it (both modes) to rulebook fidelity: light theme, Spanish skills, Qty + Access columns, name+role cell; rest of app stays dark/English.

## Scope
### In Scope
- `RosterTable` light restyle (both modes), explicit light classes vs dark parents
- New columns Qty + Access; name+role cell; Spanish skills (`translations.es`, EN fallback); cost stays `50k`; aria-labels preserved
- Data: `Positional.min?: number` (default 0), `access: string[]`; populate 30 races / 144 positionals (subset-first)

### Out of Scope
- `TeamList`; `TeamDetailView` header/coaching/treasury; `CreateTeamForm` sections; full-app theme reversal; header translation; persisted-team migration

## Capabilities
### New Capabilities
- `roster-table`: `RosterTable` contract — light theme, column set, ES skills w/ fallback, `50k` cost, accessible labels

### Modified Capabilities
- `team-detail-view`: Roster Display requirement updated for new columns/language/theme (readOnly)
- `race-data-bb2025`: add `access` + `min` data requirements w/ subset verification

## Approach
Restyle `RosterTable` only. Name cell = `race.name + " " + positional.name` + role subtitle (no new fields). Skills: `translations.find(t => t.id === "es")?.translation ?? skill.name` (only ~40 skills have `es`). New `th scope="col"` headers; totals `colSpan` updated. Access: verify Human/Orc/Dwarf vs OCR 180/189/175 first, rest as data tasks; letters outside G/A/P/S/M/T flagged; missing → "—".

## Affected Areas
| Area | Impact | Notes |
|---|---|---|
| `RosterTable.tsx` | Modified | Theme, cols, ES skills |
| `types.ts` | Modified | `min?`, `access` |
| `data/races.ts` | Modified | `access` ×144 |
| `RosterTable.test.tsx` | Modified | ES names, headers |
| `TeamDetailView.test.tsx`, `e2e/create-team.spec.ts` | Unchanged | Assert `50k`/spans/aria-labels/totals — kept |
| specs (3 files) | New + Modified | deltas |

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| OCR access noise (`EPT`, `FG`, `A,FT`, `F` out-of-set) | High | Subset-first; fallback `[]`+"—"; flag |
| Test churn | Med | Update alongside; e2e untouched |
| Light table on dark app | Low | Explicit classes; visual QA |

## Rollback Plan
`git revert` data + UI commits (additive fields; no migrations).

## Dependencies
OCR `page-168..197.txt`, `openspec/notes/bb2025-ocr-team-audit.md`.

## Success Criteria
- [ ] Light table both modes; Qty + Access cols; ES names w/ fallback; `50k`
- [ ] Human/Orc/Dwarf verified vs OCR; rest populated or flagged; unit + e2e green

## Proposal question round
Assumptions: (1) drop `(category)` suffix; (2) empty skills → "Ninguna"; (3) rulebook column order (editable keeps remove last); (4) Access fallback "—".

## Review Workload Forecast
Data ~150 + UI ~240 + specs ~40 → **430–550 lines**.
- `Decision needed before apply: Yes`
- `Chained PRs recommended: Yes`
- `400-line budget risk: High`
Split: PR1 data+types, PR2 UI+tests+specs.
