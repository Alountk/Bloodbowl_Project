# 0002 — Shard the auth E2E suite across runners

Status: Accepted
Date: 2026-05

## Context
The real-DB auth E2E (74 tests) took 16.5–21 min and gated the pipeline. Adding
parallel workers (P3, `workers: 3`) measured **no speedup** (18.3–18.9 min vs
16.5 min at 1 worker) and introduced contention flakes plus a locale race
(#372): every run shares one `next dev` process, which serializes the work.

## Decision
Parallelize across **runners**, not workers: a 6-leg CI matrix (3 core legs via
`--project=chromium --shard=i/3` plus one leg per SSE-heavy spec), each leg with
its own Postgres and dev server. The three SSE-heavy specs
(`live-match`, `live-resolution`, `full-match-journey`) never share a process —
their SSE hub is process-wide. CI keeps `workers: 1` per leg; local stays at 3.

## Consequences
- Pipeline wall clock: 21.6 min → 7.3 min (critical path = the slowest core leg).
- `--shard` auto-balances and picks up new spec files without editing the matrix.
- The HTML-only reporter hid per-test durations, which made P3 hard to judge; a
  `list` reporter is now mandatory alongside any HTML reporter in CI configs.
- If the core legs ever skew again (they are balanced by test count, not cost),
  the next lever is weighted shards or a 4th core leg (~5–6 min).
