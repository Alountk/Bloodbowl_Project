# 0001 — Feature-flag the redesigned match view

Status: Accepted
Date: 2026-05

## Context
The match ("enfrentamiento") redesign (~8,120 authored lines across slices A–G,
Stitch direction A: single live capture, derived acta) replaced a surface users
already relied on. Shipping it as a big-bang replacement risked a single
regression blocking all match reporting.

## Decision
Ship the redesign behind the cookie feature flag `bb-ui=next`, with the seam in
`app/leagues/[id]/fixtures/[fixtureId]/page.tsx`. The V1 surface stays
byte-identical when the flag is absent.

## Consequences
- Two match surfaces coexist until cleanup; fixes to shared components must
  consider both.
- Rollback is a cookie/flag decision, not a redeploy.
- The flag and the V1 surface must be removed in a dedicated change once V2 is
  proven in production.
