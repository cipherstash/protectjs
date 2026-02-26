# Searchable encryption with CipherStash Encryption and PostgreSQL

This reference guide outlines the different query patterns you can use to search encrypted data with `@cipherstash/stack`.

## Table of contents

- [Prerequisites](#prerequisites)
- [What is EQL?](#what-is-eql)
- [Setting up your contract](#setting-up-your-contract)
- [The `encryptQuery` function](#the-encryptquery-function)
  - [Formatting encrypted query results with `returnType`](#formatting-encrypted-query-results-with-returntype)
- [Search capabilities](#search-capabilities)
  - [JSONB queries with searchableJson (recommended)](#jsonb-queries-with-searchablejson-recommended)
    - [JSONPath selector queries](#jsonpath-selector-queries)
    - [Containment queries](#containment-queries)
    - [Batch JSONB queries](#batch-jsonb-queries)
    - [Using JSONB queries in SQL](#using-jsonb-queries-in-sql)
    - [Advanced: Explicit query types](#advanced-explicit-query-types)
  - [Exact matching](#exact-matching)
  - [Free text search](#free-text-search)
  - [Sorting and range queries](#sorting-and-range-queries)
- [Implementation examples](#implementation-examples)
  - [Using Raw PostgreSQL Client (pg)](#using-raw-postgresql-client-pg)
  - [Using Supabase SDK](#using-supabase-sdk)
- [Best practices](#best-practices)
- [Common use cases](#common-use-cases)

## Prerequisites

Before you can use searchable encryption with PostgreSQL, you need to:

1. Install the [EQL custom types and functions](https://github.com/cipherstash/encrypt-query-language?tab=readme-ov-file#installation)
2. Set up your encryption contract with the appropriate search capabilities

> [!WARNING]
> The formal EQL repo documentation is heavily focused on the underlying custom function implementation.
> It also has a bias towards the [CipherStash Proxy](https://github.com/cipherstash/proxy) product, so this guide is the best place to get started when using `@cipherstash/stack`.

## What is EQL?

EQL (Encrypt Query Language) is a set of PostgreSQL extensions that enable searching and sorting on encrypted data. It provides:

- Custom data types for storing encrypted data
- Functions for comparing and searching encrypted values
- Support for range queries and sorting on encrypted data

When you install EQL, it adds these capabilities to your PostgreSQL database, allowing `@cipherstash/stack` to perform operations on encrypted data without decrypting it first.

> [!IMPORTANT]
> Any column that is encrypted with EQL must be of type `eql_v2_encrypted` which is included in the EQL extension.

## Setting up your contract

Define your encryption contract using `defineContract` to specify how each field should be encrypted and searched:

```typescript
import { defineContract, encrypted } from '@cipherstash/stack'

const contract = defineContract({
  users: {
    email: encrypted({
      type: 'string',
      equality: true,        // Enables exact matching
      freeTextSearch: true,   // Enables text search
      orderAndRange: true,    // Enables sorting and range queries
    }),
    phone: encrypted({
      type: 'string',
      equality: true,         // Only exact matching
    }),
    age: encrypted({
      type: 'number',
      orderAndRange: true,    // Only sorting and range queries
    }),
    metadata: encrypted({
      type: 'json',
      searchableJson: true,   // Enables encrypted JSONB queries (recommended for JSON columns)
    }),
  },
})
```

## The `encryptQuery` function

The `encryptQuery` function is used to create encrypted query terms for use in SQL queries.

**Single query** — pass a value and an options object:

| Property | Description |
|----------|-------------|
| `value` | The value to search for |
| `contract` | The contract column reference (e.g. `contract.users.email`) |
| `queryType` | _(optional)_ The query type — auto-inferred from the column's indexes when omitted |
| `returnType` | _(optional)_ The output format — `'eql'` (default), `'composite-literal'`, or `'escaped-composite-literal'` |

**Batch query** — pass an array of objects, each with the properties above (including `value`).

Example (single query):

```typescript
const term = await client.encryptQuery('user@example.com', {
  contract: contract.users.email,
})

if (term.failure) {
  // Handle the error
}

console.log(term.data) // encrypted query term
```

Example (batch query):

```typescript
const terms = await client.encryptQuery([
  { value: 'user@example.com', contract: contract.users.email },
  { value: '18', contract: contract.users.age },
])

if (terms.failure) {
  // Handle the error
}

console.log(terms.data) // array of encrypted query terms
```

### Formatting encrypted query results with `returnType`

By default, `encryptQuery` returns an `Encrypted` object (the raw EQL JSON payload). You can change the output format using the `returnType` option:

| `returnType` | Return type | Description |
|---|---|---|
| `'eql'` (default) | `Encrypted` object | Raw EQL JSON payload. Use with parameterized queries (`$1`) or ORMs that accept JSON objects. |
| `'composite-literal'` | `string` | PostgreSQL composite literal format `("json")`. Use with Supabase `.eq()` or other APIs that require a string value. |
| `'escaped-composite-literal'` | `string` | Escaped composite literal `"(\"json\")"`. Use when the query string will be embedded inside another string or JSON value. |

The return type of `encryptQuery` is `EncryptedQueryResult`, which is `Encrypted | string` depending on the `returnType`.

**Single query with `returnType`:**

```typescript
const term = await client.encryptQuery('user@example.com', {
  contract: contract.users.email,
  queryType: 'equality',
  returnType: 'composite-literal',
})

if (term.failure) {
  // Handle the error
}

// term.data is a string in composite literal format
await supabase.from('users').select().eq('email_encrypted', term.data)
```

**Batch query with `returnType`:**

Each term in a batch can have its own `returnType`:

```typescript
const terms = await client.encryptQuery([
  {
    value: 'user@example.com',
    contract: contract.users.email,
    queryType: 'equality',
    returnType: 'composite-literal',     // returns a string
  },
  {
    value: 'alice',
    contract: contract.users.email,
    queryType: 'freeTextSearch',          // returns an Encrypted object (default)
  },
])
```

## Search capabilities

### JSONB queries with searchableJson (recommended)

> [!TIP]
> **Using Drizzle ORM?** The `@cipherstash/drizzle` package provides higher-level JSONB operators (`jsonbPathQueryFirst`, `jsonbGet`, `jsonbPathExists`) that handle encryption automatically. See the [Drizzle JSONB query examples](./drizzle/drizzle.md#jsonb-queries-with-encrypted-data).

For columns storing JSON data, `searchableJson: true` is the recommended approach. It enables encrypted JSONB queries and automatically infers the correct query operation from the plaintext value type.

Use `encryptQuery` to create encrypted query terms for JSONB columns:

```typescript
const contract = defineContract({
  documents: {
    metadata: encrypted({
      type: 'json',
      searchableJson: true,  // Enables JSONB path and containment queries
    }),
  },
})
```

**How auto-inference works:**

| Plaintext type | Inferred operation | Use case |
|---|---|---|
| `string` (e.g. `'$.user.email'`) | `steVecSelector` | JSONPath selector queries |
| `object` (e.g. `{ role: 'admin' }`) | `steVecTerm` | Containment queries |
| `array` (e.g. `['admin', 'user']`) | `steVecTerm` | Containment queries |

#### JSONPath selector queries

Pass a string to `encryptQuery` to perform a JSONPath selector query. The string is automatically treated as a JSONPath selector.

```typescript
// Simple path query
const pathTerm = await client.encryptQuery('$.user.email', {
  contract: contract.documents.metadata,
})

// Nested path query
const nestedTerm = await client.encryptQuery('$.user.profile.role', {
  contract: contract.documents.metadata,
})

// Array index path query
const arrayTerm = await client.encryptQuery('$.items[0].name', {
  contract: contract.documents.metadata,
})
```

> [!TIP]
> Use the `toJsonPath` helper from `@cipherstash/stack` to convert dot-notation paths to JSONPath format:
>
> ```typescript
> import { toJsonPath } from '@cipherstash/stack'
>
> toJsonPath('user.email')     // '$.user.email'
> toJsonPath('$.user.email')   // '$.user.email' (unchanged)
> toJsonPath('name')           // '$.name'
> ```

#### Containment queries

Pass an object or array to `encryptQuery` to perform a containment query.

```typescript
// Key-value containment
const roleTerm = await client.encryptQuery({ role: 'admin' }, {
  contract: contract.documents.metadata,
})

// Nested object containment
const nestedTerm = await client.encryptQuery(
  { user: { profile: { role: 'admin' } } },
  {
    contract: contract.documents.metadata,
  }
)

// Array containment
const tagsTerm = await client.encryptQuery(['admin', 'user'], {
  contract: contract.documents.metadata,
})
```

> [!WARNING]
> Bare numbers and booleans are not supported as top-level `searchableJson` query values. Wrap them in an object or array.
> For `orderAndRange` queries, bare numbers are supported directly.
>
> ```typescript
> // Wrong for searchableJson - will fail (works for orderAndRange)
> await client.encryptQuery(42, { contract: contract.documents.metadata })
>
> // Correct - wrap in an object
> await client.encryptQuery({ value: 42 }, { contract: contract.documents.metadata })
> ```

<!-- -->

> [!TIP]
> Use the `buildNestedObject` helper to construct nested containment queries from dot-notation paths:
>
> ```typescript
> import { buildNestedObject } from '@cipherstash/stack'
>
> buildNestedObject('user.role', 'admin')
> // Returns: { user: { role: 'admin' } }
> ```

#### Batch JSONB queries

Use `encryptQuery` with an array to encrypt multiple JSONB query terms in a single call. Each item can have a different plaintext type:

```typescript
const terms = await client.encryptQuery([
  {
    value: '$.user.email',        // string → JSONPath selector
    contract: contract.documents.metadata,
  },
  {
    value: { role: 'admin' },     // object → containment
    contract: contract.documents.metadata,
  },
  {
    value: ['tag1', 'tag2'],      // array → containment
    contract: contract.documents.metadata,
  },
])

if (terms.failure) {
  // Handle the error
}

console.log(terms.data) // array of encrypted query terms
```

#### Using JSONB queries in SQL

To use encrypted JSONB query terms in PostgreSQL queries, you can either use the default `Encrypted` object with parameterized queries, or use `returnType: 'composite-literal'` to get a string formatted for direct use with Supabase or similar APIs.

**With parameterized queries (default `returnType`):**

```typescript
const term = await client.encryptQuery('$.user.email', {
  contract: contract.documents.metadata,
})

if (term.failure) {
  // Handle the error
}

// Pass the EQL object as a parameterized query value
const result = await pgClient.query(
  'SELECT * FROM documents WHERE cs_ste_vec_v2(metadata_encrypted) @> $1',
  [term.data]
)
```

**With Supabase or string-based APIs (`returnType: 'composite-literal'`):**

```typescript
const term = await client.encryptQuery('$.user.email', {
  contract: contract.documents.metadata,
  returnType: 'composite-literal',
})

if (term.failure) {
  // Handle the error
}

// term.data is a string — use directly with .eq(), .contains(), etc.
await supabase.from('documents').select().contains('metadata_encrypted', term.data)
```

This also works with batch queries — each term can specify its own `returnType`:

```typescript
const terms = await client.encryptQuery([
  {
    value: '$.user.email',
    contract: contract.documents.metadata,
    returnType: 'composite-literal',
  },
  {
    value: { role: 'admin' },
    contract: contract.documents.metadata,
    returnType: 'composite-literal',
  },
])
```

#### Advanced: Explicit query types

For advanced use cases, you can specify the query type explicitly instead of relying on auto-inference:

| Approach | `queryType` | When to use |
|---|---|---|
| **searchableJson** (recommended) | `'searchableJson'` or omitted | Auto-infers from plaintext type. Use for most JSONB queries. |
| **steVecSelector** (explicit) | `'steVecSelector'` | When you want to be explicit about JSONPath selector queries. |
| **steVecTerm** (explicit) | `'steVecTerm'` | When you want to be explicit about containment queries. |

```typescript
// Explicit steVecSelector
const selectorTerm = await client.encryptQuery('$.user.email', {
  contract: contract.documents.metadata,
  queryType: 'steVecSelector',
})

// Explicit steVecTerm
const containTerm = await client.encryptQuery({ role: 'admin' }, {
  contract: contract.documents.metadata,
  queryType: 'steVecTerm',
})
```

> [!NOTE]
> When a column uses `searchableJson: true`, string values passed to `encryptQuery` are treated as JSONPath selectors.
> If you need to query for a JSON string value itself, wrap it in an object or array:
>
> ```typescript
> // To find documents where a field contains the string "admin"
> const term = await client.encryptQuery(['admin'], {
>   contract: contract.documents.metadata,
>   queryType: 'steVecTerm',  // Explicit for clarity
> })
> ```

### Exact matching

Use `equality: true` when you need to find exact matches:

```typescript
// Find user with specific email
const term = await client.encryptQuery('user@example.com', {
  contract: contract.users.email,
})

if (term.failure) {
  // Handle the error
}

// SQL query
const result = await pgClient.query(
  'SELECT * FROM users WHERE email_encrypted = $1',
  [term.data]
)
```

### Free text search

Use `freeTextSearch: true` for text-based searches:

```typescript
// Search for users with emails containing "example"
const term = await client.encryptQuery('example', {
  contract: contract.users.email,
})

if (term.failure) {
  // Handle the error
}

// SQL query
const result = await pgClient.query(
  'SELECT * FROM users WHERE email_encrypted LIKE $1',
  [term.data]
)
```

### Sorting and range queries

Use `orderAndRange: true` for sorting and range operations:

> [!NOTE]
> When using ORDER BY with encrypted columns, you need to use the EQL v2 functions if your PostgreSQL database doesn't support EQL Operator families. For databases that support EQL Operator families, you can use ORDER BY directly with encrypted column names.

```typescript
// Get users sorted by age
const result = await client.query(
  'SELECT * FROM users ORDER BY eql_v2.ore_block_u64_8_256(age_encrypted) ASC'
)
```

## Implementation examples

### Using Raw PostgreSQL Client (pg)

```typescript
import { Client } from 'pg'
import { Encryption, defineContract, encrypted } from '@cipherstash/stack'

const contract = defineContract({
  users: {
    email: encrypted({
      type: 'string',
      equality: true,
      freeTextSearch: true,
      orderAndRange: true,
    }),
  },
})

const pgClient = new Client({
  // your connection details
})

const client = await Encryption({ contract })

// Insert encrypted data
const encryptedData = await client.encryptModel({
  email: 'user@example.com'
}, contract.users)

if (encryptedData.failure) {
  // Handle the error
}

await pgClient.query(
  'INSERT INTO users (email_encrypted) VALUES ($1::jsonb)',
  [encryptedData.data.email_encrypted]
)

// Search encrypted data
const searchTerm = await client.encryptQuery('example.com', {
  contract: contract.users.email,
})

if (searchTerm.failure) {
  // Handle the error
}

const result = await pgClient.query(
  'SELECT * FROM users WHERE email_encrypted LIKE $1',
  [searchTerm.data]
)

// Decrypt results
const decryptedData = await client.bulkDecryptModels(result.rows)
```

### Using Supabase SDK

For Supabase users, we provide a specific implementation guide. [Read more about using `@cipherstash/stack` with Supabase](./supabase-sdk.md).

## Best practices

1. **Contract Design**
   - Choose the right search capabilities for each field:
     - Use `equality: true` for exact matches (most efficient)
     - Use `freeTextSearch: true` for text-based searches (more expensive)
     - Use `orderAndRange: true` for numerical data and sorting (most expensive)
   - Only enable features you need to minimize performance impact
   - Use `eql_v2_encrypted` column type in your database schema for encrypted columns

2. **Security Considerations**
   - Never store unencrypted sensitive data
   - Keep your CipherStash secrets secure
   - Use parameterized queries to prevent SQL injection

3. **Performance**
   - Index your encrypted columns appropriately
   - Monitor query performance
   - Consider the impact of search operations on your database
   - Use bulk operations when possible
   - Cache frequently accessed data

4. **Error Handling**
   - Always check for failures with any `@cipherstash/stack` method
   - Handle encryption errors aggressively
   - Handle decryption errors gracefully

## Performance optimization

For optimal query performance on encrypted columns, ensure your PostgreSQL database has the EQL v2 extension installed and that encrypted columns use the `eql_v2_encrypted` type.

> [!NOTE]
> PostgreSQL index support for encrypted columns is evolving. Check the [EQL repository](https://github.com/cipherstash/encrypt-query-language) for the latest guidance on creating indexes for encrypted columns.

### Didn't find what you wanted?

[Click here to let us know what was missing from our docs.](https://github.com/cipherstash/protectjs/issues/new?template=docs-feedback.yml&title=[Docs:]%20Feedback%20on%searchable-encryption-postgres.md)
