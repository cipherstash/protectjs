# @cipherstash/cli

## 0.11.0

### Minor Changes

- de9c02c: Rename the CLI package from `@cipherstash/cli` to `stash`. The published code, commands, and flags are unchanged — this is a pure rename so the day-to-day invocation drops from `npx @cipherstash/cli ...` to `npx stash ...`.

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

- 8ee11fd: Layered `DATABASE_URL` resolution for DB / schema commands.

  Previously, any DB-touching command (`db install`, `db push`, `db upgrade`, `db status`, `db validate`, `db test-connection`, `schema build`) failed with the cryptic Zod error:

  ```
  Error: Invalid stash.config.ts
    - databaseUrl: Invalid input: expected nonoptional, received undefined
  ```

  if `DATABASE_URL` wasn't already in the environment. The CLI auto-loaded `.env.local` / `.env.development.local` / `.env.development` / `.env`, but had no story for `--database-url` flags, local Supabase, or pasted-once values.

  The scaffolded `stash.config.ts` now calls a resolver directly:

  ```ts
  import { defineConfig, resolveDatabaseUrl } from "stash";

  export default defineConfig({
    databaseUrl: await resolveDatabaseUrl(),
    client: "./src/encryption/index.ts",
  });
  ```

  `resolveDatabaseUrl()` walks sources in order; first hit wins:

  1. `--database-url <url>` flag — new, accepted on all seven DB / schema commands. Used for this run only; never written to disk.
  2. `process.env.DATABASE_URL` — covers shell exports, mise, direnv, dotenv-cli, the existing dotenv loads.
  3. `supabase status --output env` → `DB_URL` — auto-engaged when `--supabase` is set or a `supabase/config.toml` is detected. Useful for local Supabase users who haven't exported the URL yet.
  4. Interactive prompt — opens with a tip listing the alternatives (flag, env, the user's actual dotenv file). Skipped under `CI=true` or non-TTY stdin.
  5. Hard fail with a source-naming error message.

  The connection string is **never persisted to disk** — `stash.config.ts` only contains the `await resolveDatabaseUrl()` call, never a literal URL. The resolver also doesn't mutate `process.env`; CLI flag context is threaded into the config evaluation via `AsyncLocalStorage` so concurrent loads stay isolated. Source labels are logged on non-env paths (`Using DATABASE_URL from --database-url flag` / `from supabase status` / `from prompt`) but the URL itself is never echoed.

  `db test-connection`'s connection-failure hint is now source-aware: it points users at `--database-url`, the env var, and the actual dotenv file in their project (`.env.local` if present, `.env` otherwise) — not the misleading `stash.config.ts` it used to suggest.

## 0.10.1

### Patch Changes

- f34fe9d: Show and execute commands using the detected package manager's runner (`npx` / `bunx` / `pnpm dlx` / `yarn dlx`) instead of always emitting `npx`. A user who runs `bunx @cipherstash/cli init` now sees a "Next Steps" panel that suggests `bunx @cipherstash/cli db install` and `bunx @cipherstash/wizard`, and the wizard's post-agent step both displays and shells out to `bunx @cipherstash/cli db push` (was: `Failed: npx @cipherstash/cli db push`). Wizard prerequisite messages and AI-agent error hints (e.g. on a 401, `Run: bunx @cipherstash/cli auth login`) follow the same rule. Detection sources are unchanged: `npm_config_user_agent` first, then lockfile, then `npx` fallback.

## 0.10.0

### Minor Changes

- 79f4a0b: Fix `loadStashConfig` to correctly unwrap the default export from `stash.config.ts`. Previously, any database-touching command (`db install`, `db push`, `db validate`, `db status`, `db test-connection`, `schema build`) would fail validation against a perfectly valid config with:

  ```
  Error: Invalid stash.config.ts

    - databaseUrl: Invalid input: expected nonoptional, received undefined
  ```

  The issue: in jiti 2.x, the `interopDefault: true` option passed to `createJiti(...)` only applies to the deprecated synchronous `jiti(id)` callable form. The async `jiti.import()` ignores it and always returns the full module namespace. With `export default defineConfig({...})` that meant Zod was validating `{ default: { databaseUrl, client } }` and reporting `databaseUrl` as undefined even when the user's config plainly set it.

  Switched to jiti's per-call `{ default: true }` option, which does work on `jiti.import()`. Added an integration test that exercises real jiti against a real temp `stash.config.ts` so future regressions get caught — the previous mocked test was passing the bug straight through.

  This bug surfaced after `db install` started loading `stash.config.ts` (during the onboarding overhaul), but affected every other command that reads the config.

## 0.9.0

### Minor Changes

- 5d3eb13: Reduce friction in `stash init`.

  - **No more "How will you connect to your database?" prompt.** Init now auto-detects Drizzle (from `drizzle.config.*` or `drizzle-orm`/`drizzle-kit` in `package.json`) and Supabase (from the host in `DATABASE_URL`), and silently picks the matching encryption client template. Falls back to a generic Postgres template otherwise.
  - **No more "Where should we create your encryption client?" prompt.** Init writes to `./src/encryption/index.ts` by default. The "file already exists, what would you like to do?" prompt still appears so existing client files aren't silently overwritten.
  - **Single combined dependency-install prompt.** Previously init asked twice (once for `@cipherstash/stack`, once for `@cipherstash/cli`). It now asks once, listing both, and runs the installs in sequence. When both packages are already in `node_modules`, no prompt appears at all.
  - **Already-authenticated users skip the "Continue with workspace X?" prompt.** Init logs `Using workspace X` and proceeds. Run `stash auth login` directly to switch workspaces.

  `stash db install` now also calls into the same encryption-client scaffolder as a safety net — users who run `db install` without `init` first still get a working client file generated at the path their `stash.config.ts` points to.

- 5d3eb13: **Breaking:** the `stash wizard` command has been removed. The AI-guided encryption setup is now its own package — run it via `npx @cipherstash/wizard` (or `pnpm dlx`, `bunx`, `yarn dlx`).

  The wizard was pulling `@anthropic-ai/claude-agent-sdk` (47MB unpacked) into every `npx @cipherstash/cli` invocation, even for fast commands like `init`, `auth`, and `db install`. Splitting it out keeps cli's dependency tree small and lets each package manager handle the wizard's install natively — no more shelling out to `npm` from inside the cli, no Yarn PnP / Bun-only failure modes.

  The next-steps output from `init` and `db install` still recommends `npx @cipherstash/wizard` as the automated path. The `schema build` command no longer offers a wizard/builder selection prompt — it goes straight to the schema builder.

## 0.8.0

### Minor Changes

- 34432e9: Added --migration and --direct options to Supabase EQL install steps

## 0.7.1

### Patch Changes

- a0760f6: Detect the package manager from `npm_config_user_agent` when running `stash init`. Running `bunx @cipherstash/cli init`, `pnpm dlx @cipherstash/cli init`, or `yarn dlx @cipherstash/cli init` now uses the invoking tool for dependency installation (`bun add`, `pnpm add`, `yarn add`) instead of falling back to `npm install`. Lockfile detection is still preferred when present, so projects with an existing convention are unaffected. Fixes `EUNSUPPORTEDPROTOCOL` failures on `workspace:*` deps in Bun-managed projects.

## 0.7.0

### Minor Changes

- 7f5a05a: Fixed issue where the wizard was checking CipherStash auth based on path and now leverages the auth npm package.

## 0.6.1

### Patch Changes

- 8513705: Fix mangled `eql_v2_encrypted` type in drizzle-kit migrations.

  - `@cipherstash/stack/drizzle`'s `encryptedType` now returns the bare `eql_v2_encrypted` identifier from its Drizzle `customType.dataType()` callback. Returning the schema-qualified `"public"."eql_v2_encrypted"` (0.15.0) triggered a drizzle-kit quirk that wraps the return value in double-quotes and prepends `"{typeSchema}".` in ALTER COLUMN output — producing `"undefined".""public"."eql_v2_encrypted""`, which Postgres cannot parse.
  - `stash db install` / `stash wizard`'s migration rewriter now matches all four forms drizzle-kit may emit (`eql_v2_encrypted`, `"public"."eql_v2_encrypted"`, `"undefined"."eql_v2_encrypted"`, `"undefined".""public"."eql_v2_encrypted""`) and rewrites each into the safe `ADD COLUMN … DROP COLUMN … RENAME COLUMN` sequence.

  Users on 0.15.0 who hit this in generated migrations should upgrade and re-run `npx drizzle-kit generate` + `stash db install` (or re-run the wizard).

## 0.6.0

### Minor Changes

- 9944a25: Update cipherstash auth to 0.36.0

## 0.5.0

### Minor Changes

- 1929c8f: Mark secrets as a coming soon feature and remove existing SDK integration.

## 0.4.0

### Minor Changes

- 1e0d4c1: Support CipherStash rebrand with new docs links.

## 0.3.0

### Minor Changes

- 0d21e9b: Fix invalid client error.

## 0.2.0

### Minor Changes

- 4d0dfc5: Fixed peer dependency by lazy loading commands requiring @cipherstash/stack.

## 0.1.0

### Minor Changes

- 068f820: Release the consolidated CipherStash CLI npm package.

> Renamed from `@cipherstash/stack-forge`. The standalone `@cipherstash/wizard` package was absorbed into this CLI as `npx @cipherstash/cli wizard`. The single binary is now invoked via `npx @cipherstash/cli` (replaces `stash-forge` and `cipherstash-wizard`).

## 0.4.0

### Minor Changes

- 5245cd7: Improved CLI setup and initialization commands.

## 0.3.0

### Minor Changes

- 6f27ec3: Improve CLI user experience for developer onboarding.

## 0.2.0

### Minor Changes

- 3414761: Add additional CLI tools for validate, status, init. Fixed push command to work with CipherStash Proxy.

## 0.1.0

### Minor Changes

- 60ce44a: Initial release of the `stash-forge` CLI utility.
