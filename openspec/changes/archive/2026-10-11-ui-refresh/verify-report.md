```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:68216d38c5e35ce765d390248e20ee0959aa6124ecd4f90691f4744b66fb3a0a
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 5/5
scenarios: 12/12
test_command: pnpm test
test_exit_code: 0
test_output_hash: sha256:b07c404d77314da501968852de9cb7abcfac00d5d17030a85e44591e06fcacb3
build_command: npx tsc --noEmit
build_exit_code: 0
build_output_hash: sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

## Verification Report

**Change**: ui-refresh (issue #325)
**Version**: N/A (1 delta domain: `ui-refresh` [new])
**Mode**: Standard (Strict TDD inactive — no `openspec/config.yaml`)
**Branch**: `main`, HEAD `b07e5d1` (Merge PR #328), working tree clean except pre-existing untracked `.opencode/opencode.json` and `odd/` (present before this run, untouched). All 3 slices MERGED: PRs #326/#327/#328. No code, spec, or artifact was modified during verification; this report is the only file written.
**Evidence revision**: sha256 of the preimage `HEAD | test_output_hash | lint_output_hash | tsc_output_hash | local-e2e_hash | ui-refresh-e2e_hash` = `b07e5d123394633323acb9c019c354123e04f686 | sha256:b07c404d… | sha256:85b37f07… | sha256:e3b0c442… | sha256:5dab9194… | sha256:481e1daf…`.

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 18 |
| Tasks complete | 18 |
| Tasks incomplete | 0 |
| ActionContext mode | standard change (not workspace-planning) |

All 18 task checkboxes are `[x]`; zero unchecked. Full spec-driven verification is permitted.

### Build & Tests Execution

**Build / type-check**: ✅ Passed
```text
npx tsc --noEmit  →  exit 0 — no diagnostics (empty output, 0 bytes; hash sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855)
pnpm lint         →  exit 0 — eslint clean (only the 3-line pnpm banner; hash sha256:85b37f071cd58af45049ea2371c5b16c077b6d0eb5997fc63e5c3888a5f1b639)
```

**Tests (unit + integration)**: ✅ 3011 passed / ❌ 0 failed / ⚠️ 0 skipped (210 files)
```text
pnpm test  →  exit 0 (hash sha256:b07c404d77314da501968852de9cb7abcfac00d5d17030a85e44591e06fcacb3)
  Test Files  210 passed (210)
       Tests  3011 passed (3011)
    Duration  28.37s
Includes the new suites: lib/ui-flag/flag.test.ts (9), lib/ui-flag/index.test.tsx (4),
features/teams/detail/TeamDetailViewV2.test.tsx (12), app/teams/[teamId]/page.test.tsx (16).
Legacy suites green unedited: TeamDetailView.test.tsx (22), TeamRosterTable.test.tsx (20),
RosterTable.test.tsx (50), HirePlayerDialog.test.tsx (6).
Known-context probe: features/profile/ProfilePanel.test.tsx (21) passed in the SAME full-suite
load (1779ms) — the documented role=alert flake did NOT fire; no isolated re-run needed.
```

**E2E — full local suite, flag OFF baseline (AUTH_MODE=local)**: ✅ 26 passed, exit 0
```text
AUTH_MODE=local pnpm exec playwright test --reporter=line  →  exit 0
  26 passed (17.0s)   (hash sha256:5dab91941d239c1e21581920741afddd0c8c6c79b1453feb2baa17018513f49e)
  chromium: create-team (15), delete-team (2), ui-refresh-roster (4); mobile project: mobile.spec (5).
  playwright.config.ts testIgnore gained NO ui-refresh entry (spec runs in the default project).
