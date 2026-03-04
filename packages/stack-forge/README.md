# @cipherstash/stack-forge

Dev-time CLI and library for managing [CipherStash EQL](https://github.com/cipherstash/encrypt-query-language) (Encrypted Query Language) in your PostgreSQL database.

[![npm version](https://img.shields.io/npm/v/@cipherstash/stack-forge.svg?style=for-the-badge&labelColor=000000)](https://www.npmjs.com/package/@cipherstash/stack-forge)
[![License: MIT](https://img.shields.io/npm/l/@cipherstash/stack-forge.svg?style=for-the-badge&labelColor=000000)](https://github.com/cipherstash/protectjs/blob/main/LICENSE.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-first-blue?style=for-the-badge&labelColor=000000)](https://www.typescriptlang.org/)

---

## Why stack-forge?

`@cipherstash/stack` is the runtime encryption SDK — it should stay lean and free of heavy dependencies like `pg`. `@cipherstash/stack-forge` is a **devDependency** that handles database tooling: installing EQL extensions, checking permissions, and managing schema lifecycle.

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

You can install EQL in two ways: **direct install** (connects to the DB and runs the SQL) or **Drizzle migration** (generates a migration file; you run `drizzle-kit migrate` yourself). The steps below use the direct install path.

### 1. Create a config file

Create `stash.config.ts` in your project root:

```typescript
import { defineConfig } from '@cipherstash/stack-forge'

export default defineConfig({
  databaseUrl: process.env.DATABASE_URL!,
})
```

### 2. Add a `.env` file

```env
DATABASE_URL=postgresql://user:password@localhost:5432/mydb
```

### 3. Install EQL

```bash
npx stash-forge install
```

That's it. EQL is now installed in your database.

If your encryption client lives elsewhere, set `client` in `stash.config.ts` (e.g. `client: './lib/encryption.ts'`). That path is used by `stash-forge push`.

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
  // Used by `stash-forge push` to load the encryption schema
  client: './src/encryption/index.ts',

  // Optional: CipherStash workspace and credentials (for future schema sync)
  workspaceId: process.env.CS_WORKSPACE_ID,
  clientAccessKey: process.env.CS_CLIENT_ACCESS_KEY,
})
```

| Option | Required | Description |
|--------|----------|-------------|
| `databaseUrl` | Yes | PostgreSQL connection string |
| `client` | No | Path to encryption client file (default: `'./src/encryption/index.ts'`). Used by `push` to load the encryption schema. |
| `workspaceId` | No | CipherStash workspace ID |
| `clientAccessKey` | No | CipherStash client access key |

The CLI automatically loads `.env` files before evaluating the config, so `process.env` references work out of the box.

The config file is resolved by walking up from the current working directory, similar to how `tsconfig.json` resolution works.

---

## CLI Reference

```
stash-forge <command> [options]
```

### `install`

Install the CipherStash EQL extensions into your database.

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
- Downloads the Supabase-specific SQL variant (no `CREATE OPERATOR FAMILY`)
- Grants `USAGE`, table, routine, and sequence permissions on the `eql_v2` schema to `anon`, `authenticated`, and `service_role`

**Preview changes first:**

```bash
npx stash-forge install --dry-run
```

#### `install --drizzle`

If you use [Drizzle ORM](https://orm.drizzle.team/) and want EQL installation as part of your migration history, use the `--drizzle` flag. It creates a Drizzle migration file containing the EQL install SQL, then you run your normal Drizzle migrations to apply it.

```bash
npx stash-forge install --drizzle
npx drizzle-kit migrate
```

**How it works:**

1. Runs `drizzle-kit generate --custom --name=<name>` to create an empty migration.
2. Downloads the EQL install script from the [EQL GitHub releases](https://github.com/cipherstash/encrypt-query-language/releases/latest).
3. Writes the EQL SQL into the generated migration file.

With a custom migration name or output directory:

```bash
npx stash-forge install --drizzle --name setup-eql --out ./migrations
npx drizzle-kit migrate
```

You need `drizzle-kit` installed in your project (`npm install -D drizzle-kit`). The `--out` directory must match your Drizzle config (e.g. `drizzle.config.ts`).

### `push`

Load your encryption schema from the file specified by `client` in `stash.config.ts` and apply it to the database (or preview with `--dry-run`).

```bash
npx stash-forge push [options]
```

| Option | Description |
|--------|-------------|
| `--dry-run` | Load and validate the schema, then print it as JSON. No database changes. |

**Push schema to the database:**

```bash
npx stash-forge push
```

This connects to Postgres, marks any existing rows in `eql_v2_configuration` as `inactive`, and inserts the current encrypt config as a new row with state `active`. Your runtime encryption (e.g. `@cipherstash/stack`) reads the active configuration from this table.

**Preview your encryption schema without writing to the database:**

```bash
npx stash-forge push --dry-run
```

### Permission Pre-checks (install)

Before installing, `stash-forge` verifies that the connected database role has the required permissions:

- `CREATE` on the database (for `CREATE SCHEMA` and `CREATE EXTENSION`)
- `CREATE` on the `public` schema (for `CREATE TYPE public.eql_v2_encrypted`)
- `SUPERUSER` or extension owner (for `CREATE EXTENSION pgcrypto`, if not already installed)

If permissions are insufficient, the CLI exits with a clear message listing what's missing.

### Planned Commands

The following commands are defined but not yet implemented:

| Command | Description |
|---------|-------------|
| `init` | Initialize CipherStash Forge in your project |
| `migrate` | Run pending encrypt config migrations |
| `status` | Show EQL installation status |

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
| `install(options?)` | `Promise<void>` | Download and execute the EQL install SQL in a transaction |

#### Install Options

```typescript
await installer.install({
  excludeOperatorFamily: true, // Skip CREATE OPERATOR FAMILY
  supabase: true,              // Supabase mode (implies excludeOperatorFamily + grants roles)
})
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
