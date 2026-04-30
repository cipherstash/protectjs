---
'@cipherstash/cli': minor
---

Fix `loadStashConfig` to correctly unwrap the default export from `stash.config.ts`. Previously, any database-touching command (`db install`, `db push`, `db validate`, `db status`, `db test-connection`, `schema build`) would fail validation against a perfectly valid config with:

```
Error: Invalid stash.config.ts

  - databaseUrl: Invalid input: expected nonoptional, received undefined
```

The issue: in jiti 2.x, the `interopDefault: true` option passed to `createJiti(...)` only applies to the deprecated synchronous `jiti(id)` callable form. The async `jiti.import()` ignores it and always returns the full module namespace. With `export default defineConfig({...})` that meant Zod was validating `{ default: { databaseUrl, client } }` and reporting `databaseUrl` as undefined even when the user's config plainly set it.

Switched to jiti's per-call `{ default: true }` option, which does work on `jiti.import()`. Added an integration test that exercises real jiti against a real temp `stash.config.ts` so future regressions get caught — the previous mocked test was passing the bug straight through.

This bug surfaced after `db install` started loading `stash.config.ts` (during the onboarding overhaul), but affected every other command that reads the config.
