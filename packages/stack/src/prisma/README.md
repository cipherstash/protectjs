# `@cipherstash/stack/prisma`

> Data-level access control for Prisma Next. Every sensitive value encrypted with a unique key. Searchable on existing Postgres indexes. A breach yields ciphertext, nothing useful.

> This README is the source of truth for usage. The architectural reference is [`notes/cipherstash-prisma-integration-plan-v2.md`](../../../../notes/cipherstash-prisma-integration-plan-v2.md).

## What this is

CipherStash makes access control cryptographic. The rules aren't configured — they're enforced. `@cipherstash/stack/prisma` is the [Prisma Next](https://github.com/prisma/prisma-next) integration: searchable, application-layer field-level encryption backed by CipherStash's open-source [EQL](https://github.com/cipherstash/encrypt-query-language) extension and ZeroKMS for key management.

Plaintext goes in, ciphertext lands in Postgres. Range queries, exact match, and free-text fuzzy search run over encrypted columns natively, with sub-millisecond overhead on existing Postgres indexes. The integration is a single Prisma Next extension pack — no middleware, no manual `bulkEncrypt` / `bulkDecrypt` calls, no separate query builder.

Per-value decryption policies tied to caller identity are part of CipherStash's full data-level access control model; identity-binding (`LockContext`) is deferred from this initial rollout and returns when decryption policies land server-side.

## Install

```bash
pnpm add @cipherstash/stack
# pnpm add @prisma-next/cli @prisma-next/sql-runtime @prisma-next/family-sql @prisma-next/sql-contract-ts @prisma-next/target-postgres @prisma-next/adapter-postgres
```

Prisma Next is currently consumed via vendored type shapes (see `src/prisma/internal-types/prisma-next.ts`); the peer-dependency block above is commented out until Prisma Next ships to npm.

## Setup

### 1. Required env vars

```bash
CS_WORKSPACE_CRN=crn:<region>.aws:<workspace-id>
CS_CLIENT_ID=<client-id>
CS_CLIENT_KEY=<client-key>
CS_CLIENT_ACCESS_KEY=<access-key>      # only required for bootstrap operations
```

These come from the CipherStash dashboard. The integration validates the first three synchronously when the extension is constructed; missing variables throw a `CipherStashCodecError` with `code: 'CONFIG_MISSING_ENV'` listing every absent variable.

### 2. `prisma-next.config.ts`

```ts
import { defineConfig } from '@prisma-next/cli/config-types'
import postgresAdapter from '@prisma-next/adapter-postgres/control'
import sql from '@prisma-next/family-sql/control'
import postgres from '@prisma-next/target-postgres/control'
import cipherstashEncryption from '@cipherstash/stack/prisma/control'

export default defineConfig({
  family: sql,
  target: postgres,
  adapter: postgresAdapter,
  extensionPacks: [cipherstashEncryption],
})
```

### 3. `contract.ts`

```ts
import { int4Column, timestamptzColumn } from '@prisma-next/adapter-postgres/column-types'
import sqlFamily from '@prisma-next/family-sql/pack'
import postgres from '@prisma-next/target-postgres/pack'
import { defineContract, field, model } from '@prisma-next/sql-contract-ts/contract-builder'
import cipherstashEncryption from '@cipherstash/stack/prisma/pack'
import {
  encryptedBoolean,
  encryptedDate,
  encryptedJson,
  encryptedNumber,
  encryptedString,
} from '@cipherstash/stack/prisma/column-types'

export const contract = defineContract({
  family: sqlFamily,
  target: postgres,
  extensionPacks: { cipherstashEncryption },
  models: {
    User: model('User', {
      fields: {
        id:        field.column(int4Column).id(),
        email:     field.column(encryptedString({ equality: true, freeTextSearch: true })),
        age:       field.column(encryptedNumber({ orderAndRange: true })).optional(),
        isActive:  field.column(encryptedBoolean({ equality: true })).optional(),
        createdAt: field.column(encryptedDate({ orderAndRange: true })),
        profile:   field.column(
          encryptedJson<{ name: string; bio: string }>({ searchableJson: true }),
        ).optional(),
      },
    }).sql({ table: 'users' }),
  },
})
```

The five column factories cover the supported plaintext types. Pass the JSON shape as a type argument to `encryptedJson<T>(...)` so `Decrypted<typeof contract, 'User'>['profile']` resolves to `T` rather than `unknown`.

### 4. `db.ts`

```ts
import postgres from '@prisma-next/postgres/runtime'
import cipherstashEncryption from '@cipherstash/stack/prisma/runtime'
import type { Contract } from './contract.d'
import contractJson from './contract.json' with { type: 'json' }
import { contract } from './contract'

export const db = postgres<Contract>({
  contractJson,
  extensions: [cipherstashEncryption({ contract })],
})
```

That is the entire setup. The extension reads the contract, derives one `EncryptedTable` per encrypted column, validates env vars, and binds a fresh `EncryptionClient` to itself.

### 5. Migrations

```bash
pnpm prisma-next db migrate
```

The first run installs EQL via `databaseDependencies.init` (vendored `eql-2.2.1`). Subsequent runs regenerate per-column index DDL via `planTypeOperations`. Both steps are idempotent — re-running the same plan against an already-installed schema is a no-op.

## Usage

### Insert

```ts
await db.orm.User.createMany({
  data: [
    { email: 'alice@example.com', age: 30, createdAt: new Date(), isActive: true,
      profile: { name: 'Alice', bio: 'Dev' } },
    { email: 'bob@example.com', age: 42, createdAt: new Date(), isActive: false,
      profile: { name: 'Bob', bio: 'Ops' } },
  ],
})
```

Plaintext goes in. The codec encrypts every encrypted-column cell and the runtime issues one ZeroKMS round-trip per `createMany` call (microtask batching coalesces all in-flight `encode` calls into a single dispatch).

### Equality query

```ts
import { param } from '@prisma-next/sql-query/param'

const alice = await db.orm.User
  .where(u => u.email.eq(param('e')))
  .first({ params: { e: 'alice@example.com' } })
```

The fluent form parameterizes the value through the `eq-term` codec and lowers to `eql_v2.eq(email, $1::eql_v2_encrypted)` SQL. The shorthand `where({ email: 'alice@example.com' })` is **not yet supported** — Prisma Next inlines literal values without consulting the codec, so the encrypted column rejects shorthand at parse time with a framework-level error. Use the fluent form for now.

### Range query

```ts
const adults = await db.orm.User
  .where(u => u.age.gte(param('min')))
  .all({ params: { min: 18 } })
```

`.gt()` / `.gte()` / `.lt()` / `.lte()` / `.between()` / `.notBetween()` are surfaced on columns whose `typeParams.orderAndRange === true`. Argument types match the column's `dataType` — `Date` for `encryptedDate`, `number` for `encryptedNumber`.

### Free-text search

```ts
const matches = await db.orm.User
  .where(u => u.email.ilike(param('q')))
  .all({ params: { q: 'example.com' } })
```

`.like()` / `.ilike()` / `.notIlike()` are surfaced on `encryptedString({ freeTextSearch: true })` columns.

### JSONB selectors

```ts
const devs = await db.orm.User
  .where(u => u.profile.pathExists(param('sel')))
  .all({ params: { sel: '$.bio ? (@ == "Dev")' } })
```

`.pathExists()` / `.pathQueryFirst()` / `.get()` are surfaced on `encryptedJson({ searchableJson: true })` columns. (The internal method names mirror EQL's SQL functions: `jsonbPathExists`, `jsonbPathQueryFirst`, `jsonbGet`.)

### Reads

Rows arrive with encrypted columns already decrypted — no `bulkDecryptModels` call:

```ts
const user = await db.orm.User.where(/* … */).first()
console.log(user.email)         // 'alice@example.com'
console.log(user.profile.name)  // 'Alice' (typed via `encryptedJson<{ name; bio }>`)
```

Use the `Decrypted<Contract, Model>` type helper when typing function signatures around decrypted rows:

```ts
import type { Decrypted } from '@cipherstash/stack/prisma/codec-types'

type DecryptedUser = Decrypted<typeof contract, 'User'>

function welcome(user: DecryptedUser) {
  console.log(user.email.toLowerCase())  // string
  console.log(user.profile.name)         // typed via encryptedJson<T>
}
```

## Multi-tenancy

Each `cipherstashEncryption({ encryptionClient, contract })` call binds a specific client instance to that extension instance. There is no module-level singleton — two extensions live side-by-side without cross-talk.

For per-tenant key isolation, construct one extension per tenant and route requests through the right `db` instance:

```ts
import { Encryption } from '@cipherstash/stack'

async function tenantDb(tenant: { id: string; keysetName: string }) {
  const tenantClient = await Encryption({
    schemas: [/* extracted from contract */],
    config: { keyset: { name: tenant.keysetName } },
  })
  return postgres<Contract>({
    contractJson,
    extensions: [
      cipherstashEncryption({ encryptionClient: tenantClient, contract }),
    ],
  })
}
```

Calls flowing through `tenantDb('a')` only ever reach client A; calls flowing through `tenantDb('b')` only reach client B.

## Observability

Pass an `onEvent` callback to capture every ZeroKMS round-trip:

```ts
cipherstashEncryption({
  contract,
  onEvent(event) {
    metrics.histogram('cipherstash.duration_ms', event.durationMs, {
      kind: event.kind,
      table: event.table,
      column: event.column,
      ok: event.error === undefined,
    })
  },
})
```

The event payload:

```ts
{
  kind: 'bulkEncrypt' | 'bulkDecrypt' | 'encryptQuery'
  codecId: string                     // e.g. 'cs/eql_v2_encrypted@1'
  batchSize: number                   // values in this batch
  durationMs: number                  // wall-clock time of the SDK call
  table: string | undefined           // resolved Postgres table name
  column: string | undefined          // resolved Postgres column name
  error: unknown | undefined          // populated on failure
}
```

When `onEvent` is omitted, the default behaviour is silent in production (`NODE_ENV === 'production'`) and `console.debug(...)` per round-trip in dev. The default never logs plaintext or ciphertext.

## What's not yet supported

| Feature | Status |
|---|---|
| Shorthand `where({ email: '…' })` on encrypted columns | Deferred — Prisma Next inlines literals; pending an upstream `preferParam` trait. Use the fluent `.eq(param(…))` form. |
| `inArray` on encrypted columns | Deferred — no `eql_v2.in_array` SQL function exists in EQL. Compose `or(...)` of `.eq()` calls or open an issue. |
| `.order()` / `.asc()` / `.desc()` on ORE columns | Deferred — Prisma Next's fluent column-side ordering surface is unstable post-#379. Fall back to a raw SQL fragment via `sqlExpression\`eql_v2.order_by(${col}) DESC\``. |
| Identity-aware encryption (`LockContext`) | Deferred — returning when decryption policies land server-side. |
| Cross-row decode batching | Deferred until upstream [TML-2330](https://linear.app/prisma-company/issue/TML-2330) lands. Within-row batching (i.e. one ZeroKMS call per `decodeRow`) is shipped. |

## Errors

Errors raised by the integration are instances of `CipherStashCodecError`:

```ts
import { CipherStashCodecError } from '@cipherstash/stack/prisma'

try {
  await db.orm.User.createMany({ data: [{ email: 'alice@example.com' }] })
} catch (err) {
  if (err instanceof CipherStashCodecError) {
    console.log(err.code)              // discriminator (see below)
    console.log(err.column)            // resolved column name when known
    console.log(err.expectedDataType)  // 'string' | 'number' | …
    console.log(err.actualType)        // JS-runtime type observed
    console.log(err.cause)             // wrapped underlying error
  }
}
```

| `code` | Cause |
|---|---|
| `UNSUPPORTED_PLAINTEXT_TYPE` | Value type not in `string \| number \| boolean \| Date \| object` (e.g. `bigint`, `symbol`, `function`). |
| `JS_TYPE_MISMATCH` | Value's runtime type doesn't match the contract column's declared `dataType` (e.g. `string` into a `number` column on a query term). |
| `INVALID_QUERY_TERM` | `encryptQuery` rejected the term — usually a backend / schema mismatch. |
| `DECODE_ROUND_TRIP_BROKEN` | `bulkDecrypt` rejected the cipher (wrong workspace, expired keys, ZeroKMS network). The `cause` carries the SDK's structured error. |
| `NO_COLUMN_FOR_DATATYPE` | The contract has no encrypted column matching the JS-runtime data type the codec saw at encode time. Add a column of that type, or check the value before encoding. |
| `CONFIG_MISSING_ENV` | `cipherstashEncryption()` was constructed without `encryptionClient` and one or more required env vars are absent. The message names every missing variable on a single line. |
| `NO_CONTRACT_SCHEMAS` | Default-client construction was requested but the contract declared no encrypted columns. Add an encrypted column or pass a pre-constructed `encryptionClient`. |

### Common misconfigurations

- **Missing env vars** — `CONFIG_MISSING_ENV` raised at extension construction time, not deep in a request handler. Fix by exporting the vars or passing `encryptionClient` directly.
- **Empty contract** — `cipherstashEncryption({ contract })` succeeds but the first encode raises `NO_COLUMN_FOR_DATATYPE`. Add at least one encrypted column.
- **Mismatched data type** — `encryptedNumber({...})` column receives a `string`. The match-term, ORE-term, and STE-vec codecs reject mismatched values eagerly with `JS_TYPE_MISMATCH`; the storage codec falls back to JS-runtime dispatch.

## Imports

| Path | Use |
|---|---|
| `@cipherstash/stack/prisma/control` | Build-time / migration planner. Used in `prisma-next.config.ts`. |
| `@cipherstash/stack/prisma/runtime` | Runtime extension. Used in `db.ts`. |
| `@cipherstash/stack/prisma/pack` | Pack metadata. Used in `contract.ts`. |
| `@cipherstash/stack/prisma/column-types` | `encryptedString` / `encryptedNumber` / etc. Used in `contract.ts`. |
| `@cipherstash/stack/prisma/codec-types` | Type-only: `Decrypted<Contract, Model>`, `JsTypeFor`, `CodecTypes`. |
| `@cipherstash/stack/prisma/operation-types` | Type-only: `OperationTypes` for the contract emitter. |
| `@cipherstash/stack/prisma` | Convenience barrel re-exporting everything. Prefer the subpaths in production code so bundlers can tree-shake the EQL bundle out of browser builds. |
