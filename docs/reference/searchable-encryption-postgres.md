# Searchable encryption with Protect.js and PostgreSQL

This reference guide outlines the different query patterns you can use to search encrypted data with Protect.js.

## Table of contents

- [Before you start](#before-you-start)
- [Equality query](#equality-query)
- [Free-text search](#free-text-search)
- [Sorting data](#sorting-data)
- [Range queries](#range-queries)

## Before you start

You will have needed to [define your schema and initialized the protect client](../../README.md#defining-your-schema), and have [installed the EQL custom types and functions](../../README.md#searchable-encryption-in-postgresql).

The below examples assume you have a schema defined:

```ts
import { csTable, csColumn } from '@cipherstash/protect'

export const protectedUsers = csTable('users', {
  email: csColumn('email').equality().freeTextSearch().orderAndRange(),
})
```

> [!TIP]
> To see an example using the [Drizzle ORM](https://github.com/drizzle-team/drizzle-orm) see the example [here](../../apps/drizzle/src/select.ts).

## Equality query

For an equality query, use the `cs_unique_v1` function.

```ts
// 1) Encrypt the search term
const searchTerm = 'alice@example.com'

const encryptedParam = await protectClient.encrypt(searchTerm, {
  column: protectedUsers.email, // Your Protect column definition
  table: protectedUsers,        // Reference to the table schema
})

if (encryptedParam.failure) {
  // Handle the failure
}

// 2) Build an equality query (cs_unique_v1)
const equalitySQL = `
  SELECT email
  FROM users
  WHERE cs_unique_v1($1) = cs_unique_v1($2)
`

// Use your flavor or ORM to execute the query. `client` is a PostgreSQL client.
const result = await client.query(equalitySQL, [ protectedUser.email.getName(), encryptedParam.data ])
```

**Explanation:**

`WHERE cs_unique_v1($1) = cs_unique_v1($2)`

The first `$1` is the Postgres column name, and the second `$2` is the encrypted search term. 

## Free-text search

For partial matches or full-text searches, use the `cs_match_v1` function.

```ts
// Suppose you're searching for emails containing "alice"
const searchTerm = 'alice'

const encryptedParam = await protectClient.encrypt(searchTerm, {
  column: protectedUsers.email,
  table: protectedUsers,
})

if (encryptedParam.failure) {
  // Handle the failure
}

// Build and execute a "match" query (cs_match_v1)
const matchSQL = `
  SELECT email
  FROM users
  WHERE cs_match_v1($1) @> cs_match_v1($2)
`

// Use your flavor or ORM to execute the query. `client` is a PostgreSQL client.
const result = await client.query(matchSQL, [ protectedUser.email.getName(), encryptedParam.data ])
```

**Explanation:**

`WHERE cs_match_v1($1) @> cs_match_v1($2)`

The first `$1` is the Postgres column name, and the second `$2` is the encrypted search term.

## Sorting data

For `order by` queries, use the `cs_ore_64_8_v1` function.

```ts
// Suppose you're sorting by email address
const orderSQL = `
  SELECT email
  FROM users
  ORDER BY cs_ore_64_8_v1(email) ASC
`
const orderedResult = await client.query(orderSQL)

// Use your flavor or ORM to execute the query. `client` is a PostgreSQL client.
const result = await client.query(orderSQL)
```

### Explanation

The `cs_ore_64_8_v1` function doesn't require any encrypted parameters, but rather the name of the Postgres column you want to sort by.

## Range queries

TODO: flesh this out (sorry it's not done yet!)

---

### Didn't find what you wanted?

[Click here to let us know what was missing from our docs.](https://github.com/cipherstash/protectjs/issues/new?template=docs-feedback.yml&title=[Docs:]%20Feedback%20on%searchable-encryption-postgres.md)
