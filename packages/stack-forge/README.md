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

---

## Configuration

The `stash.config.ts` file is the single source of truth for stack-forge. It uses the `defineConfig` helper for type safety.

```typescript
import { defineConfig } from '@cipherstash/stack-forge'

export default defineConfig({
  // Required: PostgreSQL connection string
  databaseUrl: process.env.DATABASE_URL!,
})
```

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

### Permission Pre-checks

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
| `push` | Push encryption schema to database |
| `migrate` | Run pending EQL migrations |
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

Finds and loads the nearest `stash.config.ts`, validates it with Zod, and returns the typed config:

```typescript
import { loadStashConfig } from '@cipherstash/stack-forge'

const config = await loadStashConfig()
// config.databaseUrl is guaranteed to be a non-empty string
```
