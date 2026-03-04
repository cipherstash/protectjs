# @cipherstash/stack-forge

Configure and use `@cipherstash/stack-forge` for EQL database setup, encryption schema management, and Supabase integration.

## Trigger

Use this skill when:
- The user asks about setting up CipherStash EQL in a database
- Code imports `@cipherstash/stack-forge` or references `stash-forge`
- A `stash.config.ts` file exists or needs to be created
- The user wants to install, configure, or manage the EQL extension in PostgreSQL
- The user mentions "stack-forge", "stash-forge", "EQL install", or "encryption schema"

Do NOT trigger when:
- The user is working with `@cipherstash/stack` (the runtime SDK) without needing database setup
- General PostgreSQL questions unrelated to CipherStash

## What is @cipherstash/stack-forge?

`@cipherstash/stack-forge` is a **dev-time CLI and TypeScript library** for managing CipherStash EQL (Encrypted Query Language) in PostgreSQL databases. It is a companion to the `@cipherstash/stack` runtime SDK — it handles database setup during development while `@cipherstash/stack` handles runtime encryption/decryption operations.

Think of it like Prisma Migrate or Drizzle Kit: a dev-time tool that manages your database schema.

## Configuration

### 1. Create `stash.config.ts` in the project root

```typescript
import { defineConfig } from '@cipherstash/stack-forge'

export default defineConfig({
  databaseUrl: process.env.DATABASE_URL!,
})
```

### Config options

```typescript
type StashConfig = {
  databaseUrl: string          // Required: PostgreSQL connection string
  workspaceId?: string         // Optional: CipherStash workspace ID
  clientAccessKey?: string     // Optional: CipherStash client access key
}
```

- `defineConfig()` provides TypeScript type-checking for the config file.
- Config is loaded automatically from `stash.config.ts` by walking up from `process.cwd()` (like `tsconfig.json` resolution).
- `.env` files are loaded automatically via `dotenv` before config evaluation.

## CLI Usage

The primary interface is the `stash-forge` CLI, run via `npx`:

```bash
npx stash-forge <command> [options]
```

### `install` — Install EQL extension to the database

```bash
# Standard install
npx stash-forge install

# Reinstall even if already installed
npx stash-forge install --force

# Preview SQL without applying
npx stash-forge install --dry-run

# Supabase-compatible install (grants anon, authenticated, service_role)
npx stash-forge install --supabase

# Skip operator family (for non-superuser database roles)
npx stash-forge install --exclude-operator-family

# Combine flags
npx stash-forge install --dry-run --supabase
```

**Flags:**
| Flag | Description |
|------|-------------|
| `--force` | Reinstall even if EQL is already installed |
| `--dry-run` | Print the SQL that would be executed without applying it |
| `--supabase` | Use Supabase-compatible install (no operator family + grants to Supabase roles) |
| `--exclude-operator-family` | Skip operator family creation (useful for non-superuser roles) |

### Other commands (planned, not yet implemented)

- `init` — Initialize CipherStash Forge in your project
- `push` — Push encryption schema to database
- `migrate` — Run pending EQL migrations
- `status` — Show EQL installation status

## Programmatic API

### `defineConfig(config: StashConfig): StashConfig`

Identity function that provides type-safe configuration for `stash.config.ts`.

### `loadStashConfig(): Promise<StashConfig>`

Finds and loads `stash.config.ts` from the current directory or any parent. Validates with Zod. Exits with code 1 if config is missing or invalid.

### `EQLInstaller`

```typescript
import { EQLInstaller } from '@cipherstash/stack-forge'

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

Downloads and executes the EQL install SQL in a transaction.

```typescript
await installer.install({
  excludeOperatorFamily?: boolean  // Skip operator family creation
  supabase?: boolean               // Use Supabase-compatible install + grant roles
})
```

## Full programmatic example

```typescript
import { EQLInstaller, loadStashConfig } from '@cipherstash/stack-forge'

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

## Common issues

### Permission errors during install
The database role needs `CREATE` privileges on the database and public schema, or `SUPERUSER`. Run `checkPermissions()` or check the CLI output for details on what's missing.

### Config not found
`stash.config.ts` must be in the project root or a parent directory. The file must `export default defineConfig(...)`.

### Supabase environments
Always use `--supabase` (or `supabase: true` programmatically) when targeting Supabase. This uses a compatible install script and grants permissions to `anon`, `authenticated`, and `service_role` roles.
