# Exploration: Rulebook-style team tables

## Current State

The app renders roster and team data in several components:

- **`features/teams/roster-table/RosterTable.tsx`** — the central roster table. Columns: Name, Role, MA, ST, AG, PA, AV, Skills (English `skill.name` + `(category)`), Cost, remove button. Totals row shows player count + total cost + remaining budget. Dark theme (`text-slate-*`, `bg-slate-700`, `border-blue-600/*`). Has two modes via props: editable (`readOnly={false}`, name inputs + remove button) and read-only. Used by both `CreateTeamForm` and `TeamDetailView`.
- **`features/teams/TeamList.tsx`** — NOT a table. A responsive card grid (`ul.grid gap-3 sm:grid-cols-2 lg:grid-cols-3`), each card shows team name, race name, and roster summary. The rulebook has no equivalent grid; this is likely out of scope unless the user wants card→table migration.
- **`features/teams/detail/TeamDetailView.tsx`** — plain JSX (`<div>`/`<header>`/`<ul>`), no table classes. Header (name/race/league type) + read-only `RosterTable` + coaching staff `<ul>` + treasury `<p>`. Dark-slate text, no Tailwind styling on most elements.
- **`features/teams/create/CreateTeamForm.tsx`** — role-grouped positional add sections (`bg-slate-800/60` cards, `+ Add` buttons), budget bar, `RosterTable` (editable), `CoachingStaffSection` (grid of number inputs). Role-group headers derived from `positional.role` (e.g. "Linemans", "Blitzers", "Big Guys").

### Rulebook source (ground truth, page 180 OCR)

- Columns: **Qty range** (`0-16`) · **Positional name + subtitle role line** (e.g. "Human Lineman" / "(Human, Línea)") · **Cost** (plain `50000`) · **MA ST AG PA AV** · **Skills** (Spanish names: "Ninguna", "Escurridizo, Esquivar, ...") · **Skill access** (G/A/P/S/M/T).
- Page header: team NAME large, "EQUIPOS FAMOSOS", "LIGAS", "REGLAS ESPECIALES". Footer: "0-8 Segundas oportunidades: 50,000 c/u", "Apotecario: SÍ".
- Visual: light (white/grey bg, dark text) — OPPOSITE of current dark slate theme. Scan colors unreliable; structure is ground truth.

## Affected Areas

- `features/teams/roster-table/RosterTable.tsx` — primary restyle target; needs new columns (Qty range, Skill access), positional-name+subtitle cell, Spanish skill rendering.
- `features/teams/detail/TeamDetailView.tsx` — read-only roster consumers the restyled table; header/footer likely restyled to match rulebook.
- `features/teams/create/CreateTeamForm.tsx` — editable roster consumer; role-grouped add sections + coaching section may stay dark or be re-themed.
- `features/teams/TeamList.tsx` — card grid; probably unchanged (not a table).
- `features/teams/types.ts` — data model additions (`min`, `skillAccess`, full display name).
- `features/teams/data/races.ts` — per-positional new fields across 30 races.
- `features/teams/data/skills.ts` — Spanish names already present (`translations[]` with `es`), just not consumed by the UI.
- `features/teams/roster-table/RosterTable.test.tsx` — asserts current labels ("Block", "(general)", "—"), headers, role text.
- `e2e/create-team.spec.ts` — asserts aria-labels "Add Lineman", regions "Roster builder"/"Coaching Staff", budget texts, positional role-group headings, `(3/16)` and `(1/4)` count strings.

## Gap Analysis

| Rulebook column | Representable now? | Where it lives / what's missing |
|---|---|---|
| Qty range (`0-16`) | Partial | `Positional.max` exists; **`min` MISSING** → add `min?: number` (default 0) to `types.ts`, populate in `races.ts`. Roster shows actual `count/max` already. |
| Positional name | Partial | `name` is short ("Lineman"). Full display ("Human Lineman") MISSING → derive from `race.name + " " + name`, or add `displayName`. Subtitle role line exists: `role`. |
| Cost | Yes | `positional.cost` (plain number). Rulebook shows `50000`; app shows `50k`. Decide granularity (product decision). |
| MA/ST/AG/PA/AV | Yes | `ma, st, ag, pa, av` — exact match. Order MA ST AG PA AV. |
| Skills | Yes (data), No (UI) | `skills: SkillId[]` resolved via `getSkillById`. **Spanish names already in `skills.ts`** (`translations` with `es`). RosterTable must switch from `skill.name`/`category` to Spanish translation. Rulebook shows "Ninguna" for empty — matches existing em-dash rendering. |
| Skill access (G/A/P/S/M/T) | **No** | `skillAccess` MISSING entirely. Add `access?: string` to `Positional`, populate in `races.ts` from OCR (noisy — cleanup needed). Expensive: 30 races × positional. |
| Page footer (reroll cost, apothecary) | Partial (differs in scope) | `race.rerollCost` exists; apothecary is a per-team boolean, not per-race. |

