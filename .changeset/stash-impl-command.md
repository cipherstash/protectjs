---
"stash": minor
---

Split agent handoff out of `stash init` into a new `stash impl` command. `init` now owns scaffolding only (auth, database, encryption client, EQL extension) and exits at a clean checkpoint pointing at `stash impl`. `stash impl` derives plan-vs-implement mode from disk state — if `.cipherstash/plan.md` is missing it asks the agent to draft a plan; if it exists, the agent executes the plan as the source of truth. `--yolo` skips the planning checkpoint after an interactive confirmation. The earlier in-init `Plan first / Go straight to implementation` picker is removed in favour of the new command boundary.
