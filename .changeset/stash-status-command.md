---
"stash": minor
---

Add `stash status` — a top-level lifecycle map for the project. Reads `.cipherstash/context.json`, `.cipherstash/plan.md`, and `.cipherstash/setup-prompt.md` from disk to render a panel showing whether init is done, whether a plan has been written, and whether an agent has been engaged. Points at `stash db status` for EQL install info and `stash encrypt status` for per-column migration phase. Runs in milliseconds — no auth, no database connection required. The existing `stash db status` is unchanged.