```

**E2E — flag-ON + triangulation + mobile suite**: ✅ 4 passed, exit 0
```text
AUTH_MODE=local pnpm exec playwright test e2e/ui-refresh-roster.spec.ts --reporter=line  →  exit 0
  4 passed (7.8s)   (hash sha256:481e1daf2355822631a014cf7086b2bfc2cd87abe2e2c62c84e80799e0b769d7)
  [1] flag ON (bb-ui=next): the team detail seam renders the V2 surface   (e2e/ui-refresh-roster.spec.ts:64)
  [2] flag OFF via bb-ui=legacy: the legacy surface renders (triangulation) (:79)
  [3] flag OFF with no cookie: the legacy surface renders (default)        (:89)
  [4] flag ON at a mobile viewport: stacked V2 cards replace both tables  (:99)
```

**Coverage**: ➖ Not available (no coverage tool/threshold configured; `openspec/config.yaml` absent)

**Validator availability**: the `gentle-ai` on PATH (Homebrew 4.0.0) reports `unknown command "sdd-verify-validate"`; the same product's `sdd-verify-validate` (gentle-ai 2.2.4, `~/go/bin/gentle-ai`, module source `internal/cli/sdd_verify_validate.go`) implements the documented `--input/--requirements/--scenarios` admission and WAS run against these exact candidate bytes before this file was written (result in the "Validator" line below).

### Spec Compliance Matrix

Counts read directly from `openspec/changes/ui-refresh/specs/ui-refresh/spec.md`: 5 requirements (`### Requirement:`) / 12 scenarios (`#### Scenario:`).

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| UIR-1 Flag Resolution Server and Client | Cookie `next` resolves ON | `lib/ui-flag/flag.test.ts > resolves ON for the exact 'next' value`; `lib/ui-flag/index.test.tsx > honors a true SSR seed (bb-ui=next)`; runtime server path exercised by `e2e/ui-refresh-roster.spec.ts:64` (cookie → layout read → V2 renders) | ✅ COMPLIANT |
| UIR-1 | Absent cookie defaults OFF | `flag.test.ts > resolves OFF when the cookie is absent` + `> resolves OFF for an explicit null`; `index.test.tsx > falls back to false (legacy)`; `e2e/ui-refresh-roster.spec.ts:89` (no cookie → legacy, count 1) | ✅ COMPLIANT |
| UIR-1 | Unknown value treated as OFF | `flag.test.ts > resolves OFF for a differently cased value` + `> resolves OFF for any other value` + `> resolves OFF for padded or otherwise malformed values` + `> never throws for hostile input`; `e2e/ui-refresh-roster.spec.ts:79` (`bb-ui=legacy` → legacy surface) | ✅ COMPLIANT |
| UIR-2 Single Team Detail Seam | Flag ON selects V2 | `e2e/ui-refresh-roster.spec.ts:64 > flag ON (bb-ui=next): the team detail seam renders the V2 surface` — `ui-v2-hero/coaching/treasury/roster` visible AND `team-roster-table` count 0 | ✅ COMPLIANT |
| UIR-2 | Flag OFF selects legacy | `e2e/ui-refresh-roster.spec.ts:89` (no cookie → `team-roster-table` count 1, `ui-v2-roster` count 0); `app/teams/[teamId]/page.test.tsx > renders TeamDetailView after hydration for a known team` (asserts `team-roster-table` at :311) | ✅ COMPLIANT |
| UIR-2 | Behavior identical across variants | Shared `viewProps` literal spread into exactly ONE component (`app/teams/[teamId]/page.tsx:268-282`); V2 forbidden from `features/teams/api`/`AppProvider` — enforced at runtime by `TeamDetailViewV2.test.tsx > V2 sources stay presentation-only (no api or AppProvider imports)`; hire flow driven by the same `onHire` prop on both surfaces (`TeamDetailView.test.tsx > shows a Contratar button and opens the hire dialog when onHire is present`, `TeamDetailViewV2.test.tsx > hire flow: Contratar opens the dialog and the Editar toggle hides it`) | ✅ COMPLIANT |
| UIR-3 Legacy Contract Frozen With Flag OFF | Existing suites pass unmodified | `pnpm test` 3011/3011 + local e2e 26/26 with no `bb-ui` cookie in legacy specs; git proof below — zero legacy test files edited | ✅ COMPLIANT |
| UIR-3 | Legacy markers present | `TeamDetailView.test.tsx > renders the three Spanish book section headings` (Plantilla / Cuerpo técnico / Tesorería); `TeamRosterTable.test.tsx > renders the SPP bar…` (`spp-pe-p1`), `roster-row-*` (`TeamRosterTable.tsx:218`), `team-roster-table` (`TeamRosterTable.tsx:161`), `open-hire-dialog` (`TeamDetailView.tsx:121`) — all asserted in the passing suites | ✅ COMPLIANT |
| UIR-4 Flag-ON e2e Desktop and Mobile | Desktop V2 asserted | `e2e/ui-refresh-roster.spec.ts:64` — `page.context().addCookies([{name:"bb-ui",value:"next",url:"http://localhost:3000"}])` BEFORE first `goto` (:33), `ui-v2-roster` visible, `team-roster-table` count 0 (:75-76) | ✅ COMPLIANT |
| UIR-4 | Mobile V2 asserted | `e2e/ui-refresh-roster.spec.ts:99` — inline `setViewportSize({width:390,height:844})` (:105), `ui-v2-roster-card-*` visible, no legacy table, no desktop V2 table (:109-118) | ✅ COMPLIANT |
| UIR-5 Per-Screen Flip Discipline | Flip blocked without green e2e | No default flip shipped: the seam falls back to legacy whenever the flag is OFF (`page.tsx:282`), proven by the flag-OFF e2e (:89) and by `page.test.tsx`; the gating flag-ON e2e exists and is green 4/4 | ✅ COMPLIANT |
| UIR-5 | Other screens unaffected by a flip | `grep useUiFlag` → consumed ONLY by `app/teams/[teamId]/page.tsx:115` (the `TeamDetailViewV2.tsx:34` hit is a doc comment); runtime: the flag-ON e2e sets the cookie first and drives `/teams/create` → `/` → `/teams` → detail with `bb-ui=next` present — every other route rendered unchanged and the flow passed | ✅ COMPLIANT |

