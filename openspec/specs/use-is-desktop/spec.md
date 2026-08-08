# use-is-desktop Specification

## Purpose

Contract for the `useIsDesktop` React hook (`features/teams/hooks/useIsDesktop.ts`): an SSR-safe, matchMedia-driven boolean hook that gates single render branches — desktop table vs. mobile stacked rows — across RosterTable, PlayerAvailabilityTable, and related consumers.

## Requirements

### Requirement: SSR-safe Desktop Default

The hook MUST initialize to `true` (desktop) via `useState` so first render, server render, and jsdom tests land on the desktop branch. It MUST NOT attempt to read `window` during render.

#### Scenario: First render is desktop

- GIVEN the hook renders for the first time
- WHEN it returns its initial value
- THEN it returns `true`

#### Scenario: jsdom default stays desktop

- GIVEN a jsdom environment where `window.matchMedia` is undefined
- WHEN the hook mounts
- THEN it returns `true` for every render (no matchMedia flip)

### Requirement: matchMedia Effect

After mount, the hook MUST use `useEffect` that calls `window.matchMedia("(min-width: 768px)")` when available and reflects `matches` into state. When `window.matchMedia` is missing, the effect MUST NOT deinitialize or change state.

#### Scenario: Mobile viewport flips to mobile

- GIVEN `window.matchMedia` returns `matches: false` for `(min-width: 768px)`
- WHEN the effect runs
- THEN the hook returns `false`

#### Scenario: Desktop viewport stays desktop

- GIVEN `window.matchMedia` returns `matches: true`
- WHEN the effect runs
- THEN the hook returns `true`

#### Scenario: matchMedia guarded

- GIVEN `window.matchMedia` is undefined
- WHEN the effect runs
- THEN state remains `true` and no error is thrown

### Requirement: Listener Cleanup

When `window.matchMedia` supports `addEventListener` / `removeEventListener`, the effect MUST register a listener for `change` events and MUST remove it on unmount. When only the legacy `addListener` / `removeListener` API exists, the hook MUST fall back to it with the same cleanup.

#### Scenario: Listener removed on unmount

- GIVEN the hook is mounted with a change listener added
- WHEN the component unmounts
- THEN the listener is removed and no update fires after unmount

### Requirement: Single-Branch Consumer Usage

Consumers MUST use the boolean to render EXACTLY ONE branch — either the desktop table or the mobile stacked rows — never both, so locators and aria-labels stay unambiguous per viewport.

#### Scenario: Exactly one branch renders

- GIVEN a consumer using the hook
- WHEN it renders for a given viewport
- THEN exactly one of {desktop table, mobile rows} is present in the DOM
