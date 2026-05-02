---
'stash': minor
---

Add `stash wizard` as a thin wrapper subcommand around `@cipherstash/wizard`.

The wizard ships as a separate npm package so the heavy agent SDK stays out of the `stash` CLI bundle. Until now, users had to remember a second tool name (`npx @cipherstash/wizard`); the wrapper exposes the same capability under the existing `stash` surface so the user only has to think about one CLI.

`stash wizard` detects the project's package manager and spawns the wizard via the matching one-shot runner — `npx`, `pnpm dlx`, `yarn dlx`, or `bunx` — with `stdio: 'inherit'` so the wizard owns the terminal cleanly. Any flags after `wizard` are forwarded verbatim, so `stash wizard --debug` works.

On a cold cache (the wizard package isn't installed in the project) the runner downloads it before launching — a few seconds. The wrapper prints an explicit "first run downloads ~5s" line in that case so the CLI doesn't appear hung. On a warm cache, just a "Launching the CipherStash wizard…" line, then the wizard takes over.

Existing copy that pointed at `npx @cipherstash/wizard` (init's next-steps for base / Drizzle / Supabase, `db install`'s post-install note) now uses `stash wizard`.
