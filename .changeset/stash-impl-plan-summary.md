---
"stash": minor
---

`stash impl` now renders a plan summary panel and asks the user to confirm before launching the implementation agent. When a plan exists, the CLI parses a machine-readable `<!-- cipherstash:plan-summary {...} -->` block (the planning agent is instructed to emit one at the top of `.cipherstash/plan.md`) and prints column counts, per-column paths, and whether the work is single-deploy or staged across 4 deploys. Default-yes on the confirm so the path of least resistance is to proceed; saying No exits cleanly. Older plans without the summary block fall back to a soft "open in your editor" panel — never an error. Non-TTY runs (CI, pipes) skip the confirm and proceed.
