---
'stash': patch
---

Make `--help` banners and the post-install "Next steps" panel show commands using the package manager the user actually invoked the CLI with, instead of always emitting `npx`.

A user who runs `bunx @cipherstash/cli --help` now sees:

```
Usage: bunx @cipherstash/cli <command> [options]
…
Examples:
  bunx @cipherstash/cli init
  bunx @cipherstash/cli auth login
  bunx @cipherstash/cli db install
```

instead of `npx @cipherstash/cli …` regardless of how they invoked it. Same for `pnpm dlx`, `yarn dlx`, and the default `npx` path.

Concretely:

- `--help` (top-level) — usage line and all six examples in `bin/stash.ts`.
- `--help` (auth) — usage line and the two `auth login` examples in `commands/auth/index.ts`.
- `db install`'s "Next steps" note — the `wizard` invocation now matches the user's runner.
- The `@cipherstash/stack is required for this command` hint shown by `requireStack` (when `db push`/`validate`/`schema build` are run before the runtime SDK is installed) now suggests the package manager's install command and the user's runner for the follow-up `init` invocation.

No public-API change. Detection sources unchanged from #379: `npm_config_user_agent` first, then lockfile, then `npx` fallback.
