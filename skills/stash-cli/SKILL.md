---
name: stash-cli
description: Configure and use the `@cipherstash/cli` package for project initialization, EQL database setup, encryption schema management, and Supabase integration. Replaces the legacy `@cipherstash/stack-forge` skill. The AI wizard is now a separate package (`@cipherstash/wizard`).
---

# CipherStash CLI

Configure and use `@cipherstash/cli` for project initialization, EQL database setup, encryption schema management, and Supabase integration. Previously published as `@cipherstash/stack-forge`; the `stash-forge` binary is now consolidated under `npx @cipherstash/cli`. The AI-powered wizard formerly bundled here lives in [`@cipherstash/wizard`](https://www.npmjs.com/package/@cipherstash/wizard).

## Trigger

Use this skill when:
- The user asks about setting up CipherStash EQL in a database
- Code imports `@cipherstash/cli` (or legacy `@cipherstash/stack-forge`)
- A `stash.config.ts` file exists or needs to be created
- The user wants to install, configure, or manage the EQL extension in PostgreSQL
- The user mentions "stash CLI", "stash db", "stack-forge", "stash-forge", "EQL install", or "encryption schema"

Do NOT trigger when:
- The user is working with `@cipherstash/stack` (the runtime SDK) without needing database setup
- The user is running the AI wizard — that's `@cipherstash/wizard`, a separate package
- General PostgreSQL questions unrelated to CipherStash

## What is @cipherstash/cli?

`@cipherstash/cli` is a **dev-time CLI and TypeScript library** for managing CipherStash EQL (Encrypted Query Language) in PostgreSQL databases. It is a companion to the `@cipherstash/stack` runtime SDK — it handles project setup and database tooling during development while `@cipherstash/stack` handles runtime encryption/decryption operations.

Think of it like Prisma Migrate or Drizzle Kit: a dev-time tool that prepares your database while the runtime SDK handles queries.

The binary is named `stash`. Top-level commands: `init`, `auth`, `db`, `schema`, `env`.

## Configuration

### 1. Create `stash.config.ts` in the project root

```typescript
import { defineConfig } from '@cipherstash/cli'

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

The primary interface is the `@cipherstash/cli` package, run via `npx` (or your package manager's equivalent runner):

```bash
npx @cipherstash/cli <command> [options]
```

### `init` — Initialize CipherStash for your project

```bash
npx @cipherstash/cli init
npx @cipherstash/cli init --supabase
npx @cipherstash/cli init --drizzle
```

Init runs nearly silently, with prompts only when it can't make a sensible default choice:

1. **Authenticate** — only prompts when not already logged in (otherwise logs `Using workspace X (region)` and proceeds).
2. **Generate encryption client** — auto-detects your framework (Drizzle from `drizzle.config.*` / `drizzle-orm` / `drizzle-kit` in `package.json`; Supabase from the `DATABASE_URL` host) and silently writes a placeholder client to `./src/encryption/index.ts`. Only prompts you if a file already exists at that path.
3. **Install dependencies** — single combined prompt for `@cipherstash/stack` and `@cipherstash/cli`. Skipped entirely when both are already in `node_modules`.
4. **Print next steps** — points you at `db install` and the optional `@cipherstash/wizard` for AI-guided setup.

The `--supabase` and `--drizzle` flags tailor the intro message and next-steps output. They don't drive prompts — file scaffolding uses the same auto-detection regardless.

### `auth login` — Authenticate with CipherStash

```bash
npx @cipherstash/cli auth login
```

Opens a browser-based device code flow and saves a token to `~/.cipherstash/auth.json`. Database-touching commands check for this file before running.

### `db install` — Configure the database and install EQL extensions

```bash
npx @cipherstash/cli db install
npx @cipherstash/cli db install --supabase
npx @cipherstash/cli db install --supabase --migration
npx @cipherstash/cli db install --supabase --direct
npx @cipherstash/cli db install --drizzle
npx @cipherstash/cli db install --force
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
npx @cipherstash/cli db upgrade
npx @cipherstash/cli db upgrade --dry-run
npx @cipherstash/cli db upgrade --supabase
npx @cipherstash/cli db upgrade --latest
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
npx @cipherstash/cli db validate
npx @cipherstash/cli db validate --supabase
npx @cipherstash/cli db validate --exclude-operator-family
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
npx @cipherstash/cli db push
npx @cipherstash/cli db push --dry-run
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
npx @cipherstash/cli db status
```

Reports:
- Whether EQL is installed and which version.
- Database permission status.
- Whether an active encrypt config exists in `eql_v2_configuration` (only relevant for CipherStash Proxy).

### `db test-connection` — Test database connectivity

```bash
npx @cipherstash/cli db test-connection
```

Verifies the database URL in your config is valid and the database is reachable. Reports the database name, connected role, and PostgreSQL server version. Useful for debugging connection issues before running `db install`.

### `db migrate` — Run pending encrypt config migrations

```bash
npx @cipherstash/cli db migrate
```

Not yet implemented — placeholder for future encrypt-config migration tooling.

### `schema build` — Generate an encryption client from your database

```bash
npx @cipherstash/cli schema build
npx @cipherstash/cli schema build --supabase
```

Connects to your database, lets you select tables and columns to encrypt, asks about searchable indexes, and generates a typed encryption client file. Reads `databaseUrl` from `stash.config.ts`.

For AI-guided schema integration that edits your existing schema files in place, run `npx @cipherstash/wizard` instead — it's a separate package designed for that workflow.

### `env` — Print production env vars for deployment

```bash
npx @cipherstash/cli env
npx @cipherstash/cli env --write
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
import { loadBundledEqlSql } from '@cipherstash/cli'

const sql = loadBundledEqlSql()                                // standard
const sql = loadBundledEqlSql({ supabase: true })              // supabase variant
const sql = loadBundledEqlSql({ excludeOperatorFamily: true }) // no operator family
```

### `downloadEqlSql(excludeOperatorFamily?): Promise<string>`

Download the latest EQL install SQL from GitHub releases.

### `EQLInstaller`

```typescript
import { EQLInstaller } from '@cipherstash/cli'

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
import { EQLInstaller, loadStashConfig } from '@cipherstash/cli'

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

`stash.config.ts` must be in the project root or a parent directory. The file must `export default defineConfig(...)`. Or run `npx @cipherstash/cli db install` to scaffold it.

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
