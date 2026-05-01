---
"stash": minor
"@cipherstash/wizard": patch
---

Rename the CLI package from `@cipherstash/cli` to `stash`. The published code, commands, and flags are unchanged — this is a pure rename so the day-to-day invocation drops from `npx @cipherstash/cli ...` to `npx stash ...`.

**Migration**

1. Update your `package.json` devDependencies:

   ```diff
   -  "@cipherstash/cli": "^0.10.0"
   +  "stash": "^0.10.1"
   ```

2. Update the `defineConfig` import in `stash.config.ts`:

   ```diff
   - import { defineConfig } from '@cipherstash/cli'
   + import { defineConfig } from 'stash'
   ```

3. Update any `npx @cipherstash/cli ...` / `bunx @cipherstash/cli ...` / `pnpm dlx @cipherstash/cli ...` / `yarn dlx @cipherstash/cli ...` invocations in scripts, CI, READMEs, and team docs to use `stash` instead. Programmatic exports (`defineConfig`, `loadStashConfig`, `EQLInstaller`, `loadBundledEqlSql`, `downloadEqlSql`, `PermissionCheckResult`) are re-exported from `stash` with the same shapes.

**Wizard impact (`@cipherstash/wizard`)**

The wizard's post-agent step and its prerequisite / agent-error hints now reference `stash` (e.g. `Run: bunx stash auth login`, `Running bunx stash db install...`) rather than `@cipherstash/cli`. The wizard package name and `stash-wizard` binary are unchanged — only the strings the wizard prints and the commands it shells out to are affected.
