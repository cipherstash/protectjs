# @cipherstash/stack

Your all-in-one TypeScript SDK for the CipherStash data security stack.

[![npm version](https://img.shields.io/npm/v/@cipherstash/stack.svg?style=for-the-badge&labelColor=000000)](https://www.npmjs.com/package/@cipherstash/stack)
[![License: MIT](https://img.shields.io/npm/l/@cipherstash/stack.svg?style=for-the-badge&labelColor=000000)](https://github.com/cipherstash/protectjs/blob/main/LICENSE.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-first-blue?style=for-the-badge&labelColor=000000)](https://www.typescriptlang.org/)

--

## Table of Contents

- [Install](#install)
- [Quick Start](#quick-start)
- [Features](#features)
- [Schema Definition](#schema-definition)
- [Encryption and Decryption](#encryption-and-decryption)
- [Searchable Encryption](#searchable-encryption)
- [Identity-Aware Encryption](#identity-aware-encryption)
- [Secrets Management](#secrets-management)
- [CLI Reference](#cli-reference)
- [Configuration](#configuration)
- [Error Handling](#error-handling)
- [API Reference](#api-reference)
- [Subpath Exports](#subpath-exports)
- [Migration from @cipherstash/protect](#migration-from-cipherstashprotect)
- [Requirements](#requirements)
- [License](#license)

--

## Install

```bash
npm install @cipherstash/stack
```

Or with your preferred package manager:

```bash
yarn add @cipherstash/stack
pnpm add @cipherstash/stack
```

## Quick Start

```typescript
import { Encryption } from "@cipherstash/stack"
import { encryptedTable, encryptedColumn } from "@cipherstash/stack/schema"

// 1. Define a schema
const users = encryptedTable("users", {
  email: encryptedColumn("email").equality().freeTextSearch(),
})

// 2. Create a client (reads CS_* env vars automatically)
const client = await Encryption({ schemas: [users] })

// 3. Encrypt a value
const encrypted = await client.encrypt("hello@example.com", {
  column: users.email,
  table: users,
})

if (encrypted.failure) {
  console.error("Encryption failed:", encrypted.failure.message)
} else {
  console.log("Encrypted payload:", encrypted.data)
}

// 4. Decrypt the value
const decrypted = await client.decrypt(encrypted.data)

if (decrypted.failure) {
  console.error("Decryption failed:", decrypted.failure.message)
} else {
  console.log("Plaintext:", decrypted.data) // "hello@example.com"
}
```

## Features

- **Field-level encryption** - Every value encrypted with its own unique key via [ZeroKMS](https://cipherstash.com/products/zerokms), backed by AWS KMS.
- **Searchable encryption** - Exact match, free-text search, order/range queries, and encrypted JSONB queries in PostgreSQL.
- **Bulk operations** - Encrypt or decrypt thousands of values in a single ZeroKMS call (`bulkEncrypt`, `bulkDecrypt`, `bulkEncryptModels`, `bulkDecryptModels`).
- **Identity-aware encryption** - Tie encryption to a user's JWT via `LockContext`, so only that user can decrypt.
- **Secrets management** - Store, retrieve, list, and delete encrypted secrets with the `Secrets` class.
- **CLI (`stash`)** - Manage secrets from the terminal without writing code.
- **TypeScript-first** - Strongly typed schemas, results, and model operations with full generics support.

## Schema Definition

Define which tables and columns to encrypt using `encryptedTable` and `encryptedColumn` from `@cipherstash/stack/schema`.

```typescript
import { encryptedTable, encryptedColumn } from "@cipherstash/stack/schema"

const users = encryptedTable("users", {
  email: encryptedColumn("email")
    .equality()         // exact-match queries
    .freeTextSearch()   // full-text search queries
    .orderAndRange(),   // sorting and range queries
})

const documents = encryptedTable("documents", {
  metadata: encryptedColumn("metadata")
    .searchableJson(),  // encrypted JSONB queries (JSONPath + containment)
})
```

### Index Types

| Method | Purpose | Query Type |
|----|-----|------|
| `.equality()` | Exact match lookups | `'equality'` |
| `.freeTextSearch()` | Full-text / fuzzy search | `'freeTextSearch'` |
| `.orderAndRange()` | Sorting, comparison, range queries | `'orderAndRange'` |
| `.searchableJson()` | Encrypted JSONB path and containment queries | `'searchableJson'` |
| `.dataType(cast)` | Set the plaintext data type (`'string'`, `'number'`, `'boolean'`, `'date'`, `'bigint'`, `'json'`) | N/A |

Methods are chainable - call as many as you need on a single column.

## Encryption and Decryption

### Single Values

```typescript
// Encrypt
const encrypted = await client.encrypt("secret@example.com", {
  column: users.email,
  table: users,
})

// Decrypt
const decrypted = await client.decrypt(encrypted.data)
```

### Model Operations

Encrypt or decrypt an entire object. Only fields matching your schema are encrypted; other fields pass through unchanged.

```typescript
const user = {
  id: "user_123",
  email: "alice@example.com",  // defined in schema -> encrypted
  createdAt: new Date(),       // not in schema -> unchanged
}

// Encrypt a model
const encryptedResult = await client.encryptModel(user, users)

// Decrypt a model
const decryptedResult = await client.decryptModel(encryptedResult.data)
```

Type-safe generics are supported:

```typescript
type User = { id: string; email: string; createdAt: Date }

const result = await client.encryptModel<User>(user, users)
const back = await client.decryptModel<User>(result.data)
```

### Bulk Operations

All bulk methods make a single call to ZeroKMS regardless of the number of records, while still using a unique key per value.

#### Bulk Encrypt / Decrypt (raw values)

```typescript
const plaintexts = [
  { id: "u1", plaintext: "alice@example.com" },
  { id: "u2", plaintext: "bob@example.com" },
  { id: "u3", plaintext: null },  // null values are preserved
]

const encrypted = await client.bulkEncrypt(plaintexts, {
  column: users.email,
  table: users,
})

// encrypted.data = [{ id: "u1", data: EncryptedPayload }, ...]

const decrypted = await client.bulkDecrypt(encrypted.data)

// Each item has either { data: "plaintext" } or { error: "message" }
for (const item of decrypted.data) {
  if ("data" in item) {
    console.log(`${item.id}: ${item.data}`)
  } else {
    console.error(`${item.id} failed: ${item.error}`)
  }
}
```

#### Bulk Encrypt / Decrypt Models

```typescript
const userModels = [
  { id: "1", email: "alice@example.com" },
  { id: "2", email: "bob@example.com" },
]

const encrypted = await client.bulkEncryptModels(userModels, users)
const decrypted = await client.bulkDecryptModels(encrypted.data)
```

## Searchable Encryption

Encrypt a query term so you can search encrypted data in PostgreSQL.

```typescript
// Equality query
const eqQuery = await client.encryptQuery("alice@example.com", {
  column: users.email,
  table: users,
  queryType: "equality",
})

// Free-text search
const matchQuery = await client.encryptQuery("alice", {
  column: users.email,
  table: users,
  queryType: "freeTextSearch",
})

// Order and range
const rangeQuery = await client.encryptQuery("alice@example.com", {
  column: users.email,
  table: users,
  queryType: "orderAndRange",
})
```

### Searchable JSON

For columns using `.searchableJson()`, the query type is auto-inferred from the plaintext:

```typescript
// String -> JSONPath selector query
const pathQuery = await client.encryptQuery("$.user.email", {
  column: documents.metadata,
  table: documents,
})

// Object/Array -> containment query
const containsQuery = await client.encryptQuery({ role: "admin" }, {
  column: documents.metadata,
  table: documents,
})
```

### Batch Query Encryption

Encrypt multiple query terms in one call:

```typescript
const terms = [
  { value: "alice@example.com", column: users.email, table: users, queryType: "equality" as const },
  { value: "bob",               column: users.email, table: users, queryType: "freeTextSearch" as const },
]

const results = await client.encryptQuery(terms)
```

### PostgreSQL / Drizzle Integration Pattern

Encrypted data is stored as an [EQL](https://github.com/cipherstash/encrypt-query-language) JSON payload. Install the EQL extension in PostgreSQL to enable searchable queries, then store encrypted data in `eql_v2_encrypted` columns:

```sql
CREATE TABLE users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email eql_v2_encrypted
);
```

```typescript
import { eq } from "drizzle-orm"
import { pgTable, serial, jsonb } from "drizzle-orm/pg-core"

const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: jsonb("email").notNull(),
})

// Insert encrypted data
await db.insert(usersTable).values({ email: encrypted.data })

// Search with encrypted query
const encQuery = await client.encryptQuery("alice@example.com", {
  column: users.email,
  table: users,
  queryType: "equality",
})
```

## Identity-Aware Encryption

Lock encryption to a specific user by requiring a valid JWT for decryption.

```typescript
import { LockContext } from "@cipherstash/stack/identity"

// 1. Create a lock context (defaults to the "sub" claim)
const lc = new LockContext()

// 2. Identify the user with their JWT
const identifyResult = await lc.identify(userJwt)

if (identifyResult.failure) {
  throw new Error(identifyResult.failure.message)
}

const lockContext = identifyResult.data

// 3. Encrypt with lock context
const encrypted = await client
  .encrypt("sensitive data", { column: users.email, table: users })
  .withLockContext(lockContext)

// 4. Decrypt with the same lock context
const decrypted = await client
  .decrypt(encrypted.data)
  .withLockContext(lockContext)
```

Lock contexts work with all operations: `encrypt`, `decrypt`, `encryptModel`, `decryptModel`, `bulkEncryptModels`, `bulkDecryptModels`, `bulkEncrypt`, `bulkDecrypt`.

## Secrets Management

The `Secrets` class provides end-to-end encrypted secret storage. Values are encrypted locally before being sent to the CipherStash API.

```typescript
import { Secrets } from "@cipherstash/stack/secrets"

const secrets = new Secrets({
  workspaceCRN: process.env.CS_WORKSPACE_CRN!,
  clientId: process.env.CS_CLIENT_ID!,
  clientKey: process.env.CS_CLIENT_KEY!,
  apiKey: process.env.CS_CLIENT_ACCESS_KEY!,
  environment: "production",
})

// Store a secret
await secrets.set("DATABASE_URL", "postgres://user:pass@host:5432/db")

// Retrieve and decrypt a single secret
const result = await secrets.get("DATABASE_URL")
if (!result.failure) {
  console.log(result.data) // "postgres://user:pass@host:5432/db"
}

// Retrieve multiple secrets in one call
const many = await secrets.getMany(["DATABASE_URL", "API_KEY"])
if (!many.failure) {
  console.log(many.data.DATABASE_URL)
  console.log(many.data.API_KEY)
}

// List secret names (values stay encrypted)
const list = await secrets.list()

// Delete a secret
await secrets.delete("DATABASE_URL")
```

## CLI Reference

The `stash` CLI is bundled with the package and available after install.

```bash
npx stash secrets set  -name DATABASE_URL -value "postgres://..." -environment production
npx stash secrets get  -name DATABASE_URL -environment production
npx stash secrets list -environment production
npx stash secrets delete -name DATABASE_URL -environment production
```

### Commands

| Command | Flags | Aliases | Description |
|-----|----|-----|-------|
| `stash secrets set` | `-name`, `-value`, `-environment` | `-n`, `-V`, `-e` | Encrypt and store a secret |
| `stash secrets get` | `-name`, `-environment` | `-n`, `-e` | Retrieve and decrypt a secret |
| `stash secrets list` | `-environment` | `-e` | List all secret names in an environment |
| `stash secrets delete` | `-name`, `-environment`, `-yes` | `-n`, `-e`, `-y` | Delete a secret (prompts for confirmation unless `-yes`) |

The CLI reads credentials from the same `CS_*` environment variables described in [Configuration](#configuration).

## Configuration

### Environment Variables

| Variable | Description |
|-----|-------|
| `CS_WORKSPACE_CRN` | The workspace identifier (CRN format) |
| `CS_CLIENT_ID` | The client identifier |
| `CS_CLIENT_KEY` | Client key material used with ZeroKMS for encryption |
| `CS_CLIENT_ACCESS_KEY` | API key for authenticating with the CipherStash API |

Store these in a `.env` file or set them in your hosting platform.

Sign up at [cipherstash.com/signup](https://cipherstash.com/signup) and follow the onboarding to generate credentials.

### TOML Config

You can also configure credentials via `cipherstash.toml` and `cipherstash.secret.toml` files in your project root. See the [CipherStash docs](https://cipherstash.com/docs) for format details.

### Programmatic Config

Pass config directly when initializing the client:

```typescript
import { Encryption } from "@cipherstash/stack"
import { users } from "./schema"

const client = await Encryption({
  schemas: [users],
  config: {
    workspaceCrn: "crn:ap-southeast-2.aws:your-workspace-id",
    clientId: "your-client-id",
    clientKey: "your-client-key",
    accessKey: "your-access-key",
    keyset: { name: "my-keyset" }, // or { id: "uuid" }
  },
})
```

### Multi-Tenant Encryption (Keysets)

Isolate encryption keys per tenant using keysets:

```typescript
const client = await Encryption({
  schemas: [users],
  config: {
    keyset: { id: "123e4567-e89b-12d3-a456-426614174000" },
  },
})

// or by name
const client2 = await Encryption({
  schemas: [users],
  config: {
    keyset: { name: "Company A" },
  },
})
```

### Logging

```bash
PROTECT_LOG_LEVEL=debug  # debug | info | error
```

The SDK never logs plaintext data.

## Error Handling

All async methods return a `Result` object with either a `data` key (success) or a `failure` key (error). This is a discriminated union - you never get both.

```typescript
const result = await client.encrypt("hello", { column: users.email, table: users })

if (result.failure) {
  // result.failure.type: string (e.g. "EncryptionError")
  // result.failure.message: string
  console.error(result.failure.type, result.failure.message)
} else {
  // result.data: Encrypted payload
  console.log(result.data)
}
```

### Error Types

| Type | When |
|---|---|
| `ClientInitError` | Client initialization fails (bad credentials, missing config) |
| `EncryptionError` | An encrypt operation fails |
| `DecryptionError` | A decrypt operation fails |
| `LockContextError` | Lock context creation or usage fails |
| `CtsTokenError` | Identity token exchange fails |

## API Reference

### `Encryption(config)` - Initialize the client

```typescript
function Encryption(config: EncryptionClientConfig): Promise<EncryptionClient>
```

### `EncryptionClient` Methods

| Method | Signature | Returns |
|----|------|-----|
| `encrypt` | `(plaintext, { column, table })` | `EncryptOperation` (thenable) |
| `decrypt` | `(encryptedData)` | `DecryptOperation` (thenable) |
| `encryptQuery` | `(plaintext, { column, table, queryType? })` | `EncryptQueryOperation` (thenable) |
| `encryptQuery` | `(terms: ScalarQueryTerm[])` | `BatchEncryptQueryOperation` (thenable) |
| `encryptModel` | `(model, table)` | `EncryptModelOperation<T>` (thenable) |
| `decryptModel` | `(encryptedModel)` | `DecryptModelOperation<T>` (thenable) |
| `bulkEncrypt` | `(plaintexts, { column, table })` | `BulkEncryptOperation` (thenable) |
| `bulkDecrypt` | `(encryptedPayloads)` | `BulkDecryptOperation` (thenable) |
| `bulkEncryptModels` | `(models, table)` | `BulkEncryptModelsOperation<T>` (thenable) |
| `bulkDecryptModels` | `(encryptedModels)` | `BulkDecryptModelsOperation<T>` (thenable) |

All operations are thenable (awaitable) and support `.withLockContext(lockContext)` for identity-aware encryption.

### `LockContext`

```typescript
import { LockContext } from "@cipherstash/stack/identity"

const lc = new LockContext(options?)
const result = await lc.identify(jwtToken)
```

### `Secrets`

```typescript
import { Secrets } from "@cipherstash/stack/secrets"

const secrets = new Secrets(config)
await secrets.set(name, value)
await secrets.get(name)
await secrets.getMany(names)
await secrets.list()
await secrets.delete(name)
```

### Schema Builders

```typescript
import { encryptedTable, encryptedColumn, csValue } from "@cipherstash/stack/schema"

encryptedTable(tableName, columns)
encryptedColumn(columnName)        // returns ProtectColumn
csValue(valueName)                 // returns ProtectValue (for nested values)
```

## Subpath Exports

| Import Path | Provides |
|-------|-----|
| `@cipherstash/stack` | `Encryption` function (main entry point) |
| `@cipherstash/stack/schema` | `encryptedTable`, `encryptedColumn`, `csValue`, schema types |
| `@cipherstash/stack/identity` | `LockContext` class and identity types |
| `@cipherstash/stack/secrets` | `Secrets` class and secrets types |
| `@cipherstash/stack/client` | Client-safe exports (schema builders and types only - no native FFI) |
| `@cipherstash/stack/types` | All TypeScript types (`Encrypted`, `Decrypted`, `ClientConfig`, `EncryptionClientConfig`, query types, etc.) |

## Migration from @cipherstash/protect

If you are migrating from `@cipherstash/protect`, the following table maps the old API to the new one:

| `@cipherstash/protect` | `@cipherstash/stack` | Import Path |
|------------|-----------|-------|
| `protect(config)` | `Encryption(config)` | `@cipherstash/stack` |
| `csTable(name, cols)` | `encryptedTable(name, cols)` | `@cipherstash/stack/schema` |
| `csColumn(name)` | `encryptedColumn(name)` | `@cipherstash/stack/schema` |
| `import { LockContext } from "@cipherstash/protect/identify"` | `import { LockContext } from "@cipherstash/stack/identity"` | `@cipherstash/stack/identity` |
| N/A | `Secrets` class | `@cipherstash/stack/secrets` |
| N/A | `stash` CLI | `npx stash` |

All method signatures on the encryption client (`encrypt`, `decrypt`, `encryptModel`, etc.) remain the same. The `Result` pattern (`data` / `failure`) is unchanged.

## Requirements

- **Node.js** >= 18
- The package includes a native FFI module (`@cipherstash/protect-ffi`) written in Rust and embedded via [Neon](https://github.com/neon-bindings/neon). You must opt out of bundling this package in tools like Webpack, esbuild, or Next.js (`serverExternalPackages`).
- [Bun](https://bun.sh/) is not currently supported due to incomplete Node-API compatibility.

## License

MIT - see [LICENSE.md](https://github.com/cipherstash/protectjs/blob/main/LICENSE.md).
