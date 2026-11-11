# Engineering rigor — how large companies structure it, and what fits this repo

Research notes (2026-05). Location: new `docs/research/` directory (the repo had no prior research-notes convention; `docs/` holds guides such as `docs/auth.md`). Every factual claim links the first-party source that owns it. The "Proposed measures" section is a proposal for maintainer approval — nothing here is applied yet.

## Findings — practices per authority

### Google — code review ([google.github.io/eng-practices](https://google.github.io/eng-practices/review/))
- The standard of code review: the primary purpose is that **overall code health improves over time**; reviewers should prefer approving a CL that improves code health over perfection ([standard](https://google.github.io/eng-practices/review/reviewer/standard.html)).
- What reviewers look for, in order: **design, functionality, complexity, tests, naming, comments, style, documentation** ([reviewer/](https://google.github.io/eng-practices/review/)).
- **Small changes**: reviewed faster and more thoroughly, easier to design well, simpler to roll back ([small-cls](https://google.github.io/eng-practices/blob/master/review/developer/small-cls.md)).
- **Review speed SLA**: respond within one business day; latency, not round-trip count, is the metric ([speed](https://google.github.io/eng-practices/review/reviewer/speed.html)).

### Software Engineering at Google — testing culture ([abseil.io SWE book](https://abseil.io/resources/swe-book/html/ch11.html))
- Testing is built into engineering culture, not an afterthought ([ch11](https://abseil.io/resources/swe-book/html/ch11.html)).
- All production code is expected to have unit tests; the review tool flags source files added without tests, and reviewers require new functionality to ship with tests (["Software Engineering" survey, arXiv:1702.01715](https://arxiv.org/pdf/1702.01715v3.pdf), §2.4).
- **Fast, accessible CI feedback**: every change integrated into a testing scenario is a feedback loop; test reporting is unified and anyone can look up any run with logs ([ch23](https://abseil.io/resources/swe-book/html/ch23.html)).
- **Test Certified / ratcheting**: a graduated certification program raised testing levels team by team ([Goto Fail, Heartbleed, and Unit Testing Culture](https://martinfowler.com/articles/testing-culture.html)).

### DORA — software delivery performance ([dora.dev/guides/dora-metrics](https://dora.dev/guides/dora-metrics/))
- Five metrics (the 2024 report added deployment rework rate to the original four): **deployment frequency, lead time for changes, change failure rate (→ rework rate), time to restore service, reliability** ([metrics history](https://dora.dev/insights/dora-metrics-history/), [2024 report](https://dora.dev/research/2024/dora-report/2024-dora-accelerate-state-of-devops-report.pdf)).
- The metrics measure **system-level outcomes** and warn against local optimization of individual functions ([2022 report](https://dora.dev/research/2022/dora-report/2022-dora-accelerate-state-of-devops-report.pdf)).

### Amazon — failure as information (Correction of Errors)
- A **CoE** is a mechanism to identify and fix problems, drive ownership of action items, maximize lessons learned, and prevent recurrence — **not to blame or punish** ([AWS CoE template, awscloud.com](https://pages.awscloud.com/rs/112-TZM-766/images/05_implement_correction_of_error_proces.pdf): summary, impact, timeline, metrics, incident questions).
- Failures are evidence of something you did not know; the goal is to see them before customers do and not waste them ([Becky Weiss, AWS Builders' Library talk](https://ollie.academy/curated/amazon-builders-library/failing-successfully)).
- **Two-way vs one-way doors**: reversible decisions should be made fast; irreversible ones deserve deliberate slowness ([Bezos, GeekWire transcript](https://www.geekwire.com/2018/full-transcript-chief-slowdown-officer-jeff-bezos-shares-amazon-management-wisdom/)).

### Microsoft — Definition of Done and shift-left testing
- **Definition of Done** is an explicit, team-documented checklist (acceptance criteria met, refactoring complete, build clean, unit tests written and passing, existing tests pass, …) ([Engineering Fundamentals Playbook](https://microsoft.github.io/code-with-engineering-playbook/agile-development/team-agreements/definition-of-done/)).
- **Shift-left principles**: test ownership follows product ownership; test infrastructure is a shared service; **test code is product code — only reliable tests survive**; product is designed for testability ([Continuous Delivery](https://devblogs.microsoft.com/premier-developer/continuous-delivery-is-it-right-for-you/)); L0/L1 = unit level, tested in the assembly under test ([Shift testing left with unit tests](https://learn.microsoft.com/en-us/devops/develop/shift-left-make-testing-fast-reliable)).
- Dev+test merged into one engineering org where everyone is accountable for the quality of what they produce ([Brian Harry, VSTS testing](https://devblogs.microsoft.com/bharry/testing-in-a-cloud-delivery-cadence/)).

### GitHub — enforcement mechanics
- Branch protection / rulesets make gates **structural**: required status checks, no force-push, PR-only merges ([docs.github.com](https://docs.github.com/en/get-started/learning-about-github/githubs-plans)); `CODEOWNERS` routes review ownership.
- **GitHub Pages caveat**: Pages sites are **publicly available on the internet even when the repository is private**, and publishing from a private repo requires a paid plan ([Securing your GitHub Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https), [GitHub's plans](https://docs.github.com/en/get-started/learning-about-github/githubs-plans)).

## Gap analysis — this repo today

| Practice | State in this repo |
|---|---|
| Code review standards | PR template + linked issue + `type:*` label + <400L slices (with explicit `size:exception`); enforced by convention/agent skill, **not by branch protection or CODEOWNERS** |
| Tests with every change | Strong: TDD default, 3,269 Vitest tests, 2 Playwright suites, exact-label e2e discipline, `list` reporter now in CI logs |
| CI as quality gate | Strong: Test, E2E (local), 6 E2E (auth) legs, Docker validate, GitGuardian; publish strictly gated on green |
| Definition of Done | **Implicit** — scattered across `AGENTS.md` rules 1–6 and `CONTRIBUTING.md`; no single checklist |
| Decision records | **Missing** — decisions live in agent task logs (`odd/`, gitignored) → invisible to the team and lost on clone |
| Flaky-test policy | **Ad hoc** — issues #368 (stale UI) and #372 (locale race) tracked, but no quarantine rule, owner, or SLA |
| Visual regression | **Missing** — the 611px-icon defect class shipped to a reviewed surface and was caught only by human eyes in Storybook |
| Incident learning | **Informal** — root causes recorded in task logs (F2 standalone merge hazard, stale-deploy check in `AGENTS.md`); no COE-lite template |
| Delivery metrics | **Informal** — CI minutes tracked ad hoc (21.6m → 7.3m); no lead time / change-failure tracking |
| Test taxonomy | Implicit (unit/component in Vitest, e2e in Playwright); scope rules not written down |

## Proposed measures (for maintainer approval — nothing applied)

Ranked by impact/effort. Items marked **(process decision)** need explicit human approval before rollout.

**Tier 1 — enforce what we already practice**
1. **Definition of Done** as a checklist in `CONTRIBUTING.md` and the PR template: linked issue · RED→GREEN evidence for behavior changes · `pnpm test` + `tsc` + `lint` + applicable e2e green · help/docs updated with any command/option/message change · `Risk: item N | none` line · tests assert every observable effect through public interfaces. (Evidence: Microsoft DoD playbook; Google "tests ship with features".)
2. **Branch protection on `main` + `CODEOWNERS`** — required checks = the green set we already run; no force-push; PR-only. Turns conventions into structure. **(process decision; GitHub settings + file)**
3. **ADR-lite decision records** in `docs/adr/NNNN-title.md` (context, decision, consequences) for durable choices — replaces losing decisions in gitignored agent logs. **(process decision)**

**Tier 2 — quality loops**
4. **Flaky-test policy**: a failing-but-flaky test gets a `flaky` issue within 24h (owner + hypothesis + SLA); quarantine with `test.skip` + link, never delete; two-strike rule before quarantine. Seed backlog: #368, #372. (Evidence: Microsoft "only reliable tests survive"; Google unified test reporting.)
5. **Visual regression with Chromatic** on the Storybook stories (free tier covers this repo): catches the icon-bug class automatically before merge. Ties directly to the Storybook hosting decision below. **(process decision — external service)**
6. **COE-lite postmortem** template (`docs/templates/coe-lite.md`: impact, timeline, root cause, detection gap, action items with owners) for any incident that reaches a merged surface or blocks delivery. (Evidence: AWS CoE — no blame, prevention-focused.)
7. **PR review checklist** from Google's reviewer guide (design · functionality · complexity · tests · naming · comments · style · docs) folded into the PR template's Test Plan section.

**Tier 3 — measure and ratchet**
8. **DORA-lite metrics** from `gh` data: PR lead time (open→merge), change failure rate (reruns/hotfixes per merged PR), CI duration trend (we already narrate it). Quarterly look, no dashboards. (Evidence: DORA metrics predict organizational performance; measure system outcomes, avoid local optimization.)
9. **Test taxonomy note** in `CONTRIBUTING.md`: which layer catches what (Vitest unit/component · Playwright journeys · exact-label contract), so new tests land in the right layer. (Evidence: Microsoft L0–L2 taxonomy; Google test sizes.)

## Storybook hosting comparison (persistent "always-on" viewing)

| Option | Persistent URL | Visual regression | Private-repo support | Cost | Ops burden |
|---|---|---|---|---|---|
| **Chromatic** (official Storybook team) | ✅ auto-updates per push, versioned | ✅ built-in (browsers, viewports, diff review) | ✅ designed for it | **Free**: 5,000 billed snapshots/mo (≈25k Turbosnaps), Chrome, unlimited projects/users ([pricing](https://www.chromatic.com/pricing), [visual testing](https://www.chromatic.com/storybook)) | None (SaaS) |
| GitHub Pages | ✅ | ❌ | ⚠️ paid plan for private repos, and **sites are public even from private repos** ([docs](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https)) | Free if public | Low |
| Self-hosted static (nginx container on the existing Docker host) | ✅ on LAN/own domain | ❌ | ✅ | ~free | Medium (deploy job, TLS, uptime) |
| Vercel/Netlify static deploy | ✅ | ❌ (general hosting, not component workflows per Chromatic's comparison) | ✅ | free tiers | Low |
| Storybook "Share" button | ❌ temporary snapshot link | ❌ | n/a | Free | None |

**Recommendation: Chromatic (free tier)** — it is the only option that also delivers measure #5 (visual regression), which would have caught the 611px-icon defect class automatically. Fallback if an external SaaS is unwanted: self-hosted nginx on the existing Docker host.

## Sources
- google.github.io/eng-practices (reviewer standard, what to look for, small CLs, speed)
- abseil.io/resources/swe-book (ch11 testing, ch23 CI); arxiv.org/abs/1702.01715 (§2.4 unit testing)
- martinfowler.com/articles/testing-culture.html (Test Certified ratcheting)
- dora.dev/guides/dora-metrics + dora.dev/insights/dora-metrics-history + 2021–2024 reports
- awscloud.com CoE template; Amazon Builders' Library (failing successfully); GeekWire Bezos transcript (two-way doors)
- microsoft.github.io/code-with-engineering-playbook (Definition of Done); devblogs.microsoft.com (shift-left, VSTS testing); learn.microsoft.com (shift-left unit tests)
- docs.github.com (plans, Pages security warning); chromatic.com/pricing + chromatic.com/storybook; storybook.js.org/docs/sharing
