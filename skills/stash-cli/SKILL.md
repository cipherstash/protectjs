---
name: stash-cli
description: Configure and use the `stash` package for project initialization, EQL database setup, encryption schema management, and Supabase integration. Replaces the legacy `@cipherstash/stack-forge` skill. The AI wizard is now a separate package (`@cipherstash/wizard`).
---

# CipherStash CLI

Configure and use `stash` for project initialization, EQL database setup, encryption schema management, and Supabase integration. Previously published as `@cipherstash/stack-forge`; the `stash-forge` binary is now consolidated under `npx stash`. The AI-powered wizard formerly bundled here lives in [`@cipherstash/wizard`](https://www.npmjs.com/package/@cipherstash/wizard).

## Trigger

Use this skill when:
- The user asks about setting up CipherStash EQL in a database
- Code imports `stash` (or legacy `@cipherstash/stack-forge`)
- A `stash.config.ts` file exists or needs to be created
- The user wants to install, configure, or manage the EQL extension in PostgreSQL
- The user mentions "stash CLI", "stash db", "stack-forge", "stash-forge", "EQL install", or "encryption schema"

Do NOT trigger when:
- The user is working with `@cipherstash/stack` (the runtime SDK) without needing database setup
- The user is running the AI wizard — that's `@cipherstash/wizard`, a separate package
- General PostgreSQL questions unrelated to CipherStash

## What is stash?

`stash` is a **dev-time CLI and TypeScript library** for managing CipherStash EQL (Encrypted Query Language) in PostgreSQL databases. It is a companion to the `@cipherstash/stack` runtime SDK — it handles project setup and database tooling during development while `@cipherstash/stack` handles runtime encryption/decryption operations.

Think of it like Prisma Migrate or Drizzle Kit: a dev-time tool that prepares your database while the runtime SDK handles queries.

The binary is named `stash`. Top-level commands: `init`, `auth`, `db`, `schema`, `env`.

## Configuration

### 1. Create `stash.config.ts` in the project root

```typescript
import { defineConfig } from 'stash'

export default defineConfig({
  databaseUrl: process.env.DATABASE_URL!,
  client: './src/encryption/index.ts',
})
```

`db install` will scaffold this file for you if it's missing.

### Config options

```typescript
type StashConfig = {
  databaseUrl: string          // Required: PostgreSQL connection string
  client?: string              // Optional: path to encryption client (default: './src/encryption/index.ts')
}
```

- `defineConfig()` provides TypeScript type-checking for the config file.
- `client` points to the encryption client file used by `db push` and `db validate` to load the encryption schema.
- Config is loaded automatically from `stash.config.ts` by walking up from `process.cwd()` (like `tsconfig.json` resolution).
- `.env` files are loaded automatically via `dotenv` before config evaluation.

## CLI Usage

The primary interface is the `stash` package, run via `npx` (or your package manager's equivalent runner):

```bash
npx stash <command> [options]
```

### `init` — Initialize CipherStash for your project

```bash
npx stash init
npx stash init --supabase
npx stash init --drizzle
```

Init runs nearly silently, with prompts only when it can't make a sensible default choice:

1. **Authenticate** — only prompts when not already logged in (otherwise logs `Using workspace X (region)` and proceeds).
2. **Generate encryption client** — auto-detects your framework (Drizzle from `drizzle.config.*` / `drizzle-orm` / `drizzle-kit` in `package.json`; Supabase from the `DATABASE_URL` host) and silently writes a placeholder client to `./src/encryption/index.ts`. Only prompts you if a file already exists at that path.
3. **Install dependencies** — single combined prompt for `@cipherstash/stack` and `stash`. Skipped entirely when both are already in `node_modules`.
4. **Print next steps** — points you at `db install` and the optional `@cipherstash/wizard` for AI-guided setup.

The `--supabase` and `--drizzle` flags tailor the intro message and next-steps output. They don't drive prompts — file scaffolding uses the same auto-detection regardless.

### `auth login` — Authenticate with CipherStash

```bash
npx stash auth login
```

Opens a browser-based device code flow and saves a token to `~/.cipherstash/auth.json`. Database-touching commands check for this file before running.

### `db install` — Configure the database and install EQL extensions

```bash
npx stash db install
npx stash db install --supabase
npx stash db install --supabase --migration
npx stash db install --supabase --direct
npx stash db install --drizzle
npx stash db install --force
```

`db install` is the single command that gets a project from zero to installed EQL:

1. Scaffolds `stash.config.ts` if missing (auto-detects an existing client file at common locations, otherwise prompts).
2. Loads the config.
3. **Safety net:** scaffolds the encryption client file at `config.client` if it doesn't exist (no-op when present). Lets users who skip `init` still end up with a working client file.
4. Detects Supabase (`DATABASE_URL` host) and Drizzle (lockfile / `drizzle-orm` dep) automatically.
5. For Drizzle: generates a Drizzle migration containing the EQL SQL (`drizzle-kit generate --custom --name=...`).
6. For Supabase non-Drizzle: prompts between writing a Supabase migration file and direct install. Pre-selects migration when `supabase/migrations/` exists.
7. Otherwise: installs EQL directly into the database.

**Flags:**

| Flag | Description |
|------|-------------|
| `--force` | Reinstall even if EQL is already installed |
| `--dry-run` | Show what would happen without making changes |
| `--supabase` | Supabase-compatible install (no operator families + grants `anon`, `authenticated`, `service_role`) |
| `--exclude-operator-family` | Skip operator family creation (useful for non-superuser roles) |
| `--drizzle` | Generate a Drizzle migration instead of direct install |
| `--latest` | Fetch latest EQL from GitHub instead of using the bundled version |
| `--name <value>` | Migration name when using `--drizzle` (default: `install-eql`) |
| `--out <value>` | Drizzle output directory when using `--drizzle` (default: `drizzle`) |
| `--migration` | Write the EQL SQL into a Supabase migration file (requires `--supabase`) |
| `--direct` | Run the EQL SQL directly against the database (requires `--supabase`; mutually exclusive with `--migration`) |
| `--migrations-dir <path>` | Override the Supabase migrations directory (requires `--supabase`; default: `supabase/migrations`) |

`--migration`, `--direct`, and `--migrations-dir` only make sense in the Supabase flow and require `--supabase` to be passed explicitly. They never auto-enable `--supabase`.

#### `db install --drizzle`

When `--drizzle` is passed, the CLI:
1. Runs `drizzle-kit generate --custom --name=<name>` to scaffold an empty migration.
2. Loads the bundled EQL install SQL (or downloads from GitHub with `--latest`).
3. Writes the SQL into the generated migration file.

You then run `npx drizzle-kit migrate` to apply it. Requires `drizzle-kit` as a dev dependency.

#### `db install --supabase --migration`

Writes the EQL SQL to `supabase/migrations/00000000000000_cipherstash_eql.sql`. The all-zero timestamp ensures this migration runs before any user migrations that reference `eql_v2_encrypted`. Run `supabase db reset` (local) or `supabase migration up` (remote) to apply it.

Direct-push installs (`--supabase --direct`) do **not** survive `supabase db reset` — the reset drops the database and reruns only files in `supabase/migrations/`. Use `--migration` for projects that use `supabase db reset`.

### `db upgrade` — Upgrade EQL extensions

```bash
npx stash db upgrade
npx stash db upgrade --dry-run
npx stash db upgrade --supabase
npx stash db upgrade --latest
```

**Flags:**

| Flag | Description |
|------|-------------|
| `--dry-run` | Show what would happen without making changes |
| `--supabase` | Use Supabase-compatible upgrade |
| `--exclude-operator-family` | Skip operator family creation |
| `--latest` | Fetch latest EQL from GitHub instead of bundled |

The EQL install SQL is idempotent and safe to re-run. The command checks the current version, re-runs the install SQL, then reports the new version. If EQL is not installed, it suggests running `db install` instead.

### `db validate` — Validate encryption schema

```bash
npx stash db validate
npx stash db validate --supabase
npx stash db validate --exclude-operator-family
```

**Flags:**

| Flag | Description |
|------|-------------|
| `--supabase` | Check for Supabase-specific issues |
| `--exclude-operator-family` | Check for issues when operator families are excluded |

**Validation rules:**

| Rule | Severity | Description |
|------|----------|-------------|
| `freeTextSearch` on non-string column | Warning | Free-text search only works with string data |
| `orderAndRange` without operator families | Warning | ORDER BY won't work without operator families |
| No indexes on encrypted column | Info | Column is encrypted but not searchable |
| `searchableJson` without `json` data type | Error | searchableJson requires `dataType("json")` |

Validation also runs automatically before `db push` — issues are logged as warnings but don't block the push.

### `db push` — Push encryption schema to the database (CipherStash Proxy only)

This command is **only required when using CipherStash Proxy**. If you're using the SDK directly (Drizzle, Supabase, or plain PostgreSQL), this step is not needed — the schema lives in your application code as the source of truth.

```bash
npx stash db push
npx stash db push --dry-run
```

**Flags:**

| Flag | Description |
|------|-------------|
| `--dry-run` | Load and validate the schema, then print it as JSON. No database changes. |

When pushing, the CLI:
1. Loads the encryption client from the path in `stash.config.ts`.
2. Runs schema validation (warns but doesn't block).
3. Transforms SDK data types to EQL-compatible `cast_as` values (see table below).
4. Connects to Postgres and marks existing `eql_v2_configuration` rows as `inactive`.
5. Inserts the new config as an `active` row.

**SDK to EQL type mapping:**

| SDK type (`dataType()`) | EQL `cast_as` |
|-------------------------|---------------|
| `string` | `text` |
| `text` | `text` |
| `number` | `double` |
| `bigint` | `big_int` |
| `boolean` | `boolean` |
| `date` | `date` |
| `json` | `jsonb` |

### `db status` — Show EQL installation status

```bash
npx stash db status
```

Reports:
- Whether EQL is installed and which version.
- Database permission status.
- Whether an active encrypt config exists in `eql_v2_configuration` (only relevant for CipherStash Proxy).

### `db test-connection` — Test database connectivity

```bash
npx stash db test-connection
```

Verifies the database URL in your config is valid and the database is reachable. Reports the database name, connected role, and PostgreSQL server version. Useful for debugging connection issues before running `db install`.

### `db migrate` — Run pending encrypt config migrations

```bash
npx stash db migrate
```

Not yet implemented — placeholder for future encrypt-config migration tooling.

### `encrypt` — Migrate plaintext columns to encrypted, in phases

The `encrypt` group orchestrates the column-encryption lifecycle:
`schema-added → dual-writing → backfilling → backfilled → cut-over → dropped`.
It drives the `@cipherstash/migrate` library, which records every transition in a `cipherstash.cs_migrations` table (installed by `stash db install`) and reads the user's intent from `.cipherstash/migrations.json`. See the `stash-encryption` skill for the lifecycle model itself; this section documents the CLI surface.

The examples below use `npx stash`. Substitute `bunx`, `pnpm dlx`, or `yarn dlx` (or run `stash` directly when it's installed as a project dev dep — `stash init` sets that up).

#### `encrypt status` — Show per-column phase, EQL state, and backfill progress

```bash
npx stash encrypt status
npx stash encrypt status --table users
```

Reads three sources in parallel — the `migrations.json` manifest (intent), the live `eql_v2_configuration` row (EQL state), and the latest `cs_migrations` event per column (runtime state) — and renders a table per column with phase, indexes, progress, and any drift between intent and observed state.

#### `encrypt plan` — Diff intent vs. observed state

```bash
npx stash encrypt plan
```

Like `status`, but explicitly lists what would change to reconcile observed state with `.cipherstash/migrations.json`. Read-only — does not mutate the DB or the manifest.

#### `encrypt advance --to <phase>` — Record a phase transition

```bash
npx stash encrypt advance --to dual-writing --table users --column email
npx stash encrypt advance --to backfilling  --table users --column email
```

Records that the user has moved a column to the named phase. Some phases (e.g. `dual-writing`) reflect application code state that the CLI can't safely auto-detect, so the user declares the transition explicitly. The command also surfaces a tailored prompt for editing the persistence code; if `.cipherstash/context.json` records a Claude / Codex handoff from `stash init`, it offers to spawn that agent with the prompt.

#### `encrypt backfill` — Resumably encrypt plaintext into the encrypted column

```bash
npx stash encrypt backfill --table users --column email
npx stash encrypt backfill --table users --column email --chunk-size 5000
npx stash encrypt backfill --resume
npx stash encrypt backfill --table users --column email --dry-run
```

Chunked, resumable, idempotent backfill. Walks the table in keyset-pagination order, encrypts each chunk via `bulkEncryptModels` from `@cipherstash/stack`, and writes a single `UPDATE ... FROM (VALUES ...)` per chunk inside a transaction that also checkpoints to `cs_migrations`. SIGINT/SIGTERM finishes the current chunk and exits cleanly; `--resume` picks up from the last checkpoint. The `<col> IS NOT NULL AND <col>_encrypted IS NULL` guard makes concurrent runners and re-runs safe — they converge.

Flags:

- `--table <name>` / `--column <name>` — required (or pass nothing to backfill every column the manifest marks `backfilling`).
- `--chunk-size <n>` — default 1000. Lower for lock contention, raise for wide rows.
- `--resume` — pick up from the last `backfill_checkpoint` event.
- `--dry-run` — sample one chunk and print timings; no writes.
- `--continue-on-error` — log row failures and keep going. Default is fail-fast.

#### `encrypt cutover` — Rename swap encrypted → primary column

```bash
npx stash encrypt cutover --table users --column email
```

For columns in the `backfilled` phase, runs `eql_v2.rename_encrypted_columns()` in a single transaction (renames `<col>` → `<col>_plaintext` and `<col>_encrypted` → `<col>`) and, if a Proxy URL is configured, calls `eql_v2.reload_config()` over that connection so the Proxy picks up the new shape immediately. App reads of `<col>` now return decrypted ciphertext transparently — no app code change required for reads.

#### `encrypt drop` — Generate a migration that removes the plaintext column

```bash
npx stash encrypt drop --table users --column email
```

For columns in the `cut_over` phase. Detects the user's migration tooling (Drizzle today; Prisma + raw-SQL planned) and emits a migration file containing `ALTER TABLE <table> DROP COLUMN <col>_plaintext;`. Does not apply the migration — the user reviews and runs their normal migrate command. Records the `dropped` event only after a follow-up `encrypt status` confirms the column is gone from `information_schema.columns`.

### `schema build` — Generate an encryption client from your database

```bash
npx stash schema build
npx stash schema build --supabase
```

Connects to your database, lets you select tables and columns to encrypt, asks about searchable indexes, and generates a typed encryption client file. Reads `databaseUrl` from `stash.config.ts`.

For AI-guided schema integration that edits your existing schema files in place, run `npx @cipherstash/wizard` instead — it's a separate package designed for that workflow.

### `env` — Print production env vars for deployment

```bash
npx stash env
npx stash env --write
```

Experimental. Prints the environment variables (`CS_*`) you need to deploy a CipherStash-backed app. With `--write`, writes them into a `.env.production` file.

## Programmatic API

### `defineConfig(config: StashConfig): StashConfig`

Identity function that provides type-safe configuration for `stash.config.ts`.

### `loadStashConfig(): Promise<ResolvedStashConfig>`

Finds and loads `stash.config.ts` from the current directory or any parent. Validates with Zod. Applies defaults (e.g. `client` defaults to `'./src/encryption/index.ts'`). Exits with code 1 if config is missing or invalid.

### `loadBundledEqlSql(options?): string`

Load the bundled EQL install SQL as a string:

```typescript
import { loadBundledEqlSql } from 'stash'

const sql = loadBundledEqlSql()                                // standard
const sql = loadBundledEqlSql({ supabase: true })              // supabase variant
const sql = loadBundledEqlSql({ excludeOperatorFamily: true }) // no operator family
```

### `downloadEqlSql(excludeOperatorFamily?): Promise<string>`

Download the latest EQL install SQL from GitHub releases.

### `EQLInstaller`

```typescript
import { EQLInstaller } from 'stash'

const installer = new EQLInstaller({ databaseUrl: 'postgresql://...' })
```

#### `installer.checkPermissions(): Promise<PermissionCheckResult>`

Checks that the database role has the required permissions to install EQL.

```typescript
type PermissionCheckResult = {
  ok: boolean       // true if all permissions are present
  missing: string[] // list of missing permissions (empty if ok)
}
```

Required permissions (one of):
- `SUPERUSER` role (sufficient for everything), OR
- `CREATE` privilege on database + `CREATE` privilege on `public` schema
- If `pgcrypto` is not installed: also needs `SUPERUSER` or `CREATEDB`

#### `installer.isInstalled(): Promise<boolean>`

Returns `true` if the `eql_v2` schema exists in the database.

#### `installer.getInstalledVersion(): Promise<string | null>`

Returns the installed EQL version string, `'unknown'` if schema exists but no version metadata, or `null` if not installed.

#### `installer.install(options?): Promise<void>`

Executes the EQL install SQL in a transaction.

```typescript
await installer.install({
  excludeOperatorFamily?: boolean  // Skip operator family creation
  supabase?: boolean               // Use Supabase-compatible install + grant roles
  latest?: boolean                 // Fetch latest from GitHub instead of bundled
})
```

## Full programmatic example

```typescript
import { EQLInstaller, loadStashConfig } from 'stash'

const config = await loadStashConfig()
const installer = new EQLInstaller({ databaseUrl: config.databaseUrl })

// Check permissions first
const permissions = await installer.checkPermissions()
if (!permissions.ok) {
  console.error('Missing permissions:', permissions.missing)
  process.exit(1)
}

// Install if not already present
if (await installer.isInstalled()) {
  const version = await installer.getInstalledVersion()
  console.log(`EQL already installed (version: ${version})`)
} else {
  await installer.install()
  console.log('EQL installed successfully')
}
```

## Requirements

- Node.js >= 22
- PostgreSQL database with sufficient permissions (see `checkPermissions()`)
- A `stash.config.ts` file with a valid `databaseUrl` (or run `db install` to scaffold it)
- Peer dependency: `@cipherstash/stack` >= 0.6.0

## Common issues

### Permission errors during install

The database role needs `CREATE` privileges on the database and public schema, or `SUPERUSER`. Run `checkPermissions()` or check the CLI output for details on what's missing.

### Config not found

`stash.config.ts` must be in the project root or a parent directory. The file must `export default defineConfig(...)`. Or run `npx stash db install` to scaffold it.

### Supabase environments

Always use `--supabase` (or `supabase: true` programmatically) when targeting Supabase. This uses a compatible install script and grants permissions to `anon`, `authenticated`, and `service_role` roles.

### Operator families and ORDER BY

When EQL is installed with `--supabase` or `--exclude-operator-family`, PostgreSQL operator families are not created. This means `ORDER BY` on encrypted columns is **not currently supported** — regardless of the client or ORM used (Drizzle, Supabase JS SDK, raw SQL, etc.).

Sort application-side after decrypting the results as a workaround.

Operator family support for Supabase is being developed with the Supabase and CipherStash teams and will be available in a future release. This limitation applies to any database environment where operator families are not installed.

## Related skills

- **`@cipherstash/wizard`** — AI-guided encryption setup. Reads your codebase, asks which columns to encrypt, edits your schema and call sites in place. Run with `npx @cipherstash/wizard`. Separate package from this CLI.
- **`stash-encryption`** — Defines encrypted schemas and uses `Encryption()` / `encryptModel` / `decryptModel` at runtime via `@cipherstash/stack`.
- **`stash-drizzle`** / **`stash-supabase`** — Drizzle and Supabase integrations.
