# Architecture Decision Records (ADR)

Durable technical decisions live here, not in ephemeral task logs. One file per
decision; the filename is `NNNN-kebab-title.md`, numbered in creation order.

## When to write an ADR
- The decision constrains future work (formats, contracts, infrastructure,
  delivery strategy) and someone would otherwise re-litigate it.
- A decision reverses or supersedes an earlier one (then mark the old ADR
  `Superseded by NNNN` and link both ways).

Not every task needs an ADR: routine implementation follows the conventions in
`CONTRIBUTING.md` and `AGENTS.md`.

## Template

```markdown
# NNNN — Title

Status: Accepted | Superseded by NNNN | Deprecated
Date: YYYY-MM-DD

## Context
What forced the decision now. Constraints, evidence, alternatives considered.

## Decision
The choice, in one or two sentences, stated positively.

## Consequences
What becomes easier, what becomes harder, what must never be done because of it.
```
