# Exploration: BB2025 Rules Migration

> **Change**: `bb2025-rules-migration`
> **Phase**: explore
> **Date**: 2026-08-05
> **Status**: Ready for Proposal

---

## Current State

### Data Layer

All race/positional/ruleset data lives in a single file:

- **`features/teams/data/races.ts`** — The monolithic `RACES: Race[]` array containing all 26 BB2020 races with their positionals. Exports `getRaceById()` and the sentinel `RULES_METADATA = { version: "BB2020" }`.

### Type Schema (`features/teams/types.ts`)

```ts
interface Positional {
  key: string;        // unique within race, e.g. "lineman"
  name: string;       // display name
  role?: string;      // UI grouping: "Lineman", "Blitzer", etc.
  cost: number;       // gold coins
  max: number;        // max on roster
  ma: number;         // Movement Allowance (number)
  st: number;         // Strength (number)
  ag: string;         // "3+" format
  pa: string;         // "4+" or "—"
  av: string;         // "8+" format
  skills: string[];   // display names
}

interface Race {
  id: string;
  name: string;
  rerollCost: number;
  positionals: Positional[];
}
```

The schema does NOT encode a ruleset version per race or positional — version lives only in the module-level `RULES_METADATA` sentinel.

### Roster / Business Logic (`features/teams/roster.ts`)

- `STARTING_TREASURY = 1_000_000`
- `MIN_PLAYERS = 3`, `MAX_PLAYERS = 16`
- Cost computation and summarisation helpers — all consume `Race` and `PlayerEntry` types directly.
- Legacy `Quantities`-based helpers are deprecated but still present.

### Test Coverage

| File | Focus |
|------|-------|
| `features/teams/data/races.test.ts` | 26 races count, unique IDs, stat formats, specific BB2020 human values |
| `features/teams/roster.test.ts` | Cost/count/summary helpers using BB2020 Human as fixture |
| `features/teams/create/useCreateTeamForm.test.ts` | Team creation form logic |
| `features/teams/create/CreateTeamForm.test.tsx` | UI component rendering |
| `app/teams/create/page.test.tsx` | Page-level integration |

Key brittle test: `races.test.ts` line 6 asserts **exactly 26 races** and line 27 pins **BB2020 Human Lineman cost = 50,000**.

---

## Affected Areas

| File | Why Affected |
|------|-------------|
| `features/teams/data/races.ts` | All positional stats/costs/skills need updating; `RULES_METADATA.version` must change |
| `features/teams/types.ts` | May need `rulesVersion` field on `Race`; no structural stat changes needed |
| `features/teams/data/races.test.ts` | Race count assertion; BB2020-pinned stat fixtures; `RULES_METADATA` version test |
| `features/teams/roster.test.ts` | Fixtures use Human Lineman 50k — must match updated cost if it changes |
| `features/teams/roster.ts` | `STARTING_TREASURY` may change if BB2025 alters starting gold |
| `features/teams/create/useCreateTeamForm.test.ts` | Uses race fixtures indirectly; low risk |

---

## BB2025 Delta (Known or Expected Changes)

> **Note**: The official BB2025 dataset has not been verified in this codebase. The changes below are based on published GW/NAF errata and community sources. The proposal phase MUST confirm each value before implementation.

### Race Count

BB2025 published rosters number **26** (same as BB2020). No races were added or removed in the core book; variant/Spike! races are out of scope.

### Stat / Cost Changes (representative — not exhaustive)

BB2025 introduced targeted adjustments. Known categories of change:

1. **Cost adjustments** — several positionals had gold costs revised (e.g., Amazon Blitzer, various Big Guys).
2. **Skill additions/removals** — some positionals gained or lost starting skills (e.g., Norse Ulfwerener losing `Loner (4+)`).
3. **Stat tweaks** — isolated MA/ST/AG/PA/AV changes on specific positionals.
4. **Reroll cost changes** — at least one race's reroll price shifted.
5. **`RULES_METADATA.version`** — must change from `"BB2020"` to `"BB2025"`.

The schema (`Positional`, `Race`) can represent all of the above with zero structural changes.

---

## Approaches

### Approach 1 — In-Place Data Swap (Recommended)

Replace the data content of `races.ts` with BB2025 values. `RULES_METADATA.version` becomes `"BB2025"`. Type schema is untouched.

**Pros:**
- Zero schema migration — consumers (`roster.ts`, form components) are unaffected.
- Single file to change for the entire dataset.
- Tests update is mechanical: update fixtures to BB2025 values, update the version assertion.
- No runtime risk — pure static data.

