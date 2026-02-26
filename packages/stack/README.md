# @cipherstash/stack

The all-in-one TypeScript SDK for the CipherStash data security stack.

[![npm version](https://img.shields.io/npm/v/@cipherstash/stack.svg?style=for-the-badge&labelColor=000000)](https://www.npmjs.com/package/@cipherstash/stack)
[![License: MIT](https://img.shields.io/npm/l/@cipherstash/stack.svg?style=for-the-badge&labelColor=000000)](https://github.com/cipherstash/protectjs/blob/main/LICENSE.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-first-blue?style=for-the-badge&labelColor=000000)](https://www.typescriptlang.org/)

--

## Table of Contents

- [Install](#install)
- [Quick Start](#quick-start)
- [Features](#features)
- [Contract Definition](#contract-definition)
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
import { Encryption, defineContract, encrypted } from "@cipherstash/stack"

// 1. Define a contract
const contract = defineContract({
  users: {
    email: encrypted({ type: "string", equality: true, freeTextSearch: true }),
  },
})

// 2. Create a client (reads CS_* env vars automatically)
const client = await Encryption({ contract })

// 3. Encrypt a value
const encrypted = await client.encrypt("hello@example.com", {
  contract: contract.users.email,
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
- **TypeScript-first** - Strongly typed contracts, results, and model operations with full generics support.

## Contract Definition

Define which tables and columns to encrypt using `defineContract` and `encrypted` from `@cipherstash/stack`.

```typescript
import { defineContract, encrypted } from "@cipherstash/stack"

const contract = defineContract({
  users: {
    email: encrypted({
      type: "string",
      equality: true,        // exact-match queries
      freeTextSearch: true,   // full-text search queries
      orderAndRange: true,    // sorting and range queries
    }),
  },
  documents: {
    metadata: encrypted({
      type: "json",
      searchableJson: true,   // encrypted JSONB queries (JSONPath + containment)
    }),
  },
})
```

### Index Types

| Config Key | Purpose | Query Type |
|----|-----|------|
| `equality: true` | Exact match lookups | `'equality'` |
| `freeTextSearch: true` | Full-text / fuzzy search | `'freeTextSearch'` |
| `orderAndRange: true` | Sorting, comparison, range queries | `'orderAndRange'` |
| `searchableJson: true` | Encrypted JSONB path and containment queries | `'searchableJson'` |
| `type: cast` | Set the plaintext data type (`'string'`, `'number'`, `'boolean'`, `'date'`, `'bigint'`, `'json'`) | N/A |

Multiple index types can be enabled on a single column by setting each config key to `true`.

## Encryption and Decryption

### Single Values

```typescript
// Encrypt
const encrypted = await client.encrypt("secret@example.com", {
  contract: contract.users.email,
})

// Decrypt
const decrypted = await client.decrypt(encrypted.data)
```

### Model Operations

Encrypt or decrypt an entire object. Only fields matching your contract are encrypted; other fields pass through unchanged.

The return type is **contract-aware**: fields matching the table contract are typed as `Encrypted`, while other fields retain their original types. For best results, let TypeScript infer the type parameters from the arguments:

```typescript
type User = { id: string; email: string; createdAt: Date }

const user = {
  id: "user_123",
  email: "alice@example.com",  // defined in contract -> encrypted
  createdAt: new Date(),       // not in contract -> unchanged
}

// Let TypeScript infer the return type from the contract
const encryptedResult = await client.encryptModel(user, contract.users)
// encryptedResult.data.email    -> Encrypted
// encryptedResult.data.id       -> string
// encryptedResult.data.createdAt -> Date

// Decrypt a model
const decryptedResult = await client.decryptModel(encryptedResult.data)
```

### Bulk Operations

All bulk methods make a single call to ZeroKMS regardless of the number of records, while still using a unique key per value.

#### Bulk Encrypt / Decrypt (raw values)

```typescript
const plaintexts = [
  { id: "u1", plaintext: "alice@example.com" },
  { id: "u2", plaintext: "bob@example.com" },
  { id: "u3", plaintext: "charlie@example.com" },
]

const encrypted = await client.bulkEncrypt(plaintexts, {
  contract: contract.users.email,
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

const encrypted = await client.bulkEncryptModels(userModels, contract.users)
const decrypted = await client.bulkDecryptModels(encrypted.data)
```

## Searchable Encryption

Encrypt a query term so you can search encrypted data in PostgreSQL.

```typescript
// Equality query
const eqQuery = await client.encryptQuery("alice@example.com", {
  contract: contract.users.email,
  queryType: "equality",
})

// Free-text search
const matchQuery = await client.encryptQuery("alice", {
  contract: contract.users.email,
  queryType: "freeTextSearch",
})

// Order and range
const rangeQuery = await client.encryptQuery("alice@example.com", {
  contract: contract.users.email,
  queryType: "orderAndRange",
})
```

### Searchable JSON

For columns using `searchableJson: true`, the query type is auto-inferred from the plaintext:

```typescript
// String -> JSONPath selector query
const pathQuery = await client.encryptQuery("$.user.email", {
  contract: contract.documents.metadata,
})

// Object/Array -> containment query
const containsQuery = await client.encryptQuery({ role: "admin" }, {
  contract: contract.documents.metadata,
})
```

### Batch Query Encryption

Encrypt multiple query terms in one call:

```typescript
const terms = [
  { value: "alice@example.com", contract: contract.users.email, queryType: "equality" as const },
  { value: "bob",               contract: contract.users.email, queryType: "freeTextSearch" as const },
]

const results = await client.encryptQuery(terms)
```

### Query Result Formatting (`returnType`)

By default `encryptQuery` returns an `Encrypted` object (the raw EQL JSON payload). Use `returnType` to change the output format:

| `returnType` | Output | Use case |
|---|---|---|
| `'eql'` (default) | `Encrypted` object | Parameterized queries, ORMs accepting JSON |
| `'composite-literal'` | `string` | Supabase `.eq()`, string-based APIs |
| `'escaped-composite-literal'` | `string` | Embedding inside another string or JSON value |

```typescript
// Get a composite literal string for use with Supabase
const term = await client.encryptQuery("alice@example.com", {
  contract: contract.users.email,
  queryType: "equality",
  returnType: "composite-literal",
})

// term.data is a string — use directly with .eq()
await supabase.from("users").select().eq("email", term.data)
```

Each term in a batch can have its own `returnType`.

### PostgreSQL / Drizzle Integration Pattern

Encrypted data is stored as an [EQL](https://github.com/cipherstash/encrypt-query-language) JSON payload. Install the EQL extension in PostgreSQL to enable searchable queries, then store encrypted data in `eql_v2_encrypted` columns.

The `@cipherstash/stack/drizzle` module provides `encryptedType` for defining encrypted columns, `extractContract` for extracting a contract from a Drizzle table, and `createEncryptionOperators` for querying them:

```typescript
import { pgTable, integer, timestamp } from "drizzle-orm/pg-core"
import { encryptedType, extractContract, createEncryptionOperators } from "@cipherstash/stack/drizzle"
import { Encryption } from "@cipherstash/stack"

// Define schema with encrypted columns
const usersTable = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  email: encryptedType<string>("email", {
    equality: true,
    freeTextSearch: true,
    orderAndRange: true,
  }),
  profile: encryptedType<{ name: string; bio: string }>("profile", {
    dataType: "json",
    searchableJson: true,
  }),
})

// Initialize
const contract = extractContract(usersTable)
const client = await Encryption({ contract })
const ops = createEncryptionOperators(client)

// Query with auto-encrypting operators
const results = await db.select().from(usersTable)
  .where(await ops.eq(usersTable.email, "alice@example.com"))

// JSONB queries on encrypted JSON columns
const jsonResults = await db.select().from(usersTable)
  .where(await ops.jsonbPathExists(usersTable.profile, "$.bio"))
```

#### Drizzle `encryptedType` Config Options

| Option | Type | Description |
|---|---|---|
| `dataType` | `"string"` \| `"number"` \| `"json"` | Plaintext data type (default: `"string"`) |
| `equality` | `boolean` \| `TokenFilter[]` | Enable equality index |
| `freeTextSearch` | `boolean` \| `MatchIndexOpts` | Enable free-text search index |
| `orderAndRange` | `boolean` | Enable ORE index for sorting/range queries |
| `searchableJson` | `boolean` | Enable JSONB path queries (requires `dataType: "json"`) |

#### Drizzle JSONB Operators

For columns with `searchableJson: true`, three JSONB operators are available:

| Operator | Description |
|---|---|
| `jsonbPathExists(col, selector)` | Check if a JSONB path exists (boolean, use in `WHERE`) |
| `jsonbPathQueryFirst(col, selector)` | Extract first value at a JSONB path |
| `jsonbGet(col, selector)` | Get value using the JSONB `->` operator |

These operators encrypt the JSON path selector using the `steVecSelector` query type and cast it to `eql_v2_encrypted` for use with the EQL PostgreSQL functions.

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
  .encrypt("sensitive data", { contract: contract.users.email })
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
import { Encryption, defineContract, encrypted } from "@cipherstash/stack"

const contract = defineContract({
  users: {
    email: encrypted({ type: "string", equality: true }),
  },
})

const client = await Encryption({
  contract,
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
  contract,
  config: {
    keyset: { id: "123e4567-e89b-12d3-a456-426614174000" },
  },
})

// or by name
const client2 = await Encryption({
  contract,
  config: {
    keyset: { name: "Company A" },
  },
})
```

### Logging

The SDK uses structured logging across all interfaces (Encryption, Secrets, Supabase, DynamoDB). Each operation emits a single wide event with context such as the operation type, table, column, lock context status, and duration.

Configure the log level with the `STASH_STACK_LOG` environment variable:

```bash
STASH_STACK_LOG=error  # debug | info | error (default: error)
```

| Value   | What is logged         |
| ------- | ---------------------- |
| `error` | Errors only (default)  |
| `info`  | Info and errors        |
| `debug` | Debug, info, and errors |

When `STASH_STACK_LOG` is not set, the SDK defaults to `error` (errors only).

The SDK never logs plaintext data.

## Error Handling

All async methods return a `Result` object with either a `data` key (success) or a `failure` key (error). This is a discriminated union - you never get both.

```typescript
const result = await client.encrypt("hello", { contract: contract.users.email })

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
| `encrypt` | `(plaintext, { contract })` | `EncryptOperation` (thenable) |
| `decrypt` | `(encryptedData)` | `DecryptOperation` (thenable) |
| `encryptQuery` | `(plaintext, { contract, queryType?, returnType? })` | `EncryptQueryOperation` (thenable) |
| `encryptQuery` | `(terms: ScalarQueryTerm[])` | `BatchEncryptQueryOperation` (thenable) |
| `encryptModel` | `(model, contractTableRef)` | `EncryptModelOperation<EncryptedFromContract<T, C>>` (thenable) |
| `decryptModel` | `(encryptedModel)` | `DecryptModelOperation<T>` (thenable) |
| `bulkEncrypt` | `(plaintexts, { contract })` | `BulkEncryptOperation` (thenable) |
| `bulkDecrypt` | `(encryptedPayloads)` | `BulkDecryptOperation` (thenable) |
| `bulkEncryptModels` | `(models, contractTableRef)` | `BulkEncryptModelsOperation<EncryptedFromContract<T, C>>` (thenable) |
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

### `defineContract`

```typescript
import { defineContract, encrypted } from "@cipherstash/stack"

const contract = defineContract({
  tableName: {
    columnName: encrypted({ type: "string", equality: true, freeTextSearch: true }),
  },
})
```

Returns a `ResolvedContract` with typed access to table and column references:
- `contract.tableName` - a `ContractTableRef` for use with `encryptModel` / `bulkEncryptModels`
- `contract.tableName.columnName` - a `ContractColumnRef` for use with `encrypt`, `encryptQuery`, `bulkEncrypt`

## Subpath Exports

| Import Path | Provides |
|-------|-----|
| `@cipherstash/stack` | `Encryption` function, `defineContract` function, `encrypted` helper (main entry point) |
| `@cipherstash/stack/schema` | Internal/advanced: `encryptedTable`, `encryptedColumn`, `csValue`, schema types |
| `@cipherstash/stack/drizzle` | `encryptedType`, `extractContract`, `extractEncryptionSchema`, `createEncryptionOperators` |
| `@cipherstash/stack/identity` | `LockContext` class and identity types |
| `@cipherstash/stack/secrets` | `Secrets` class and secrets types |
| `@cipherstash/stack/client` | Client-safe exports (`defineContract`, `encrypted`, contract types - no native FFI) |
| `@cipherstash/stack/types` | All TypeScript types (`Encrypted`, `Decrypted`, `ClientConfig`, `EncryptionClientConfig`, query types, etc.) |

## Migration from @cipherstash/protect

If you are migrating from `@cipherstash/protect` or the previous `@cipherstash/stack` schema-based API, the following table maps the old APIs to the new contract-based API:

| Old API | New API | Import Path |
|------------|-----------|-------|
| `protect(config)` | `Encryption({ contract })` | `@cipherstash/stack` |
| `csTable(name, cols)` / `encryptedTable(name, cols)` | `defineContract({ name: { ... } })` | `@cipherstash/stack` |
| `csColumn(name)` / `encryptedColumn(name)` | `encrypted({ type: "string", ... })` helper | `@cipherstash/stack` |
| `Encryption({ schemas: [table] })` | `Encryption({ contract })` | `@cipherstash/stack` |
| `{ column: table.col, table: table }` | `{ contract: contract.table.col }` | N/A |
| `client.encryptModel(model, table)` | `client.encryptModel(model, contract.table)` | N/A |
| `import { LockContext } from "@cipherstash/protect/identify"` | `import { LockContext } from "@cipherstash/stack/identity"` | `@cipherstash/stack/identity` |
| N/A | `Secrets` class | `@cipherstash/stack/secrets` |
| N/A | `stash` CLI | `npx stash` |

All method signatures on the encryption client (`encrypt`, `decrypt`, `encryptModel`, etc.) now use `contract` references instead of `column`/`table` pairs. The `Result` pattern (`data` / `failure`) is unchanged.

## Requirements

- **Node.js** >= 18
- The package includes a native FFI module (`@cipherstash/protect-ffi`) written in Rust and embedded via [Neon](https://github.com/neon-bindings/neon). You must opt out of bundling this package in tools like Webpack, esbuild, or Next.js (`serverExternalPackages`).

## License

MIT - see [LICENSE.md](https://github.com/cipherstash/protectjs/blob/main/LICENSE.md).
