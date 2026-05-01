---
'@cipherstash/cli': minor
---

Layered `DATABASE_URL` resolution for DB / schema commands.

Previously, any DB-touching command (`db install`, `db push`, `db upgrade`, `db status`, `db validate`, `db test-connection`, `schema build`) failed with the cryptic Zod error:

```
Error: Invalid stash.config.ts
  - databaseUrl: Invalid input: expected nonoptional, received undefined
```

if `DATABASE_URL` wasn't already in the environment. The CLI auto-loaded `.env.local` / `.env.development.local` / `.env.development` / `.env`, but had no story for `--database-url` flags, local Supabase, or pasted-once values.

The scaffolded `stash.config.ts` now calls a resolver directly:

```ts
import { defineConfig, resolveDatabaseUrl } from '@cipherstash/cli'

export default defineConfig({
  databaseUrl: await resolveDatabaseUrl(),
  client: './src/encryption/index.ts',
})
```

`resolveDatabaseUrl()` walks sources in order; first hit wins:

1. `--database-url <url>` flag — new, accepted on all seven DB / schema commands. Used for this run only; never written to disk.
2. `process.env.DATABASE_URL` — covers shell exports, mise, direnv, dotenv-cli, the existing dotenv loads.
3. `supabase status --output env` → `DB_URL` — auto-engaged when `--supabase` is set or a `supabase/config.toml` is detected. Useful for local Supabase users who haven't exported the URL yet.
4. Interactive prompt — opens with a tip listing the alternatives (flag, env, the user's actual dotenv file). Skipped under `CI=true` or non-TTY stdin.
5. Hard fail with a source-naming error message.

The connection string is **never persisted to disk** — `stash.config.ts` only contains the `await resolveDatabaseUrl()` call, never a literal URL. The resolver also doesn't mutate `process.env`; CLI flag context is threaded into the config evaluation via `AsyncLocalStorage` so concurrent loads stay isolated. Source labels are logged on non-env paths (`Using DATABASE_URL from --database-url flag` / `from supabase status` / `from prompt`) but the URL itself is never echoed.

`db test-connection`'s connection-failure hint is now source-aware: it points users at `--database-url`, the env var, and the actual dotenv file in their project (`.env.local` if present, `.env` otherwise) — not the misleading `stash.config.ts` it used to suggest.
