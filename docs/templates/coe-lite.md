# COE-lite — lightweight Correction of Errors

Template for post-incident write-ups, adapted from AWS's Correction of Errors
process: a COE identifies and fixes problems, drives ownership of action items,
maximizes lessons learned, and prevents recurrence. **It is not to blame or
punish.** File as `docs/notes/coe-YYYY-MM-DD-<slug>.md` after any incident that
reached a merged surface, broke delivery, or produced user-visible wrong behavior.

## Summary
One paragraph: what happened, in plain language.

## Impact
- Who/what was affected (users, environments, pipelines).
- Duration: first symptom → resolution.

## Timeline
| Time (UTC) | Event |
|---|---|
| | First symptom observed |
| | Detection (how it was found — alert, user report, review, test) |
| | Root cause identified |
| | Mitigation / fix landed |

## Root cause
The technical chain, ending at the process gap that let it happen. "What did we
not know?" is the question that matters.

## Detection gap
Why nothing caught it earlier (missing test, missing visual check, missing gate,
stale deploy, unchecked assumption). Name the layer where it *should* have been
caught.

## What changes
| Action item | Owner | Done when |
|---|---|---|
| | | |

## Links
Issues, PRs, commits, prior art (previous COEs on the same failure class).
