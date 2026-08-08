# Design: Mobile Tables Refinement — Stacked Row-Cards + Native Select Fix

## Technical Approach

Gate one render branch on a new `useIsDesktop()` hook. Consumers (RosterTable, PlayerAvailabilityTable) compute shared per-player cell data once, then render EITHER the desktop book table OR mobile stacked row-cards — never both (spec: single-branch usage; keeps locators/mocked tests stable). Selects in CreateTeamForm get a relative wrapper + separate `pointer-events:none` chevron and a 16px font. Desktop branch is byte-identical to today's markup.

**Key verified fact**: jsdom in this repo does NOT expose `window.matchMedia` (probed — `import { JSDOM }` / `window.matchMedia` is `undefined`). So `useState(true)` + a guard in the effect is what keeps all existing unit tests on the desktop path without mocks. New mobile tests MUST stub `window.matchMedia` to return `matches:false`.

## Architecture Decisions

| Decision | Option | Tradeoff | Choice |
|----------|--------|----------|--------|
| Viewport source | `useState(true)` + `useEffect matchMedia("(min-width: 768px)")` | SSR-safe, no flash; jsdom defaults desktop | **Chosen** |
| Viewport fallback | CSS-only stacking vs JS hook | CSS media queries can't drive "one branch, no duplicate DOM" for tests/locators | **Hook** (single branch) |
| Test helper | Stub `window.matchMedia` per-test to return matches false/true with a dispatchable `change` | Deterministic; colocated util reused by RosterTable/Availability/CreateTeamForm tests | **Chosen** |
| Select chevron | background-image vs separate element | Background-image breaks on Samsung Android; element is testable (`pointer-events:none`) | **Separate `span` element** |

## Data Flow

    useIsDesktop() ──(measure once via matchMedia)──→ { true | false }
        │
        ├── true  → desktop book table (shared cellData) ── cloned markup
        └── false → mobile row-cards (shared cellData)     ── stacked cards

Selects: `<div class="relative"><select …/><span aria-hidden pointer-events:none>▾</span></div>`

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `features/teams/hooks/useIsDesktop.ts` | Create | SSR-safe hook; `useState(true)` + matchMedia effect w/ guard + cleanup |
| `features/teams/hooks/useIsDesktop.test.ts` | Create | RED tests for default / flip / guard / cleanup |
| `features/teams/test/matchMedia.ts` | Create | Test util: `mockMatchMedia(matches)` + `applyChange` helper |
| `features/teams/roster-table/RosterTable.tsx` | Modify | Shared cellData → `isDesktop` branch (book table vs mobile cards) |
| `features/teams/roster-table/RosterTable.test.tsx` | Modify | Add mobile-card cases (mock matchMedia false); desktop cases untouched |
| `features/teams/create/PlayerAvailabilityTable.tsx` | Modify | Shared rowData → desktop table vs mobile stacked rows |
| `features/teams/create/PlayerAvailabilityTable.test.tsx` | Modify | Add mobile availability cases |
| `features/teams/create/CreateTeamForm.tsx` | Modify | Wrap Race + League type selects with chevron; 16px font |
| `features/teams/create/CreateTeamForm.test.tsx` | Modify | Add select wrapper/chevron/16px assertions |

## Interfaces / Contracts

```ts
// features/teams/hooks/useIsDesktop.ts
export function useIsDesktop(): boolean

// features/teams/test/matchMedia.ts
export function mockMatchMedia(matches: boolean): {
  setMatches(matches: boolean): void;   // dispatches 'change' to listeners
}
```

Hook shape: `const [isDesktop, setIsDesktop] = useState(true)`; effect:
```ts
useEffect(() => {
  if (typeof window.matchMedia !== "function") return;   // jsdom guard → stays true
  const mql = window.matchMedia("(min-width: 768px)");
  const apply = () => setIsDesktop(mql.matches);
  apply();
  if (mql.addEventListener) { mql.addEventListener("change", apply); return () => mql.removeEventListener("change", apply); }
  mql.addListener(apply);                                  // legacy fallback
  return () => mql.removeListener(apply);
}, []);
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | Hook default/flip/guard/cleanup | `useIsDesktop.test.ts` with `mockMatchMedia(true|false)`; assert cleanup removes listener |
| Unit | RosterTable mobile cards (readOnly + editable) | mock false → name line, subtitle, chips, SKILLS "Ninguna", cost, remove/rename a11y labels; mock true → book table has no `.mobile-*` nodes |
| Unit | PlayerAvailabilityTable mobile rows | mock false → name+subtitle+cost, counter, "+ Add" always present, hide-at-max, disabled-over-budget |
| Unit | CreateTeamForm selects | wrapper div + chevron child present; select `font-size:16px`; league aria-label + handlers intact |
| E2E | Desktop 1280 | Unchanged — desktop branch is clone of current markup |

All desktop unit tests run under jsdom with no `matchMedia` stub → `isDesktop` `true` → book-table path → existing assertions unchanged. New mobile tests wrap render in `mockMatchMedia(false)`.

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

No migration, feature flag, or data change. Rollback = revert the single PR; tables return to horizontal-scroll rendering and selects to prior styling.

## Open Questions

- None.