**Confirmed gaps (verified in code):**
1. `skillAccess` — NOT in `types.ts` or `races.ts`. Must be added.
2. `min` — only `max` exists on `Positional`. Must be added.
3. Full positional display name — only short `name` + `role`. Derivable (race.name + name) without new data.
4. Spanish skills — data ALREADY present in `skills.ts`; purely a UI consumption change.

## Approaches

1. **Visual restyle + optional read-only columns (recommended scope)** — Restyle `RosterTable` (both modes) to light rulebook-like theme; add Qty range + Skill access columns and the name+subtitle cell; render Spanish skill names from existing translations. Add `min` and `skillAccess`/`access` fields to the catalog. Keep `TeamList` as-is.
   - Pros: High visual fidelity; all 6 rulebook columns covered; moderate data additions (2 fields × 30 races); Spanish skill names are free (data exists).
   - Cons: `skillAccess` OCR data is noisy (e.g. "A, G, M" — letter sets vary); touches the spec'd `team-detail-view` Roster Display requirement; light theme conflicts with dark app unless scoped to the table.
   - Effort: **Medium**

2. **Restyle `RosterTable` only (structure-identical columns)** — Keep current columns, only change theme + skill name source to Spanish + add Qty range cell. Defer `skillAccess` entirely.
   - Pros: Cheapest, lowest risk. No catalog additions beyond `min`. No `skillAccess` OCR cleanup.
   - Cons: Missing the 6th rulebook column (skill access) — incomplete fidelity.
   - Effort: **Low**

3. **Full rulebook page redesign** — Also convert `TeamList` cards to a table, redesign `TeamDetailView` header/footer (EQUIPOS FAMOSOS, LIGAS, REGLAS ESPECIALES, footer reroll/apothecary), translate all UI copy to Spanish.
   - Pros: Maximum fidelity to the PDF page.
   - Cons: Large surface; color/reversal + language decisions must be settled with the user; heaviest test churn (`RosterTable.test.tsx`, `e2e/create-team.spec.ts` aria-labels, region names).
   - Effort: **High**

## Recommendation

**Approach 1, split delivery:** Phase 1 = `RosterTable` restyle to light rulebook theme with Qty range + Skill access columns, Spanish skill rendering (using existing `es` translations), plus `min`/`access` additions to `types.ts` and `races.ts`. Phase 2 (optional, separate change) = full rulebook page redesign (`TeamList` table, `TeamDetailView` header/footer, language decisions). This keeps PRs scoped and protects the spec'd `team-detail-view` contract.

Two product decisions MUST be raised with the user before proposal:
1. **Color reversal** — rulebook is light, app is dark. Full light conversion is a wide change; scoping the light theme to `RosterTable` only is the pragmatic middle. Ask which.
2. **Language** — rulebook is Spanish and Spanish skill names exist in `skills.ts`, but the app UI is English (headers "Name/Role/MA/...", "Skills", "Cost"). Ask whether to render skill names in Spanish (yes, per rulebook) while keeping headers English, or translate headers too. The `es` translation data supports Spanish either way.

**Minimal data changes required (cheap):**
- `types.ts`: add `min?: number` (default 0) and `access?: string` to `Positional`.
- `races.ts`: add `min` and `access` to each of the 30 races' positionals. `access` needs OCR cleanup (some letters unreliable).
- Derive full display name (`race.name + " " + positional.name`) at render time — no field needed.

**Expensive / defer:**
- `skillAccess` cleanup (noisy OCR across 30 races).
- Any full-language translation of UI chrome.

## Risks

- **`RosterTable.test.tsx`** — asserts `getByText("Block")`, `getByText("(general)")`, em-dash "—", `getByText("Lineman")`/`getByText("Blitzer")`. Switching to Spanish breaks "Block" / "(general)" assertions; adding a name-subtitle cell changes role text lookup; new "Qty"/"Access" columns break the header-order test ("MA ST AG PA AV" canonical order may still hold but the full header list changes). Em-dash assertion may break if empty skills become "Ninguna".
- **`e2e/create-team.spec.ts`** — asserts `aria-label="Add Lineman"`, region name "Roster builder" / "Coaching Staff", budget texts "3 players · 150k / 1,000k gc", `(3/16)` / `(1/4)` count strings, role-group headings `/linemans/i`. Restyling add sections or renaming region/labels breaks these. Unit/format changes to `(count/max)` or cost formatting break assertions.
- **Spec contract** — `openspec/specs/team-detail-view.md` requires `RosterTable readOnly` rendering and "correct players and race props". Restyling is additive, but any change to column set or accessibility roles could require a MODIFIED Requirement. Delta spec must update `team-detail-view` Roster Display if columns/roles change.
- **Light/dark reversal** — full conversion is a wide visual change across two consumers (create form + detail view) and the card list; risky if not confirmed as a product decision.
- **Data integrity of `access`** — OCR noise ("G,A.FT", "EPT", "A, G, M") means the skill-access values need manual verification/cleaning before shipping; wrong letters are silent user-facing errors.

## Ready for Proposal

**Yes** — with the two product decisions (color scope, skill/header language) confirmed by the user first. The orchestrator should ask those two questions, then delegate `sdd-propose` for Approach 1 (Phase 1).
