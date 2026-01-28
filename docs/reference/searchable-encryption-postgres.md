# Searchable encryption with Protect.js and PostgreSQL

This reference guide outlines the different query patterns you can use to search encrypted data with Protect.js.

## Table of contents

- [Prerequisites](#prerequisites)
- [What is EQL?](#what-is-eql)
- [Setting up your schema](#setting-up-your-schema)
- [Deprecated Functions](#deprecated-functions)
- [Unified Query Encryption API](#unified-query-encryption-api)
- [JSON Search](#json-search)
  - [Creating JSON Search Terms](#creating-json-search-terms)
  - [Using JSON Search Terms in PostgreSQL](#using-json-search-terms-in-postgresql)
- [Search capabilities](#search-capabilities)
  - [Exact matching](#exact-matching)
  - [Free text search](#free-text-search)
  - [Sorting and range queries](#sorting-and-range-queries)
- [Implementation examples](#implementation-examples)
  - [Using Raw PostgreSQL Client (pg)](#using-raw-postgresql-client-pg)
  - [Using Supabase SDK](#using-supabase-sdk)
- [Best practices](#best-practices)

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
    .orderAndRange()   // Only sorting and range queries
})
```

## Deprecated Functions

> [!WARNING]
> The `createSearchTerms` and `createQuerySearchTerms` functions are deprecated and will be removed in v2.0. Use the unified `encryptQuery` function instead. See [Unified Query Encryption API](#unified-query-encryption-api).

### `createSearchTerms` (deprecated)

The `createSearchTerms` function was the original API for creating search terms. It has been superseded by `encryptQuery`.

```typescript
// DEPRECATED - use encryptQuery instead
const term = await protectClient.createSearchTerms([{
  value: 'user@example.com',
  column: schema.email,
  table: schema,
  returnType: 'composite-literal'
}])

// NEW - use encryptQuery with queryType
const term = await protectClient.encryptQuery([{
  value: 'user@example.com',
  column: schema.email,
  table: schema,
  queryType: 'equality',
  returnType: 'composite-literal'
}])
```

### `createQuerySearchTerms` (deprecated)

The `createQuerySearchTerms` function provided explicit index type control. It has been superseded by `encryptQuery`.

```typescript
// DEPRECATED - use encryptQuery instead
const term = await protectClient.createQuerySearchTerms([{
  value: 'user@example.com',
  column: schema.email,
  table: schema,
  indexType: 'unique'
}])

// NEW - similar API with encryptQuery
const term = await protectClient.encryptQuery([{
  value: 'user@example.com',
  column: schema.email,
  table: schema,
  queryType: 'equality'
}])
```

See [Migration from Deprecated Functions](#migration-from-deprecated-functions) for a complete migration guide.

## Unified Query Encryption API

The `encryptQuery` function handles both single values and batch operations:

### Single Value

```typescript
// Encrypt a single value with explicit query type
const term = await protectClient.encryptQuery('admin@example.com', {
  column: usersSchema.email,
  table: usersSchema,
  queryType: 'equality',
})

if (term.failure) {
  // Handle the error
}

// Use the encrypted term in your query
console.log(term.data) // encrypted search term
```

### Batch Operations

```typescript
// Encrypt multiple terms in one call
const terms = await protectClient.encryptQuery([
  // Scalar term with explicit query type
  { value: 'admin@example.com', column: users.email, table: users, queryType: 'equality' },

  // JSON path query (ste_vec implicit)
  { path: 'user.email', value: 'test@example.com', column: jsonSchema.metadata, table: jsonSchema },

  // JSON containment query (ste_vec implicit)
  { contains: { role: 'admin' }, column: jsonSchema.metadata, table: jsonSchema },
])

if (terms.failure) {
  // Handle the error
}

// Access encrypted terms
console.log(terms.data) // array of encrypted terms
```

### Migration from Deprecated Functions

| Old API | New API |
|---------|---------|
| `createSearchTerms([{ value, column, table }])` | `encryptQuery([{ value, column, table, queryType }])` with `ScalarQueryTerm` |
| `createQuerySearchTerms([{ value, column, table, indexType }])` | `encryptQuery([{ value, column, table, queryType }])` with `ScalarQueryTerm` |
| `createSearchTerms([{ path, value, column, table }])` | `encryptQuery([{ path, value, column, table }])` with `JsonPathQueryTerm` |
| `createSearchTerms([{ containmentType: 'contains', value, ... }])` | `encryptQuery([{ contains: {...}, column, table }])` with `JsonContainsQueryTerm` |
| `createSearchTerms([{ containmentType: 'contained_by', value, ... }])` | `encryptQuery([{ containedBy: {...}, column, table }])` with `JsonContainedByQueryTerm` |

> [!NOTE]
> Both `createSearchTerms` and `createQuerySearchTerms` are deprecated. Use `encryptQuery` for all query encryption needs.

### Query Term Types

The `encryptQuery` function accepts different query term types. These types are exported from `@cipherstash/protect`:

```typescript
import {
  // Query term types
  type QueryTerm,
  type ScalarQueryTerm,
  type JsonPathQueryTerm,
  type JsonContainsQueryTerm,
  type JsonContainedByQueryTerm,
  // Type guards for runtime type checking
  isScalarQueryTerm,
  isJsonPathQueryTerm,
  isJsonContainsQueryTerm,
  isJsonContainedByQueryTerm,
} from '@cipherstash/protect'
```

**Type definitions:**

| Type | Properties | Use Case |
|------|------------|----------|
| `ScalarQueryTerm` | `value`, `column`, `table`, `queryType`, `queryOp?` | Scalar value queries (equality, freeTextSearch, orderAndRange) |
| `JsonPathQueryTerm` | `path`, `value?`, `column`, `table` | JSON path access queries |
| `JsonContainsQueryTerm` | `contains`, `column`, `table` | JSON containment (`@>`) queries |
| `JsonContainedByQueryTerm` | `containedBy`, `column`, `table` | JSON contained-by (`<@`) queries |

**Type guards:**

Type guards are useful when working with mixed query results:

```typescript
const terms = await protectClient.encryptQuery([
  { value: 'user@example.com', column: schema.email, table: schema, queryType: 'equality' },
  { contains: { role: 'admin' }, column: schema.metadata, table: schema },
])

if (terms.failure) {
  // Handle error
}

for (const term of terms.data) {
  if (isScalarQueryTerm(term)) {
    // Handle scalar term
  } else if (isJsonContainsQueryTerm(term)) {
    // Handle containment term - access term.sv
  }
}
```

## JSON Search

For querying encrypted JSON columns configured with `.searchableJson()`, use the `encryptQuery` function with JSON-specific term types.

### Creating JSON Search Terms

#### Path Queries

Used for finding records where a specific path in the JSON equals a value.

| Property | Description |
|----------|-------------|
| `path` | The path to the field (e.g., `'user.email'` or `['user', 'email']`) |
| `value` | The value to match at that path |
| `column` | The column definition from the schema |
| `table` | The table definition |

```typescript
// Path query - SQL equivalent: WHERE metadata->'user'->>'email' = 'alice@example.com'
const pathTerms = await protectClient.encryptQuery([{
  path: 'user.email',
  value: 'alice@example.com',
  column: schema.metadata,
  table: schema
}])

if (pathTerms.failure) {
  // Handle the error
}
```

#### Containment Queries

Used for finding records where the JSON column contains a specific JSON structure (subset).

**Contains Query (`@>` operator)** - Find records where JSON contains the specified structure:

| Property | Description |
|----------|-------------|
| `contains` | The JSON object/array structure to search for |
| `column` | The column definition from the schema |
| `table` | The table definition |

```typescript
// Containment query - SQL equivalent: WHERE metadata @> '{"roles": ["admin"]}'
const containmentTerms = await protectClient.encryptQuery([{
  contains: { roles: ['admin'] },
  column: schema.metadata,
  table: schema
}])

if (containmentTerms.failure) {
  // Handle the error
}
```

**Contained-By Query (`<@` operator)** - Find records where JSON is contained by the specified structure:

| Property | Description |
|----------|-------------|
| `containedBy` | The JSON superset to check against |
| `column` | The column definition from the schema |
| `table` | The table definition |

```typescript
// Contained-by query - SQL equivalent: WHERE metadata <@ '{"permissions": ["read", "write", "admin"]}'
const containedByTerms = await protectClient.encryptQuery([{
  containedBy: { permissions: ['read', 'write', 'admin'] },
  column: schema.metadata,
  table: schema
}])

if (containedByTerms.failure) {
  // Handle the error
}
```

### Using JSON Search Terms in PostgreSQL

When searching encrypted JSON columns, you use the `ste_vec` index type which supports both path access and containment operators.

#### Path Search (Access Operator)

Equivalent to `data->'path'->>'field' = 'value'`.

```typescript
const terms = await protectClient.encryptQuery([{
  path: 'user.email',
  value: 'alice@example.com',
  column: schema.metadata,
  table: schema
}])

if (terms.failure) {
  // Handle the error
}

// The generated term contains a selector and the encrypted term
const term = terms.data[0]

// EQL function equivalent to: metadata->'user'->>'email' = 'alice@example.com'
const query = `
  SELECT * FROM users
  WHERE eql_ste_vec_u64_8_128_access(metadata, $1) = $2
`
// Bind parameters: [term.s, term.c]
```

#### Containment Search

Equivalent to `data @> '{"key": "value"}'`.

```typescript
const terms = await protectClient.encryptQuery([{
  contains: { tags: ['premium'] },
  column: schema.metadata,
  table: schema
}])

if (terms.failure) {
  // Handle the error
}

// Containment terms return a vector of terms to match
const termVector = terms.data[0].sv

// EQL function equivalent to: metadata @> '{"tags": ["premium"]}'
const query = `
  SELECT * FROM users
  WHERE eql_ste_vec_u64_8_128_contains(metadata, $1)
`
// Bind parameter: [JSON.stringify(termVector)]
```

## Search capabilities

### Exact matching

Use `.equality()` when you need to find exact matches:

```typescript
// Find user with specific email
const term = await protectClient.encryptQuery([{
  value: 'user@example.com',
  column: schema.email,
  table: schema,
  queryType: 'equality',  // Use 'equality' for exact match queries
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
const term = await protectClient.encryptQuery([{
  value: 'example',
  column: schema.email,
  table: schema,
  queryType: 'freeTextSearch',  // Use 'freeTextSearch' for text search queries
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
const searchTerm = await protectClient.encryptQuery([{
  value: 'example.com',
  column: schema.email,
  table: schema,
  queryType: 'freeTextSearch',  // Use 'freeTextSearch' for text search
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

> [!NOTE]
> Documentation for creating PostgreSQL indexes on encrypted columns is coming soon. Currently, EQL v2 requires using EQL functions directly in SQL statements when creating indexes.

### Didn't find what you wanted?

[Click here to let us know what was missing from our docs.](https://github.com/cipherstash/protectjs/issues/new?template=docs-feedback.yml&title=[Docs:]%20Feedback%20on%searchable-encryption-postgres.md)