**Compliance summary**: 12/12 scenarios compliant (12 ✅ COMPLIANT, 0 ❌ FAILING, 0 ❌ UNTESTED, 0 ⚠️ PARTIAL); 5/5 requirements.

### Correctness (Static Evidence — requirement traceability)

| Requirement | Status | Evidence (command → result, file:line) |
|------------|--------|----------------------------------------|
| UIR-1 | ✅ Implemented | `grep -n "resolveUiFlag\|UI_FLAG_COOKIE" app lib` → `lib/ui-flag/flag.ts:13` (`UI_FLAG_COOKIE = "bb-ui"`), `flag.ts:21` (`resolveUiFlag`, true ONLY for exact `"next"`); `app/layout.tsx:51` reads it beside `bb-locale`/`bb-theme` (:44-46); `app/layout.tsx:100-102` nests `<UiFlagProvider initialUiFlag>` inside `ThemeProvider` around `SessionAppProvider`; client fallback `lib/ui-flag/index.tsx:30`. Unit: flag.test.ts 9/9 + index.test.tsx 4/4 inside `pnpm test` exit 0. |
| UIR-2 | ✅ Implemented | `grep useUiFlag` → `app/teams/[teamId]/page.tsx:11,115`; seam `page.tsx:268-282`: one `viewProps: TeamDetailViewProps` literal spread into exactly one of `<TeamDetailViewV2/>`/`<TeamDetailView/>` (ternary, never both), file stays `"use client"` (:1). V2 presentation-only: `TeamDetailViewV2.tsx` imports no `features/teams/api`/`AppProvider` (verified by grep AND by the runtime test `TeamDetailViewV2.test.tsx > V2 sources stay presentation-only`); `TeamDetailViewV2.tsx:39` `export type TeamDetailViewV2Props = TeamDetailViewProps`. |
| UIR-3 | ✅ Implemented | `git diff --name-status d05504c..b07e5d1` → only `M app/layout.tsx`, `M app/teams/[teamId]/page.tsx` + 12 `A` (all new ui-flag/V2/e2e/openspec files). Per-merge check (`git diff --name-only <merge>^1 <merge>` for b2d7852, f7500c4, b07e5d1) → ZERO legacy test files touched (the only `*.test.tsx`/`*.spec.ts` entries are the 4 NEW files: `e2e/ui-refresh-roster.spec.ts`, `features/teams/detail/TeamDetailViewV2.test.tsx`, `lib/ui-flag/flag.test.ts`, `lib/ui-flag/index.test.tsx` — all confirmed absent at base `d05504c` via `git cat-file -e`). Legacy markers still live: `TeamRosterTable.tsx:161` (`team-roster-table`), `:218` (`roster-row-*`), `:359` (`spp-pe-*`), `TeamDetailView.tsx:121` (`open-hire-dialog`), headings via `dictionaries.ts:205,208,209` (`Plantilla`/`Cuerpo técnico`/`Tesorería`). |
| UIR-4 | ✅ Implemented | `e2e/ui-refresh-roster.spec.ts` — 4 tests; cookie helper `:31-36` uses `page.context().addCookies` (pattern `e2e/locale.spec.ts:69-71`); desktop `:64-77`, triangulations `:79-97`, mobile `:99-119` (inline viewport, config untouched); `grep -n "testIgnore" playwright.config.ts` → no `ui-refresh` entry. Run: 4 passed, exit 0. |
| UIR-5 | ✅ Implemented | `grep -rn "useUiFlag()" app features components` (excluding tests/comments) → single consumer `app/teams/[teamId]/page.tsx:115`; `grep -rn "bb-ui" app features lib components` → ONLY the read in `app/layout.tsx` + module internals — no cookie writer, no default flip (seam `page.tsx:282` still falls back to legacy); flip-discipline documented in `TeamDetailViewV2.tsx:33-38`. |

### Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| `lib/ui-flag/flag.ts` pure resolver + `index.tsx` provider/useUiFlag | ✅ Yes | Files exist as specified; unit tests mirror `lib/auth-mode.test.ts` style. |
| Server read in `app/layout.tsx` beside `bb-locale`/`bb-theme` | ✅ Yes | `layout.tsx:44-51`; design cites "lines 42–44" — comment growth shifted it to :51 (doc drift only, SUGGESTION). |
| Transport: provider context (`UiFlagProvider` RSC prop), not `document.cookie` | ✅ Yes | `layout.tsx:100-102` nests it in `ThemeProvider` around `SessionAppProvider`. |
| OFF default, no cookie writer (dev toggle undecided) | ✅ Yes | `grep bb-ui` → no writer anywhere; only `lib/theme` writes `document.cookie`. |
| Shared `viewProps` object, one ternary, `"use client"` kept | ✅ Yes | `page.tsx:268-282`; file starts `"use client"` (:1). |
| `TeamDetailViewV2Props = TeamDetailViewProps` | ✅ Yes | `TeamDetailViewV2.tsx:39`. |
| Reuse `useIsDesktop` for mobile/desktop | ✅ Yes | `v2/RosterV2.tsx:8` imports it; legacy uses the same hook. |
| V2 testids `ui-v2-*` only, legacy names never reused | ✅ Yes | `TeamDetailViewV2.test.tsx > mounts every ui-v2-* section marker and no legacy testid at all` (passes); grep shows no legacy testid in V2 sources. |
| E2E: cookie before first `goto`, not in `testIgnore`, triangulate `bb-ui=legacy` | ✅ Yes | `ui-refresh-roster.spec.ts:33`, `playwright.config.ts:21-46` untouched, `:79` triangulation. |
| E2E mobile viewport `setViewportSize({375×812})` (design.md:70, tasks 3.4) | ⚠️ No | Implemented as `390×844` (`ui-refresh-roster.spec.ts:105`). Still a mobile viewport well below the 768px `useIsDesktop` breakpoint, so UIR-4's spec scenario holds; deviation from the design/task literal — WARNING 1. |
| Stitch screens hand-translated, never imported | ✅ Yes | No Stitch imports; only doc comments mention Stitch (`TeamDetailViewV2.tsx:17`, `RosterV2.tsx:51`). |
| File Changes table (8 files) | ✅ Yes | All 8 present; no undeclared production file changed. |

