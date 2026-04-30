---
'@cipherstash/cli': minor
---

**Breaking:** the `stash wizard` command has been removed. The AI-guided encryption setup is now its own package — run it via `npx @cipherstash/wizard` (or `pnpm dlx`, `bunx`, `yarn dlx`).

The wizard was pulling `@anthropic-ai/claude-agent-sdk` (47MB unpacked) into every `npx @cipherstash/cli` invocation, even for fast commands like `init`, `auth`, and `db install`. Splitting it out keeps cli's dependency tree small and lets each package manager handle the wizard's install natively — no more shelling out to `npm` from inside the cli, no Yarn PnP / Bun-only failure modes.

The next-steps output from `init` and `db install` still recommends `npx @cipherstash/wizard` as the automated path. The `schema build` command no longer offers a wizard/builder selection prompt — it goes straight to the schema builder.
