# @cipherstash/stack-forge

Dev-time CLI and library for managing [CipherStash EQL](https://github.com/cipherstash/encrypt-query-language) (Encrypted Query Language) in your PostgreSQL database.

[![npm version](https://img.shields.io/npm/v/@cipherstash/stack-forge.svg?style=for-the-badge&labelColor=000000)](https://www.npmjs.com/package/@cipherstash/stack-forge)
[![License: MIT](https://img.shields.io/npm/l/@cipherstash/stack-forge.svg?style=for-the-badge&labelColor=000000)](https://github.com/cipherstash/protectjs/blob/main/LICENSE.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-first-blue?style=for-the-badge&labelColor=000000)](https://www.typescriptlang.org/)

---

## Why stack-forge?

`@cipherstash/stack` is the runtime encryption SDK — it should stay lean and free of heavy dependencies like `pg`. `@cipherstash/stack-forge` is a **devDependency** that handles database tooling: installing EQL extensions, checking permissions, validating schemas, and managing schema lifecycle.

Think of it like Prisma or Drizzle Kit — a companion CLI that sets up the database while the main SDK handles runtime operations.

## Install

```bash
npm install -D @cipherstash/stack-forge
```

Or with your preferred package manager:

```bash
pnpm add -D @cipherstash/stack-forge
yarn add -D @cipherstash/stack-forge
bun add -D @cipherstash/stack-forge
```

## Quick Start

First, initialize your project with the `stash` CLI (from `@cipherstash/stack`):

```bash
npx stash init
```

This generates your encryption schema and installs `@cipherstash/stack-forge` as a dev dependency.

Then set up your database and install EQL:

```bash
npx stash-forge setup
```

This will:
1. Auto-detect your encryption client file (or ask for the path)
2. Ask for your database URL
3. Generate `stash.config.ts`
4. Ask which Postgres provider you're using (Supabase, Neon, AWS RDS, etc.) to determine the right install flags
5. Install EQL extensions in your database

That's it. EQL is now installed and your encryption schema is ready.

### Manual setup

If you prefer to set things up manually:

#### 1. Create a config file

Create `stash.config.ts` in your project root:

```typescript
import { defineConfig } from '@cipherstash/stack-forge'

export default defineConfig({
  databaseUrl: process.env.DATABASE_URL!,
  client: './src/encryption/index.ts',
})
```

#### 2. Add a `.env` file

```env
DATABASE_URL=postgresql://user:password@localhost:5432/mydb
```

#### 3. Install EQL

```bash
npx stash-forge install
```

**Using Drizzle?** To install EQL via your migration pipeline instead, run `npx stash-forge install --drizzle`, then `npx drizzle-kit migrate`. See [install --drizzle](#install---drizzle) below.

---

## Configuration

The `stash.config.ts` file is the single source of truth for stack-forge. It uses the `defineConfig` helper for type safety.

```typescript
import { defineConfig } from '@cipherstash/stack-forge'

export default defineConfig({
  // Required: PostgreSQL connection string
  databaseUrl: process.env.DATABASE_URL!,

  // Optional: path to your encryption client (default: './src/encryption/index.ts')
  // Used by `stash-forge push` and `stash-forge validate` to load the encryption schema
  client: './src/encryption/index.ts',
})
```

| Option | Required | Description |
|--------|----------|-------------|
| `databaseUrl` | Yes | PostgreSQL connection string |
| `client` | No | Path to encryption client file (default: `'./src/encryption/index.ts'`). Used by `push` and `validate` to load the encryption schema. |

The CLI automatically loads `.env` files before evaluating the config, so `process.env` references work out of the box.

The config file is resolved by walking up from the current working directory, similar to how `tsconfig.json` resolution works.

---

## CLI Reference

```
stash-forge <command> [options]
```

### `setup`

Configure your database and install EQL extensions. Run this after `stash init` has set up your encryption schema.

```bash
npx stash-forge setup [options]
```

The wizard will:
- Auto-detect your encryption client file by scanning common locations (`./src/encryption/index.ts`, etc.), then confirm with you or ask for the path if not found
- Ask for your database URL (pre-fills from `DATABASE_URL` env var)
- Generate `stash.config.ts` with the database URL and client path
- Ask which Postgres provider you're using to determine the right install flags:
  - **Supabase** — uses `--supabase` (no operator families + Supabase role grants)
  - **Neon, Vercel Postgres, PlanetScale, Prisma Postgres** — uses `--exclude-operator-family`
  - **AWS RDS, Other / Self-hosted** — standard install
- Install EQL extensions in your database

If `--supabase` is passed as a flag, the provider selection is skipped.

| Option | Description |
|--------|-------------|
| `--force` | Overwrite existing `stash.config.ts` and reinstall EQL |
| `--dry-run` | Show what would happen without making changes |
| `--supabase` | Skip provider selection and use Supabase-compatible install |
| `--drizzle` | Generate a Drizzle migration instead of direct install |
| `--exclude-operator-family` | Skip operator family creation |
| `--latest` | Fetch the latest EQL from GitHub instead of using the bundled version |

### `install`

Install the CipherStash EQL extensions into your database. Uses bundled SQL by default for offline, deterministic installs.

```bash
npx stash-forge install [options]
```

| Option | Description |
|--------|-------------|
| `--dry-run` | Show what would happen without making changes |
| `--force` | Reinstall even if EQL is already installed |
| `--supabase` | Use Supabase-compatible install (excludes operator families + grants Supabase roles) |
| `--exclude-operator-family` | Skip operator family creation (for non-superuser database roles) |
| `--drizzle` | Generate a Drizzle migration instead of direct install |
| `--latest` | Fetch the latest EQL from GitHub instead of using the bundled version |
| `--name <value>` | Migration name when using `--drizzle` (default: `install-eql`) |
| `--out <value>` | Drizzle output directory when using `--drizzle` (default: `drizzle`) |

**Standard install:**

```bash
npx stash-forge install
```

**Supabase install:**

```bash
npx stash-forge install --supabase
```

The `--supabase` flag:
- Uses the Supabase-specific SQL variant (no `CREATE OPERATOR FAMILY`)
- Grants `USAGE`, table, routine, and sequence permissions on the `eql_v2` schema to `anon`, `authenticated`, and `service_role`

> **Note:** Without operator families, `ORDER BY` on encrypted columns is not currently supported — regardless of the client or ORM used. Sort application-side after decrypting the results as a workaround. Operator family support for Supabase is being developed with the Supabase and CipherStash teams. This limitation also applies when using `--exclude-operator-family` on any database.

**Preview changes first:**

```bash
npx stash-forge install --dry-run
```

**Fetch the latest EQL from GitHub instead of using the bundled version:**

```bash
npx stash-forge install --latest
```

#### `install --drizzle`

If you use [Drizzle ORM](https://orm.drizzle.team/) and want EQL installation as part of your migration history, use the `--drizzle` flag. It creates a Drizzle migration file containing the EQL install SQL, then you run your normal Drizzle migrations to apply it.

```bash
npx stash-forge install --drizzle
npx drizzle-kit migrate
```

**How it works:**

1. Runs `drizzle-kit generate --custom --name=<name>` to create an empty migration.
2. Loads the bundled EQL install SQL (or downloads from GitHub with `--latest`).
3. Writes the EQL SQL into the generated migration file.

With a custom migration name or output directory:

```bash
npx stash-forge install --drizzle --name setup-eql --out ./migrations
npx drizzle-kit migrate
```

You need `drizzle-kit` installed in your project (`npm install -D drizzle-kit`). The `--out` directory must match your Drizzle config (e.g. `drizzle.config.ts`).

### `upgrade`

Upgrade an existing EQL installation to the version bundled with the package (or the latest from GitHub).

```bash
npx stash-forge upgrade [options]
```

| Option | Description |
|--------|-------------|
| `--dry-run` | Show what would happen without making changes |
| `--supabase` | Use Supabase-compatible upgrade |
| `--exclude-operator-family` | Skip operator family creation |
| `--latest` | Fetch the latest EQL from GitHub instead of using the bundled version |

The EQL install SQL is idempotent and safe to re-run. The upgrade command checks the current version, re-runs the install SQL, then reports the new version.

```bash
npx stash-forge upgrade
```

If EQL is not installed, the command suggests running `stash-forge install` instead.

### `validate`

Validate your encryption schema for common misconfigurations.

```bash
npx stash-forge validate [options]
```

| Option | Description |
|--------|-------------|
| `--supabase` | Check for Supabase-specific issues (e.g. ORDER BY without operator families) |
| `--exclude-operator-family` | Check for issues when operator families are excluded |

**Validation rules:**

| Rule | Severity | Description |
|------|----------|-------------|
| `freeTextSearch` on non-string column | Warning | Free-text search only works with string data |
| `orderAndRange` without operator families | Warning | ORDER BY won't work without operator families |
| No indexes on encrypted column | Info | Column is encrypted but not searchable |
| `searchableJson` without `json` data type | Error | searchableJson requires `dataType("json")` |

```bash
# Basic validation
npx stash-forge validate

# Validate with Supabase context
npx stash-forge validate --supabase
```

Validation is also automatically run before `push` — issues are logged as warnings but don't block the push.

The command exits with code 1 if there are errors (not for warnings or info).

### `push`

Push your encryption schema to the database. **This is only required when using CipherStash Proxy.** If you're using the SDK directly (Drizzle, Supabase, or plain PostgreSQL), this step is not needed — the schema lives in your application code.

```bash
npx stash-forge push [options]
```

| Option | Description |
|--------|-------------|
| `--dry-run` | Load and validate the schema, then print it as JSON. No database changes. |

When pushing, stash-forge:
1. Loads the encryption client from the path in `stash.config.ts`
2. Runs schema validation (warns but doesn't block)
3. Transforms SDK data types to EQL-compatible `cast_as` values (see table below)
4. Connects to Postgres and marks existing `eql_v2_configuration` rows as `inactive`
5. Inserts the new config as an `active` row

**SDK to EQL type mapping:**

The SDK uses developer-friendly type names (e.g. `'string'`, `'number'`), but EQL expects PostgreSQL-aligned types. The `push` command automatically maps these before writing to the database:

| SDK type (`dataType()`) | EQL `cast_as` |
|-------------------------|---------------|
| `string` | `text` |
| `text` | `text` |
| `number` | `double` |
| `bigint` | `big_int` |
| `boolean` | `boolean` |
| `date` | `date` |
| `json` | `jsonb` |

### `status`

Show the current state of EQL in your database.

```bash
npx stash-forge status
```

Reports:
- Whether EQL is installed and which version
- Database permission status
- Whether an active encrypt config exists in `eql_v2_configuration` (only relevant for CipherStash Proxy)

### `test-connection`

Verify that the database URL in your config is valid and the database is reachable.

```bash
npx stash-forge test-connection
```

Reports the database name, connected user/role, and PostgreSQL server version. Useful for debugging connection issues before running `install` or `push`.

### Permission Pre-checks (install)

Before installing, `stash-forge` verifies that the connected database role has the required permissions:

- `CREATE` on the database (for `CREATE SCHEMA` and `CREATE EXTENSION`)
- `CREATE` on the `public` schema (for `CREATE TYPE public.eql_v2_encrypted`)
- `SUPERUSER` or extension owner (for `CREATE EXTENSION pgcrypto`, if not already installed)

If permissions are insufficient, the CLI exits with a clear message listing what's missing.

### Planned Commands

| Command | Description |
|---------|-------------|
| `migrate` | Run pending encrypt config migrations |

---

## Bundled EQL SQL

The EQL install SQL is bundled with the package for offline, deterministic installs. Three variants are included:

| File | Used when |
|------|-----------|
| `cipherstash-encrypt.sql` | Default install |
| `cipherstash-encrypt-supabase.sql` | `--supabase` flag |
| `cipherstash-encrypt-no-operator-family.sql` | `--exclude-operator-family` flag |

The bundled SQL version is pinned to the package version. Use `--latest` to fetch the newest version from GitHub instead.

---

## Programmatic API

You can also use stack-forge as a library:

```typescript
import { EQLInstaller, loadStashConfig } from '@cipherstash/stack-forge'

// Load config from stash.config.ts
const config = await loadStashConfig()

// Create an installer
const installer = new EQLInstaller({
  databaseUrl: config.databaseUrl,
})

// Check permissions before installing
const permissions = await installer.checkPermissions()
if (!permissions.ok) {
  console.error('Missing permissions:', permissions.missing)
  process.exit(1)
}

// Check if already installed
if (await installer.isInstalled()) {
  console.log('EQL is already installed')
} else {
  await installer.install()
}
```

### `EQLInstaller`

| Method | Returns | Description |
|--------|---------|-------------|
| `checkPermissions()` | `Promise<PermissionCheckResult>` | Check if the database role has required permissions |
| `isInstalled()` | `Promise<boolean>` | Check if the `eql_v2` schema exists |
| `getInstalledVersion()` | `Promise<string \| null>` | Get the installed EQL version (or `null`) |
| `install(options?)` | `Promise<void>` | Execute the EQL install SQL in a transaction |

#### Install Options

```typescript
await installer.install({
  excludeOperatorFamily: true, // Skip CREATE OPERATOR FAMILY
  supabase: true,              // Supabase mode (implies excludeOperatorFamily + grants roles)
  latest: true,                // Fetch latest from GitHub instead of bundled
})
```

### `loadBundledEqlSql`

Load the bundled EQL install SQL as a string (useful for custom install workflows):

```typescript
import { loadBundledEqlSql } from '@cipherstash/stack-forge'

const sql = loadBundledEqlSql()                          // standard
const sql = loadBundledEqlSql({ supabase: true })        // supabase variant
const sql = loadBundledEqlSql({ excludeOperatorFamily: true }) // no operator family
```

### `downloadEqlSql`

Download the latest EQL install SQL from GitHub:

```typescript
import { downloadEqlSql } from '@cipherstash/stack-forge'

const sql = await downloadEqlSql()             // standard
const sql = await downloadEqlSql(true)         // no operator family variant
```

### `defineConfig`

Type-safe identity function for `stash.config.ts`:

```typescript
import { defineConfig } from '@cipherstash/stack-forge'

export default defineConfig({
  databaseUrl: process.env.DATABASE_URL!,
})
```

### `loadStashConfig`

Finds and loads the nearest `stash.config.ts`, validates it with Zod, applies defaults (e.g. `client`), and returns the typed config:

```typescript
import { loadStashConfig } from '@cipherstash/stack-forge'

const config = await loadStashConfig()
// config.databaseUrl — guaranteed to be a non-empty string
// config.client — path to encryption client (default: './src/encryption/index.ts')
```
