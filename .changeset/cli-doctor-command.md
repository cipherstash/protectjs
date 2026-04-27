---
"@cipherstash/cli": minor
---

Add `stash doctor` command — a single read-only diagnostic that checks the health of a CipherStash install across project state, config, auth, environment, database, and ORM integration. Prints a categorised human report by default, or `--json` for a stable machine-readable shape; `--only <category>` narrows the run and `--skip-db` avoids DB-opening checks. `--fix` is reserved for a follow-up PR.
