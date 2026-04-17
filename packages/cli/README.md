# @cipherstash/cli

[![npm version](https://img.shields.io/npm/v/@cipherstash/cli.svg?style=for-the-badge&labelColor=000000)](https://www.npmjs.com/package/@cipherstash/cli)
[![License: MIT](https://img.shields.io/npm/l/@cipherstash/cli.svg?style=for-the-badge&labelColor=000000)](https://github.com/cipherstash/protectjs/blob/main/LICENSE.md)

The single CLI for CipherStash. It handles authentication, project initialization, AI-guided encryption setup, EQL database lifecycle (install, upgrade, validate, push, migrate), schema building, and encrypted secrets management. Install it as a devDependency alongside the runtime SDK `@cipherstash/stack`.

---

## Quickstart

```bash
npm install -D @cipherstash/cli
npx @cipherstash/cli auth login    # authenticate with CipherStash
npx @cipherstash/cli init          # scaffold encryption schema and install dependencies
npx @cipherstash/cli db install    # scaffold stash.config.ts (if missing) and install EQL
npx @cipherstash/cli wizard        # AI agent wires encryption into your codebase
```

What each step does:

- `auth login` — opens a browser-based device code flow and saves a token to `~/.cipherstash/auth.json`.
- `init` — generates your encryption client file and installs `@cipherstash/cli` as a dev dependency. Pass `--supabase` or `--drizzle` for provider-specific setup.
- `db install` — detects your encryption client, writes `stash.config.ts` if it's missing, and installs EQL extensions in a single step.
- `wizard` — reads your codebase with an AI agent (uses the CipherStash-hosted LLM gateway, no Anthropic API key required) and modifies your schema files in place.

---

## Recommended flow

```
npx @cipherstash/cli init
    └── npx @cipherstash/cli db install
            └── npx @cipherstash/cli wizard        ← fast path: AI edits your files
                    OR
                Edit schema files by hand  ← escape hatch
```

`npx @cipherstash/cli wizard` is the recommended path after `db install`. It detects your framework (Drizzle, Supabase, Prisma, raw SQL), introspects your database, and integrates encryption directly into your existing schema definitions. If you prefer to write the schema by hand, skip the wizard and edit your encryption client file directly.

---

## Configuration

`stash.config.ts` is the single source of truth for database-touching commands. Create it in your project root:

```typescript filename="stash.config.ts"
import { defineConfig } from '@cipherstash/cli'

export default defineConfig({
  databaseUrl: process.env.DATABASE_URL!,
  client: './src/encryption/index.ts',
})
```

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `databaseUrl` | Yes | — | PostgreSQL connection string |
| `client` | No | `./src/encryption/index.ts` | Path to your encryption client file |

The CLI loads `.env` files automatically before reading the config, so `process.env` references work without extra setup. The config file is resolved by walking up from the current working directory.

Commands that consume `stash.config.ts`: `db install`, `db upgrade`, `db push`, `db validate`, `db status`, `db test-connection`, `schema build`. `db install` will scaffold `stash.config.ts` for you if it's missing.

---

## Commands reference

### `npx @cipherstash/cli init`

Scaffold CipherStash for your project. Generates an encryption client file, writes initial schema code, and installs `@cipherstash/cli` as a dev dependency.

```bash
npx @cipherstash/cli init [--supabase] [--drizzle]
```

| Flag | Description |
|------|-------------|
| `--supabase` | Use the Supabase-specific setup flow |
| `--drizzle` | Use the Drizzle-specific setup flow |

After `init` completes, the Next Steps output tells you to run `npx @cipherstash/cli db install`, then either `npx @cipherstash/cli wizard` or edit the schema manually.

---

### `npx @cipherstash/cli auth login`

Authenticate with CipherStash using a browser-based device code flow.

```bash
npx @cipherstash/cli auth login
```

Saves the token to `~/.cipherstash/auth.json`. The wizard checks for this file as a prerequisite before running.

---

### `npx @cipherstash/cli wizard`

AI-powered encryption setup. The wizard reads your codebase, detects your framework, introspects your database schema, and edits your existing schema files to add encrypted column definitions.

```bash
npx @cipherstash/cli wizard
```

Prerequisites:
- Authenticated (`npx @cipherstash/cli auth login` completed).
- `stash.config.ts` present (run `npx @cipherstash/cli db install` first; it will scaffold the config if missing).

Supported integrations: Drizzle ORM, Supabase JS Client, Prisma (experimental), raw SQL / other.

The wizard uses the CipherStash-hosted LLM gateway. No Anthropic API key is required.

---

### `npx @cipherstash/cli secrets`

Manage end-to-end encrypted secrets.

```bash
npx @cipherstash/cli secrets <subcommand> [options]
```

| Subcommand | Description |
|------------|-------------|
| `set` | Store an encrypted secret |
| `get` | Retrieve and decrypt a secret |
| `get-many` | Retrieve and decrypt multiple secrets (2–100) |
| `list` | List all secrets in an environment |
| `delete` | Delete a secret |

**Flags:**

| Flag | Alias | Description |
|------|-------|-------------|
| `--name` | `-n` | Secret name (comma-separated for `get-many`) |
| `--value` | `-V` | Secret value (`set` only) |
| `--environment` | `-e` | Environment name |
| `--yes` | `-y` | Skip confirmation (`delete` only) |

**Examples:**

```bash
npx @cipherstash/cli secrets set -n DATABASE_URL -V "postgres://..." -e production
npx @cipherstash/cli secrets get -n DATABASE_URL -e production
npx @cipherstash/cli secrets get-many -n DATABASE_URL,API_KEY -e production
npx @cipherstash/cli secrets list -e production
npx @cipherstash/cli secrets delete -n DATABASE_URL -e production -y
```

---

### `npx @cipherstash/cli db install`

Configure your database and install CipherStash EQL extensions in a single command. Run this after `npx @cipherstash/cli init`.

When `stash.config.ts` is missing, the command auto-detects your encryption client file (or asks for the path) and writes the config before installing. Supabase and Drizzle are detected from your `DATABASE_URL` and project files, so the matching flags default on. Install uses bundled SQL for offline, deterministic runs.

```bash
npx @cipherstash/cli db install [options]
```

| Flag | Description |
|------|-------------|
| `--force` | Reinstall even if EQL is already installed |
| `--dry-run` | Show what would happen without making changes |
| `--supabase` | Supabase-compatible install (no operator families + grants Supabase roles) |
| `--exclude-operator-family` | Skip operator family creation |
| `--drizzle` | Generate a Drizzle migration instead of direct install |
| `--latest` | Fetch the latest EQL from GitHub |
| `--name <value>` | Migration name (Drizzle mode, default: `install-eql`) |
| `--out <value>` | Drizzle output directory (default: `drizzle`) |

The `--supabase` flag uses a Supabase-specific SQL variant and grants `USAGE`, table, routine, and sequence permissions on the `eql_v2` schema to the `anon`, `authenticated`, and `service_role` roles.

> **Good to know:** Without operator families, `ORDER BY` on encrypted columns is not supported. Sort application-side after decrypting results as a workaround. This applies to both `--supabase` and `--exclude-operator-family` installs.

---

### `npx @cipherstash/cli db upgrade`

Upgrade an existing EQL installation to the version bundled with the package (or the latest from GitHub).

```bash
npx @cipherstash/cli db upgrade [options]
```

| Flag | Description |
|------|-------------|
| `--dry-run` | Show what would happen without making changes |
| `--supabase` | Use Supabase-compatible upgrade |
| `--exclude-operator-family` | Skip operator family creation |
| `--latest` | Fetch the latest EQL from GitHub |

The install SQL is idempotent and safe to re-run. If EQL is not installed, the command suggests running `npx @cipherstash/cli db install` instead.

---

### `npx @cipherstash/cli db push`

Push your encryption schema to the database. **Only required when using CipherStash Proxy.** If you use the SDK directly with Drizzle, Supabase, or plain PostgreSQL, skip this step.

```bash
npx @cipherstash/cli db push [--dry-run]
```

| Flag | Description |
|------|-------------|
| `--dry-run` | Load and validate the schema, print as JSON. No database changes. |

When pushing, the CLI loads the encryption client from `stash.config.ts`, runs schema validation (warns but does not block), maps SDK types to EQL types, and upserts the config row in `eql_v2_configuration`.

**SDK to EQL type mapping:**

| SDK `dataType()` | EQL `cast_as` |
|------------------|---------------|
| `string` / `text` | `text` |
| `number` | `double` |
| `bigint` | `big_int` |
| `boolean` | `boolean` |
| `date` | `date` |
| `json` | `jsonb` |

---

### `npx @cipherstash/cli db validate`

Validate your encryption schema for common misconfigurations.

```bash
npx @cipherstash/cli db validate [--supabase] [--exclude-operator-family]
```

| Rule | Severity |
|------|----------|
| `freeTextSearch` on a non-string column | Warning |
| `orderAndRange` without operator families | Warning |
| No indexes on an encrypted column | Info |
| `searchableJson` without `dataType("json")` | Error |

The command exits with code 1 on errors (not on warnings or info). Validation also runs automatically before `db push`.

---

### `npx @cipherstash/cli db migrate`

Run pending encrypt config migrations.

```bash
npx @cipherstash/cli db migrate
```

> **Good to know:** This command is not yet implemented.

---

### `npx @cipherstash/cli db status`

Show the current state of EQL in your database.

```bash
npx @cipherstash/cli db status
```

Reports EQL installation status and version, database permission status, and whether an active encrypt config exists in `eql_v2_configuration` (relevant only for CipherStash Proxy).

---

### `npx @cipherstash/cli db test-connection`

Verify that the database URL in your config is valid and the database is reachable.

```bash
npx @cipherstash/cli db test-connection
```

Reports the database name, connected role, and PostgreSQL server version.

---

### `npx @cipherstash/cli schema build`

Build an encryption client file from your database schema using DB introspection.

```bash
npx @cipherstash/cli schema build [--supabase]
```

The first prompt offers `npx @cipherstash/cli wizard` as the recommended path. If you choose the manual builder, the command connects to your database, lets you select tables and columns to encrypt, asks about searchable indexes, and generates a typed encryption client file.

Reads `databaseUrl` from `stash.config.ts`.

---

## Drizzle migration mode

Use `--drizzle` with `npx @cipherstash/cli db install` to add EQL installation to your Drizzle migration history instead of applying it directly. `--drizzle` is auto-detected when your project has `drizzle-orm`, `drizzle-kit`, or a `drizzle.config.*` file, so you usually don't need to pass it explicitly.

```bash
npx @cipherstash/cli db install --drizzle
npx drizzle-kit migrate
```

How it works:
1. Runs `npx drizzle-kit generate --custom --name=<name>` to create an empty migration.
2. Loads the bundled EQL SQL (or fetches from GitHub with `--latest`).
3. Writes the EQL SQL into the generated migration file.

With a custom name or output directory:

```bash
npx @cipherstash/cli db install --drizzle --name setup-eql --out ./migrations
npx drizzle-kit migrate
```

`drizzle-kit` must be installed in your project (`npm install -D drizzle-kit`). The `--out` directory must match your `drizzle.config.ts`.

---

## Required database permissions

Before installing EQL, the CLI verifies that the connected role has:

- `CREATE` on the database (for `CREATE SCHEMA` and `CREATE EXTENSION`).
- `CREATE` on the `public` schema (for `CREATE TYPE public.eql_v2_encrypted`).
- `SUPERUSER` or extension owner privileges (for `CREATE EXTENSION pgcrypto`, if not already installed).

If permissions are insufficient, the CLI exits with a message listing what is missing.

---

## Programmatic API

```typescript
import {
  defineConfig,
  loadStashConfig,
  EQLInstaller,
  loadBundledEqlSql,
  downloadEqlSql,
} from '@cipherstash/cli'
```

### `defineConfig`

Type-safe identity function for `stash.config.ts`:

```typescript filename="stash.config.ts"
import { defineConfig } from '@cipherstash/cli'

export default defineConfig({
  databaseUrl: process.env.DATABASE_URL!,
  client: './src/encryption/index.ts',
})
```

### `loadStashConfig`

Finds and loads the nearest `stash.config.ts`, validates it with Zod, applies defaults, and returns the typed config:

```typescript
import { loadStashConfig } from '@cipherstash/cli'

const config = await loadStashConfig()
// config.databaseUrl — validated non-empty string
// config.client — defaults to './src/encryption/index.ts'
```

### `EQLInstaller`

Programmatic access to EQL installation:

```typescript
import { EQLInstaller } from '@cipherstash/cli'

const installer = new EQLInstaller({ databaseUrl: process.env.DATABASE_URL! })

const permissions = await installer.checkPermissions()
if (!permissions.ok) {
  console.error('Missing permissions:', permissions.missing)
  process.exit(1)
}

if (!(await installer.isInstalled())) {
  await installer.install({ supabase: true })
}
```

| Method | Returns | Description |
|--------|---------|-------------|
| `checkPermissions()` | `Promise<PermissionCheckResult>` | Check required database permissions |
| `isInstalled()` | `Promise<boolean>` | Check if the `eql_v2` schema exists |
| `getInstalledVersion()` | `Promise<string \| null>` | Get the installed EQL version |
| `install(options?)` | `Promise<void>` | Execute the EQL install SQL in a transaction |

Install options: `excludeOperatorFamily`, `supabase`, `latest` (all boolean).

### `loadBundledEqlSql`

Load the bundled EQL install SQL as a string:

```typescript
import { loadBundledEqlSql } from '@cipherstash/cli'

const sql = loadBundledEqlSql()
const sql = loadBundledEqlSql({ supabase: true })
const sql = loadBundledEqlSql({ excludeOperatorFamily: true })
```

### `downloadEqlSql`

Download the latest EQL install SQL from GitHub:

```typescript
import { downloadEqlSql } from '@cipherstash/cli'

const sql = await downloadEqlSql()             // standard
const sql = await downloadEqlSql(true)         // no operator family variant
```

---

## Relationship to `@cipherstash/stack`

`@cipherstash/stack` is the runtime SDK. It stays lean with no heavy dependencies like `pg` and ships in your production bundle. `@cipherstash/cli` is a devDependency: it handles database tooling, AI-guided setup, and schema lifecycle at development time. Think of it like Drizzle Kit — a companion tool that prepares the database while the runtime SDK handles queries.

---

## Links

- [Documentation](https://cipherstash.com/docs)
- [Discord](https://discord.gg/cipherstash)
- [Support](mailto:support@cipherstash.com)
