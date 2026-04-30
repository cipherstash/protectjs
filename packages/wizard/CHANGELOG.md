# @cipherstash/wizard

## 0.1.1

### Patch Changes

- f34fe9d: Show and execute commands using the detected package manager's runner (`npx` / `bunx` / `pnpm dlx` / `yarn dlx`) instead of always emitting `npx`. A user who runs `bunx @cipherstash/cli init` now sees a "Next Steps" panel that suggests `bunx @cipherstash/cli db install` and `bunx @cipherstash/wizard`, and the wizard's post-agent step both displays and shells out to `bunx @cipherstash/cli db push` (was: `Failed: npx @cipherstash/cli db push`). Wizard prerequisite messages and AI-agent error hints (e.g. on a 401, `Run: bunx @cipherstash/cli auth login`) follow the same rule. Detection sources are unchanged: `npm_config_user_agent` first, then lockfile, then `npx` fallback.

## 0.1.0

### Minor Changes

- 5d3eb13: Initial release of `@cipherstash/wizard` — AI-powered encryption setup for CipherStash, extracted from `@cipherstash/cli`.

  Run it once per project, after `stash init`:

  ```bash
  npx @cipherstash/wizard
  pnpm dlx @cipherstash/wizard
  yarn dlx @cipherstash/wizard
  bunx @cipherstash/wizard
  ```

  The wizard reads your codebase, asks which columns to encrypt, hands a surgical prompt to the Claude Agent SDK against the CipherStash-hosted LLM gateway, and runs deterministic post-agent steps (package install, `db install`, `db push`, framework migrations). Same behavior as the previous `stash wizard` command — just shipped as its own package so it doesn't bloat the cli's dependency tree.
