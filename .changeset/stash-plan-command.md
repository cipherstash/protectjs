---
"stash": minor
---

Extract planning into its own `stash plan` command. Three commands now own the setup lifecycle:

- `stash init` — scaffold (auth, db, deps, EQL). Ends with a chain prompt to `stash plan`.
- `stash plan` — draft a reviewable plan at `.cipherstash/plan.md`. Ends with a chain prompt to `stash impl`.
- `stash impl` — execute. With a plan, shows the summary panel and confirms. Without one, presents a `Draft a plan first / Continue without a plan` picker (the second option goes through a security confirm). `--continue-without-plan` skips the picker.

`stash status` reflects the new flow — its "Plan written" stage and `Next:` line route to `stash plan` when init is done but no plan exists. Non-TTY runs of `stash impl` without a plan now error out with a clear next-action rather than guessing intent.
