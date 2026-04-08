---
name: stash-cli
description: Configure and use the `@cipherstash/cli` package (the `stash` binary) for EQL database setup, encryption schema management, Supabase integration, and the AI-powered `stash wizard`. Replaces the legacy `@cipherstash/stack-forge` skill.
---

# CipherStash CLI

Configure and use `@cipherstash/cli` for EQL database setup, encryption schema management, and Supabase integration. (Previously published as `@cipherstash/stack-forge`; the `stash-forge` and `cipherstash-wizard` binaries are now consolidated under a single `stash` binary.)

## Trigger

Use this skill when:
- The user asks about setting up CipherStash EQL in a database
- Code imports `@cipherstash/cli` (or legacy `@cipherstash/stack-forge`)
- A `stash.config.ts` file exists or needs to be created
- The user wants to install, configure, or manage the EQL extension in PostgreSQL
- The user mentions "stash CLI", "stash db", "stack-forge", "stash-forge", "EQL install", or "encryption schema"

Do NOT trigger when:
- The user is working with `@cipherstash/stack` (the runtime SDK) without needing database setup
- General PostgreSQL questions unrelated to CipherStash

## What is @cipherstash/cli?

`@cipherstash/cli` is a **dev-time CLI and TypeScript library** for managing CipherStash EQL (Encrypted Query Language) in PostgreSQL databases. It is a companion to the `@cipherstash/stack` runtime SDK — it handles database setup during development while `@cipherstash/stack` handles runtime encryption/decryption operations.

Think of it like Prisma Migrate or Drizzle Kit: a dev-time tool that manages your database schema.

## Configuration

### 1. Create `stash.config.ts` in the project root

```typescript
import { defineConfig } from '@cipherstash/cli'

export default defineConfig({
  databaseUrl: process.env.DATABASE_URL!,
  client: './src/encryption/index.ts',
})
```

### Config options

```typescript
type StashConfig = {
  databaseUrl: string          // Required: PostgreSQL connection string
  client?: string              // Optional: path to encryption client (default: './src/encryption/index.ts')
}
```

- `defineConfig()` provides TypeScript type-checking for the config file.
- `client` points to the encryption client file used by `stash db push` and `stash db validate` to load the encryption schema.
- Config is loaded automatically from `stash.config.ts` by walking up from `process.cwd()` (like `tsconfig.json` resolution).
- `.env` files are loaded automatically via `dotenv` before config evaluation.

## CLI Usage

The primary interface is the `stash` CLI, run via `npx`:

```bash
npx stash db <command> [options]
```

### `setup` — Configure database and install EQL extensions

Interactive wizard that configures your database connection and installs EQL. Run this after `stash init` has set up your encryption schema.

```bash
npx stash db setup
npx stash db setup --supabase
npx stash db setup --force
npx stash db setup --drizzle
```

The wizard will:
1. Auto-detect the encryption client file by scanning common locations (`./src/encryption/index.ts`, etc.), then confirm or ask for the path
2. Ask for the database URL (pre-fills from `DATABASE_URL` env var if set)
3. Generate `stash.config.ts` with the database URL and client path
4. Ask to install EQL extensions now
5. If installing, ask which Postgres provider is being used to determine the right install flags:
   - **Supabase** — uses `--supabase` (no operator families + Supabase role grants)
   - **Neon, Vercel Postgres, PlanetScale, Prisma Postgres** — uses `--exclude-operator-family`
   - **AWS RDS, Other / Self-hosted** — standard install
6. Install EQL extensions in the database

If `--supabase` is passed as a flag, the provider selection is skipped.

**Flags:**
| Flag | Description |
|------|-------------|
| `--force` | Overwrite existing `stash.config.ts` and reinstall EQL |
| `--dry-run` | Show what would happen without making changes |
| `--supabase` | Skip provider selection and use Supabase-compatible install |
| `--drizzle` | Generate a Drizzle migration instead of direct install |
| `--exclude-operator-family` | Skip operator family creation |
| `--latest` | Fetch the latest EQL from GitHub instead of using the bundled version |

### `install` — Install EQL extension to the database

Uses bundled SQL by default for offline, deterministic installs. Three SQL variants are bundled:
- `cipherstash-encrypt.sql` — standard install (default)
- `cipherstash-encrypt-supabase.sql` — Supabase-specific variant
- `cipherstash-encrypt-no-operator-family.sql` — no operator family variant

```bash
# Standard install
npx stash db install

# Reinstall even if already installed
npx stash db install --force

# Preview SQL without applying
npx stash db install --dry-run

# Supabase-compatible install (grants anon, authenticated, service_role)
npx stash db install --supabase

# Skip operator family (for non-superuser database roles)
npx stash db install --exclude-operator-family

# Fetch latest from GitHub instead of using bundled SQL
npx stash db install --latest

# Generate a Drizzle migration instead of direct install
npx stash db install --drizzle

# Drizzle migration with custom name and output directory
npx stash db install --drizzle --name setup-eql --out ./migrations

# Combine flags
npx stash db install --dry-run --supabase
```

