---
"stash": minor
---

Add a plan-or-implement choice to `stash init`. After the install/detection steps, the user picks whether the agent handoff should produce a reviewable plan at `.cipherstash/plan.md` first (the recommended default) or go straight to implementation. Plan mode currently routes only to Claude Code or Codex; implement mode preserves the existing four-target picker. The implementation prompt now reads an existing plan as the source of truth for routing rather than re-asking which path applies.