### Known Context (recorded, not fixed)

- **ProfilePanel `role=alert` flake**: did NOT fire — `features/profile/ProfilePanel.test.tsx` (21 tests) passed inside the full `pnpm test` load; `profile.spec.ts` is `testIgnore`d from the local chromium project (`playwright.config.ts:41`) so it is not part of the local e2e baseline. No isolated re-run was required.
- **`sdd-apply-deepseekapi` agent broken (model id)**: known apply-phase tooling defect; it did not participate in this verification (all evidence above came from direct command execution). No impact on the verdict.
- **PATH `gentle-ai` 4.0.0 lacks `sdd-verify-validate`**: admission was run with the gentle-ai 2.2.4 build at `~/go/bin/gentle-ai`, which implements the documented command.

### Issues Found

**CRITICAL**: none.

**WARNING**:
1. **Mobile e2e viewport deviates from design/tasks literal.** `design.md` (Testing Strategy) and `tasks.md` 3.4 both specify `page.setViewportSize({ width: 375, height: 812 })`; the implementation uses `390×844` (`e2e/ui-refresh-roster.spec.ts:105`, documented in its header comment). Spec UIR-4 only requires "a mobile viewport", so the requirement passes, and 390px is far below the 768px `useIsDesktop` breakpoint (the mobile branch is genuinely exercised — `ui-v2-roster-card-*` asserted visible, desktop table asserted absent). Non-blocking: either update the design/tasks prose to 390×844 or align the spec to 375×812 at archive.

**SUGGESTION**:
- `design.md` cites `app/layout.tsx` "lines 42–44" for the cookie read; the merged file reads at :47-51 (comment growth). Doc-only drift — refresh the line reference when archiving.
- No network-level request-parity test compares a roster action across the two surfaces; parity is enforced structurally (single `viewProps` literal + the presentation-only import test). A future flag-ON hire e2e would close that gap if the seam ever grows.

### Validator

```text
~/go/bin/gentle-ai sdd-verify-validate --input <candidate> --requirements 5 --scenarios 12
→ {"valid": true, "verdict": "pass_with_warnings", "evidence_revision": "sha256:68216d38c5e35ce765d390248e20ee0959aa6124ecd4f90691f4744b66fb3a0a"}
```

### Verdict

**PASS WITH WARNINGS**
All 18 tasks complete; every runtime gate green on merged `main` at `b07e5d1`: `pnpm test` 3011/3011 (210 files), full local e2e 26/26 (flag-OFF baseline), the dedicated flag-ON/triangulation/mobile suite 4/4, `pnpm lint` exit 0, `npx tsc --noEmit` exit 0. All 5 requirements and all 12 scenarios have passing covering runtime tests (12/12 COMPLIANT, 0 UNTESTED, 0 FAILING); legacy is provably frozen (zero legacy test edits across the three merge commits; legacy testids/headings asserted green). The single WARNING is a design-prose deviation (mobile viewport 390×844 vs the documented 375×812) that does not affect any spec scenario. **Next**: sdd-archive (acknowledge the viewport WARNING there).