**Flags:**
| Flag | Description |
|------|-------------|
| `--force` | Reinstall even if EQL is already installed |
| `--dry-run` | Print the SQL that would be executed without applying it |
| `--supabase` | Use Supabase-compatible install (no operator family + grants to Supabase roles) |
| `--exclude-operator-family` | Skip operator family creation (useful for non-superuser roles) |
| `--latest` | Fetch latest EQL from GitHub instead of using the bundled version |
| `--drizzle` | Generate a Drizzle migration instead of direct install |
| `--name <value>` | Migration name when using `--drizzle` (default: `install-eql`) |
| `--out <value>` | Drizzle output directory when using `--drizzle` (default: `drizzle`) |

#### `install --drizzle`

When `--drizzle` is passed, instead of connecting to the database directly, the CLI:
1. Runs `drizzle-kit generate --custom --name=<name>` to scaffold an empty migration
2. Loads the bundled EQL install SQL (or downloads from GitHub with `--latest`)
3. Writes the SQL into the generated migration file

You then run `npx drizzle-kit migrate` to apply it. Requires `drizzle-kit` as a dev dependency.

### `upgrade` — Upgrade EQL extensions

Upgrade an existing EQL installation to the version bundled with the package (or latest from GitHub).

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

The EQL install SQL is idempotent and safe to re-run. The command checks the current version, re-runs the install SQL, then reports the new version. If EQL is not installed, it suggests running `stash db install` instead.

### `validate` — Validate encryption schema

Validate your encryption schema for common misconfigurations.

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

Validation is also automatically run before `push` — issues are logged as warnings but don't block the push.

The `validateEncryptConfig` function and `reportIssues` helper are exported for programmatic use:

```typescript
import { validateEncryptConfig, reportIssues } from '@cipherstash/cli'
```

### `push` — Push encryption schema to database (CipherStash Proxy only)

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
1. Loads the encryption client from the path in `stash.config.ts`
2. Runs schema validation (warns but doesn't block)
3. Transforms SDK data types to EQL-compatible `cast_as` values (see table below)
4. Connects to Postgres and marks existing `eql_v2_configuration` rows as `inactive`
5. Inserts the new config as an `active` row

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

### `status` — Show EQL installation status

```bash
npx stash db status
```

Reports:
- Whether EQL is installed and which version
- Database permission status
- Whether an active encrypt config exists in `eql_v2_configuration` (only relevant for CipherStash Proxy)

### `test-connection` — Test database connectivity

```bash
npx stash db test-connection
```

Verifies the database URL in your config is valid and the database is reachable. Reports:
- Database name
- Connected user/role
- PostgreSQL server version

Useful for debugging connection issues before running `install` or other commands.

## Programmatic API

### `defineConfig(config: StashConfig): StashConfig`

Identity function that provides type-safe configuration for `stash.config.ts`.

### `loadStashConfig(): Promise<ResolvedStashConfig>`

Finds and loads `stash.config.ts` from the current directory or any parent. Validates with Zod. Applies defaults (e.g. `client` defaults to `'./src/encryption/index.ts'`). Exits with code 1 if config is missing or invalid.

### `loadEncryptConfig(clientPath: string): Promise<EncryptConfig | undefined>`

Loads the encryption client file, extracts the encrypt config, and returns it. Used by `push` and `validate` to build the schema JSON.

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
- `CREATE` privilege on database + `CREATE` privilege on public schema
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
- A `stash.config.ts` file with a valid `databaseUrl`
- Peer dependency: `@cipherstash/stack` >= 0.6.0

## Common issues

### Permission errors during install
The database role needs `CREATE` privileges on the database and public schema, or `SUPERUSER`. Run `checkPermissions()` or check the CLI output for details on what's missing.

### Config not found
`stash.config.ts` must be in the project root or a parent directory. The file must `export default defineConfig(...)`.

### Supabase environments
Always use `--supabase` (or `supabase: true` programmatically) when targeting Supabase. This uses a compatible install script and grants permissions to `anon`, `authenticated`, and `service_role` roles.

### Operator families and ORDER BY

When EQL is installed with `--supabase` or `--exclude-operator-family`, PostgreSQL operator families are not created. This means `ORDER BY` on encrypted columns is **not currently supported** — regardless of the client or ORM used (Drizzle, Supabase JS SDK, raw SQL, etc.).

Sort application-side after decrypting the results as a workaround.

Operator family support for Supabase is being developed with the Supabase and CipherStash teams and will be available in a future release. This limitation applies to any database environment where operator families are not installed.
