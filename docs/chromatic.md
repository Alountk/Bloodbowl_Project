# Chromatic (Visual Regression & Storybook Hosting)

This document covers what Chromatic gives the project, what the free tier
includes, and how the maintainer sets it up. The decision background lives in
[`docs/research/engineering-rigor.md`](research/engineering-rigor.md).

## What Chromatic gives us

- **A persistent Storybook URL** — hosted by Chromatic and updated on every
  push, so reviewers can browse the component library without running
  `pnpm storybook` locally.
- **Visual regression on PRs** — every PR build renders the stories and
  reports pixel-level diffs against the accepted baseline. Reviewers
  accept or reject each change in the Chromatic UI before it becomes the
  new baseline.

The CI side lives in the `storybook` job of
`.github/workflows/docker-publish.yml` (check name: **Storybook (Chromatic)**).
It runs `pnpm build-storybook` and then `pnpm exec chromatic
--auto-accept-changes=main`: pushes to `main` re-baseline automatically, while
PR diffs stay pending until a human accepts them.

## Free tier

Per [chromatic.com/pricing](https://www.chromatic.com/pricing), the free tier
includes:

- 5,000 billed snapshots per month (≈ 25,000 Turbosnaps)
- Chrome browser
- Unlimited projects and users

## Setup (maintainer)

Until the secret exists the job is a no-op: the publish step is skipped and the
check passes trivially. To make it real:

1. Sign up at [chromatic.com](https://www.chromatic.com) with the GitHub
   account that owns the repository.
2. Add the project `Alountk/Bloodbowl_Project` (Chromatic detects the
   Storybook 10.6 build produced by `pnpm build-storybook`).
3. Copy the **project token** Chromatic shows for the project.
4. In the repository, add it as the secret `CHROMATIC_PROJECT_TOKEN`
   (Settings → Secrets and variables → Actions → New repository secret).
5. Push a PR: the `storybook` job publishes the build and reports visual
   diffs; accept or reject them in the Chromatic UI. Accepted changes become
   the new baseline for later PRs.