**Cons:**
- Loses BB2020 data unless preserved elsewhere (out of scope for this change).
- Requires careful per-positional audit of every stat across 26 races.

**Effort:** Medium (data entry / audit) — Low (code change)

---

### Approach 2 — Versioned Dual Dataset

Keep `races-bb2020.ts` and add `races-bb2025.ts`. Export a selector `getRacesByVersion(version)`.

**Pros:**
- BB2020 data preserved in codebase.
- Allows A/B comparison or version toggling.

**Cons:**
- Doubles the data volume.
- Requires a version parameter threaded through every consumer.
- No product requirement currently exists for multi-version support.
- Substantial test churn for consumers.

**Effort:** High

---

### Approach 3 — Schema Extension: `rulesVersion` per Race

Add `rulesVersion: "BB2020" | "BB2025"` to the `Race` interface and maintain a mixed array.

**Pros:**
- Theoretically supports mixed-version rosters.

**Cons:**
- No product scenario requires this.
- Complicates validation logic (which version governs a team?).
- High type and test churn for zero current benefit.

**Effort:** High — complexity cost with no known payoff

---

## Recommendation

**Approach 1 — In-Place Data Swap.**

The schema is already version-agnostic by design. `RULES_METADATA.version` is the canonical version sentinel. The migration is a pure data-content replacement: update each positional's stats/costs/skills to BB2025 values, update the version marker, and update the tests that pin BB2020-specific values.

Pre-condition: before writing any data, the proposal phase must assemble a verified BB2025 reference table (GW official PDFs or NAF-sanctioned source) and diff it against the current dataset.

---

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| BB2025 source data not yet confirmed in codebase | High | Proposal phase: assemble reference table before touching races.ts |
| `races.test.ts` pins specific BB2020 values — will fail on update | Medium | Intentional guard; update fixtures alongside data in same commit |
| `STARTING_TREASURY` or `MAX_PLAYERS` may change in BB2025 | Low | Check `roster.ts` constants against BB2025 rulebook during proposal |
| Stored `Team` data (LocalStorage) uses `raceId` + `positionalKey` — keys must stay stable | Medium | Do NOT rename existing `id`/`key` values; only update stat values |
| Big Guy positionals changed significantly in BB2025 | Medium | Audit each Big Guy entry explicitly |
| Community errata vs. official release discrepancies | Medium | Use only GW official PDFs or NAF-confirmed source as reference |

---

## In-Scope / Out-of-Scope

### In Scope
- Update all stat/cost/skill values in `features/teams/data/races.ts` to BB2025.
- Update `RULES_METADATA.version` to `"BB2025"`.
- Update test fixtures in `races.test.ts` and `roster.test.ts` to match BB2025 values.
- Update the version assertion in `RULES_METADATA` test block.

### Out of Scope
- Schema changes to `types.ts`.
- Adding new races not in BB2025 core book.
- Variant/Spike! team support.
- UI changes to display the ruleset version.
- Migration of persisted `Team` data in LocalStorage (keys are stable; no migration needed).
- Multi-version dataset or version selector UI.
- `STARTING_TREASURY`, `MIN_PLAYERS`, `MAX_PLAYERS` changes (unless BB2025 rulebook explicitly changes them — confirm in proposal).

---

## Validation Strategy

### Automated Tests
1. Update `races.test.ts` → change the `RULES_METADATA.version` assertion to `"BB2025"`.
2. Update the Human Lineman fixture test to BB2025 values (or add a new BB2025-specific fixture test).
3. Add a `"contains the 26 BB2025 races"` assertion (count stays 26).
4. Keep all structural integrity tests (format, uniqueness, numeric types) — they are version-agnostic and must continue to pass.

### Acceptance Checks
- All 26 races present after migration.
- `RULES_METADATA.version === "BB2025"`.
- Stat format tests pass (`/^\d+\+$|^—$/`).
- No duplicate `race.id` or `positional.key` within a race.
- `rerollCost > 0` for every race.
- `computeRosterCostFromPlayers` returns correct values for at least one BB2025 fixture (e.g., Human Lineman × 3).
- `pnpm test` passes with zero failures.

---

## Ready for Proposal

**Yes.** The schema requires no changes. The migration is bounded to `features/teams/data/races.ts` plus test fixture updates.

**Blocker before proposal:** Assemble and attach a verified BB2025 stat reference table. Without it, the data phase cannot begin.
