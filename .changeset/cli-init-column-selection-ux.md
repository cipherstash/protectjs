---
'stash': patch
---

`stash init` and `stash schema build`: tighter UX in the per-table column picker.

- **No more silent skip-throughs.** The multiselect no longer relies on clack's `required: true`. If you press enter with nothing toggled, you get an explicit recovery prompt instead of being railroaded into the next step. When you've already configured another table this run, the recovery offers "Skip encryption for the `<x>` table"; otherwise it warns and re-shows the picker.
- **Confirmation summary before moving on.** After ≥1 column is selected, init reads the picks back ("Encrypt 3 columns in `users` (email, name, and ssn)?") and lets you back out into the picker if you misclicked.
- **Already-encrypted columns are no longer toggleable.** Columns whose Postgres type is `eql_v2_encrypted` are surfaced as a "will be kept as-is" note and merged into the schema automatically, instead of sitting in the multiselect where deselecting them would silently drop them. If every column in a table is already encrypted, init now confirms "keep as-is?" and skips the multiselect entirely.
- **`selectTableColumns` now returns a discriminated `{ kind: 'schema' | 'skip' | 'cancel' }`** so the outer loop can distinguish "user skipped this table" from "user cancelled the whole flow".
- **EQL-managed tables are filtered out of introspection.** Anything in the `eql_v2_` namespace (e.g. `eql_v2_configuration`) is no longer offered as a choice — encrypting EQL's own configuration store would break EQL itself.
