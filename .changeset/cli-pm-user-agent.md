---
"@cipherstash/cli": patch
---

Detect the package manager from `npm_config_user_agent` when running `stash init`. Running `bunx @cipherstash/cli init`, `pnpm dlx @cipherstash/cli init`, or `yarn dlx @cipherstash/cli init` now uses the invoking tool for dependency installation (`bun add`, `pnpm add`, `yarn add`) instead of falling back to `npm install`. Lockfile detection is still preferred when present, so projects with an existing convention are unaffected. Fixes `EUNSUPPORTEDPROTOCOL` failures on `workspace:*` deps in Bun-managed projects.
