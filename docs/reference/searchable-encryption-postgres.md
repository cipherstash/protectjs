# Searchable encryption with Protect.js and PostgreSQL

This reference guide outlines the different query patterns you can use to search encrypted data with Protect.js.

## Table of contents

- [Prerequisites](#prerequisites)
- [What is EQL?](#what-is-eql)
- [Setting up your schema](#setting-up-your-schema)
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
2. Set up your Protect.js schema with the appropriate search capabilities

> [!WARNING]
> The formal EQL repo documentation is heavily focused on the underlying custom function implementation. 
> It also has a bias towards the [CipherStash Proxy](https://github.com/cipherstash/proxy) product, so this guide is the best place to get started when using Protect.js.

## What is EQL?

EQL (Encrypt Query Language) is a set of PostgreSQL extensions that enable searching and sorting on encrypted data. It provides:

- Custom data types for storing encrypted data
- Functions for comparing and searching encrypted values
- Support for range queries and sorting on encrypted data

When you install EQL, it adds these capabilities to your PostgreSQL database, allowing Protect.js to perform operations on encrypted data without decrypting it first.

> [!IMPORTANT]
> Any column that is encrypted with EQL must be of type `eql_v2_encrypted` which is included in the EQL extension.

## Setting up your schema

Define your Protect.js schema using `csTable` and `csColumn` to specify how each field should be encrypted and searched:

```typescript
import { protect, csTable, csColumn } from '@cipherstash/protect'

const schema = csTable('users', {
  email: csColumn('email_encrypted')
    .equality()        // Enables exact matching
    .freeTextSearch()  // Enables text search
    .orderAndRange(),  // Enables sorting and range queries
  phone: csColumn('phone_encrypted')
    .equality(),       // Only exact matching
  age: csColumn('age_encrypted')
    .orderAndRange(),  // Only sorting and range queries
  metadata: csColumn('metadata_encrypted')
    .searchableJson(), // Enables encrypted JSONB queries (recommended for JSON columns)
})
```

## The `createSearchTerms` function

The `createSearchTerms` function is used to create search terms used in the SQL query.

The function takes an array of objects, each with the following properties:

| Property | Description |
|----------|-------------|
| `value` | The value to search for |
| `column` | The column to search in |
| `table` | The table to search in |
| `returnType` | The type of return value to expect from the SQL query. Required for PostgreSQL composite types. |

**Return types:**

- `eql` (default) - EQL encrypted payload
- `composite-literal` - EQL encrypted payload wrapped in a composite literal
- `escaped-composite-literal` - EQL encrypted payload wrapped in an escaped composite literal

Example:

```typescript
const term = await protectClient.createSearchTerms([{
  value: 'user@example.com',
  column: schema.email,
  table: schema,
  returnType: 'composite-literal'
}, {
  value: '18',
  column: schema.age,
  table: schema,
  returnType: 'composite-literal'
}])

if (term.failure) {
  // Handle the error
}

console.log(term.data) // array of search terms
```

> [!NOTE]
> As a developer, you must track the index of the search term in the array when using the `createSearchTerms` function.

## Search capabilities

### JSONB queries with searchableJson (recommended)

For columns storing JSON data, `.searchableJson()` is the recommended approach. It enables encrypted JSONB queries and automatically infers the correct query operation from the plaintext value type.

Use `encryptQuery` to create encrypted query terms for JSONB columns:

```typescript
const documents = csTable('documents', {
  metadata: csColumn('metadata_encrypted')
    .searchableJson()  // Enables JSONB path and containment queries
})
```

**How auto-inference works:**

| Plaintext type | Inferred operation | Use case |
|---|---|---|
| `string` (e.g. `'$.user.email'`) | `steVecSelector` | JSONPath selector queries |
| `object` (e.g. `{ role: 'admin' }`) | `steVecTerm` | Containment queries |
| `array` (e.g. `['admin', 'user']`) | `steVecTerm` | Containment queries |
| `null` | Returns `null` | Null handling |

#### JSONPath selector queries

Pass a string to `encryptQuery` to perform a JSONPath selector query. The string is automatically treated as a JSONPath selector.

```typescript
// Simple path query
const pathTerm = await protectClient.encryptQuery('$.user.email', {
  column: documents.metadata,
  table: documents,
})

// Nested path query
const nestedTerm = await protectClient.encryptQuery('$.user.profile.role', {
  column: documents.metadata,
  table: documents,
})

// Array index path query
const arrayTerm = await protectClient.encryptQuery('$.items[0].name', {
  column: documents.metadata,
  table: documents,
})
```

> [!TIP]
> Use the `toJsonPath` helper from `@cipherstash/protect` to convert dot-notation paths to JSONPath format:
>
> ```typescript
> import { toJsonPath } from '@cipherstash/protect'
>
> toJsonPath('user.email')     // '$.user.email'
> toJsonPath('$.user.email')   // '$.user.email' (unchanged)
> toJsonPath('name')           // '$.name'
> ```

#### Containment queries

Pass an object or array to `encryptQuery` to perform a containment query.

```typescript
// Key-value containment
const roleTerm = await protectClient.encryptQuery({ role: 'admin' }, {
  column: documents.metadata,
  table: documents,
})

// Nested object containment
const nestedTerm = await protectClient.encryptQuery(
  { user: { profile: { role: 'admin' } } },
  {
    column: documents.metadata,
    table: documents,
  }
)

// Array containment
const tagsTerm = await protectClient.encryptQuery(['admin', 'user'], {
  column: documents.metadata,
  table: documents,
})
```

> [!WARNING]
> Bare numbers and booleans are not supported as top-level query values. Wrap them in an object or array:
>
> ```typescript
> // Wrong - will fail
> await protectClient.encryptQuery(42, { column: documents.metadata, table: documents })
>
> // Correct - wrap in an object
> await protectClient.encryptQuery({ value: 42 }, { column: documents.metadata, table: documents })
> ```

<!-- -->

> [!TIP]
> Use the `buildNestedObject` helper to construct nested containment queries from dot-notation paths:
>
> ```typescript
> import { buildNestedObject } from '@cipherstash/protect'
>
> buildNestedObject('user.role', 'admin')
> // Returns: { user: { role: 'admin' } }
> ```

#### Batch JSONB queries

Use `encryptQuery` with an array to encrypt multiple JSONB query terms in a single call. Each item can have a different plaintext type:

```typescript
const terms = await protectClient.encryptQuery([
  {
    value: '$.user.email',        // string → JSONPath selector
    column: documents.metadata,
    table: documents,
  },
  {
    value: { role: 'admin' },     // object → containment
    column: documents.metadata,
    table: documents,
  },
  {
    value: ['tag1', 'tag2'],      // array → containment
    column: documents.metadata,
    table: documents,
  },
])

if (terms.failure) {
  // Handle the error
}

console.log(terms.data) // array of encrypted query terms
```

#### Using JSONB queries in SQL

To use encrypted JSONB query terms in PostgreSQL queries, specify `returnType: 'composite-literal'` to get the terms formatted for direct use in SQL:

```typescript
const term = await protectClient.encryptQuery([{
  value: '$.user.email',
  column: documents.metadata,
  table: documents,
  returnType: 'composite-literal',
}])

if (term.failure) {
  // Handle the error
}

// Use the encrypted term in a PostgreSQL query
const result = await client.query(
  'SELECT * FROM documents WHERE cs_ste_vec_v2(metadata_encrypted) @> $1',
  [term.data[0]]
)
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
const selectorTerm = await protectClient.encryptQuery('$.user.email', {
  column: documents.metadata,
  table: documents,
  queryType: 'steVecSelector',
})

// Explicit steVecTerm
const containTerm = await protectClient.encryptQuery({ role: 'admin' }, {
  column: documents.metadata,
  table: documents,
  queryType: 'steVecTerm',
})
```

> [!NOTE]
> When a column uses `searchableJson()`, string values passed to `encryptQuery` are treated as JSONPath selectors.
> If you need to query for a JSON string value itself, wrap it in an object or array:
>
> ```typescript
> // To find documents where a field contains the string "admin"
> const term = await protectClient.encryptQuery(['admin'], {
>   column: documents.metadata,
>   table: documents,
>   queryType: 'steVecTerm',  // Explicit for clarity
> })
> ```

### Exact matching

Use `.equality()` when you need to find exact matches:

```typescript
// Find user with specific email
const term = await protectClient.createSearchTerms([{
  value: 'user@example.com',
  column: schema.email,
  table: schema,
  returnType: 'composite-literal' // Required for PostgreSQL composite types
}])

if (term.failure) {
  // Handle the error
}

// SQL query
const result = await client.query(
  'SELECT * FROM users WHERE email_encrypted = $1',
  [term.data[0]]
)
```

### Free text search

Use `.freeTextSearch()` for text-based searches:

```typescript
// Search for users with emails containing "example"
const term = await protectClient.createSearchTerms([{
  value: 'example',
  column: schema.email,
  table: schema,
  returnType: 'composite-literal'
}])

if (term.failure) {
  // Handle the error
}

// SQL query
const result = await client.query(
  'SELECT * FROM users WHERE email_encrypted LIKE $1',
  [term.data[0]]
)
```

### Sorting and range queries

Use `.orderAndRange()` for sorting and range operations:

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
import { protect, csTable, csColumn } from '@cipherstash/protect'

const schema = csTable('users', {
  email: csColumn('email_encrypted')
    .equality()
    .freeTextSearch()
    .orderAndRange()
})

const client = new Client({
  // your connection details
})

const protectClient = await protect({
  schemas: [schema]
})

// Insert encrypted data
const encryptedData = await protectClient.encryptModel({
  email: 'user@example.com'
}, schema)

if (encryptedData.failure) {
  // Handle the error
}

await client.query(
  'INSERT INTO users (email_encrypted) VALUES ($1::jsonb)',
  [encryptedData.data.email_encrypted]
)

// Search encrypted data
const searchTerm = await protectClient.createSearchTerms([{
  value: 'example.com',
  column: schema.email,
  table: schema,
  returnType: 'composite-literal'
}])

if (searchTerm.failure) {
  // Handle the error
}

const result = await client.query(
  'SELECT * FROM users WHERE email_encrypted LIKE $1',
  [searchTerm.data[0]]
)

// Decrypt results
const decryptedData = await protectClient.bulkDecryptModels(result.rows)
```

### Using Supabase SDK

For Supabase users, we provide a specific implementation guide. [Read more about using Protect.js with Supabase](./supabase-sdk.md).

## Best practices

1. **Schema Design**
   - Choose the right search capabilities for each field:
     - Use `.equality()` for exact matches (most efficient)
     - Use `.freeTextSearch()` for text-based searches (more expensive)
     - Use `.orderAndRange()` for numerical data and sorting (most expensive)
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
   - Always check for failures with any Protect.js method
   - Handle encryption errors aggressively
   - Handle decryption errors gracefully

## Performance optimization

TODO: make docs for creating Postgres Indexes on columns that require searches. At the moment EQL v2 doesn't support creating indexes while also using the out-of-the-box operator and operator families. The solution is to create an index using the EQL functions and then using the EQL functions directly in your SQL statments, which isn't the best experience.

### Didn't find what you wanted?

[Click here to let us know what was missing from our docs.](https://github.com/cipherstash/protectjs/issues/new?template=docs-feedback.yml&title=[Docs:]%20Feedback%20on%searchable-encryption-postgres.md)
