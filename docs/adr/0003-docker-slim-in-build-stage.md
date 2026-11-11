# 0003 — Slim Docker images in the build stage, before COPY

Status: Accepted
Date: 2026-05

## Context
The production image was ~1.11 GB. Trimming `node_modules` is the main saving
(~280 MB), but doing it after `COPY` in a standalone Next.js layout collides
with `.next/standalone`'s module resolution (observed "merge hazard" F2: a
post-COPY prune broke the standalone tree).

## Decision
Perform all store pruning/slimming in the `build` stage **before** the final
`COPY --from` into `runner`/`migrate`. Keep the `build` and `runner` stage
globs synchronized (R3).

## Consequences
- Local arm64 image 764 MB → 745 MB; CI amd64 projection ≈ 800 MB (−27%);
  `migrate` ≈ 299 MB.
- The build/runner prunes must be updated together — a glob added to one stage
  and not the other reintroduces drift (tracked as R3).
- Publishing stays two-image (`web` + `migrate`) with compose
  `service_completed_successfully` ordering.
