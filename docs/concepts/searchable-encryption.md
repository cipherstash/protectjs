# Searchable encryption

Protect.js supports searching encrypted data, which enables trusted data access so that you can:

1. Prove to your customers that you can track exactly what data is being accessed in your application.
2. Provide evidence for compliance requirements, such as [SOC 2](https://cipherstash.com/compliance/soc2) and [BDSG](https://cipherstash.com/compliance/bdsg).

## Table of contents

- [What is searchable encryption?](#what-is-searchable-encryption)
- [Searching on encrypted data](#searching-on-encrypted-data)
  - [Using Encrypt Query Language (EQL)](#using-encrypt-query-language-eql)
- [How fast is CipherStash's searchable encryption?](#how-fast-is-cipherstashs-searchable-encryption)
- [How does searchable encryption help?](#how-does-searchable-encryption-help)
- [Bringing everything together](#bringing-everything-together)

## What is searchable encryption? 

The best way to describe searchable encryption is with an example.
Let's say you have a table of users in your database, and you want to search for a user by their email address:

```sql
# SELECT * FROM users WHERE email = 'alice.johnson@example.com';
 id |      name      |           email
----+----------------+----------------------------
  1 | Alice Johnson  | alice.johnson@example.com
```

Whether you executed this query directly in the database, or through an application ORM, you'd expect the result to be the same.

**But what if the email address is encrypted before it's stored in the database?**

Executing the following query will return all the rows in the table with the encrypted email address:

```sql
# SELECT * FROM users;
 id |      name      |           email
----+----------------+----------------------------
  1 | Alice Johnson  | mBbKmsMMkbKBSN...
  2 | Jane Doe       | s1THy_NfQdN892...
  3 | Bob Smith      | 892!dercydsd0s...
```

Now, what's the issue if you execute the equality query with this data set? 

```sql
# SELECT * FROM users WHERE email = 'alice.johnson@example.com';
 id |      name      |           email
----+----------------+----------------------------
```

There would be no results returned, because `alice.johnson@example.com` does not equal `mBbKmsMMkbKBSN...`!

## Searching on encrypted data

There is prior art for this, and it's called [Homomorphic Encryption](https://en.wikipedia.org/wiki/Homomorphic_encryption), and is defined as:

> "a form of encryption that allows computations to be performed on encrypted data without first having to decrypt it"

The issue with homomorphic encryption isn't around the functionality, but rather performance in a modern application use case.

CipherStash's approach to searchable encryption solves the performance problem without sacrificing security, usability, or functionality.

### Using Encrypt Query Language (EQL)

CipherStash uses [EQL](https://github.com/cipherstash/encrypt-query-language) to perform queries on encrypted data, and Protect.js makes it easy to use EQL with any TypeScipt application.

```ts
// 1) Encrypt the search term
const searchTerm = 'alice.johnson@example.com'

const encryptedParam = await protectClient.encryptQuery([{
  value: searchTerm,
  table: protectedUsers,        // Reference to the Protect table schema
  column: protectedUsers.email, // Your Protect column definition
  queryType: 'equality',        // Use 'equality' for exact match queries
}])

if (encryptedParam.failure) {
  // Handle the failure
  throw new Error(encryptedParam.failure.message)
}

// 2) Build an equality query noting that EQL must be installed in order for the operation to work successfully
const equalitySQL = `
  SELECT email
  FROM users
  WHERE email = $1
`

// 3) Execute the query, passing in the encrypted search term
//    (client is an arbitrary Postgres client)
const result = await client.query(equalitySQL, [encryptedParam.data[0]])
```

Using the above approach, Protect.js is generating the EQL payloads and which means you never have to drop down to writing complex SQL queries.

So does this solve the original problem of searching on encrypted data?

```sql
# SELECT * FROM users WHERE WHERE cs_unique_v2(email) = cs_unique_v2(eql_payload_created_by_protect);
 id |      name      |           email
----+----------------+----------------------------
  1 | Alice Johnson  | mBbKmsMMkbKBSN...
```

The answer is yes! And you can use Protect.js to [decrypt the results in your application](../../README.md#decrypting-data).

## How fast is CipherStash's searchable encryption?

Based on some [benchmarks](https://github.com/cipherstash/tfhe-ore-bench?tab=readme-ov-file#results) CipherStash's approach is ***410,000x faster*** than homomorphic encryption:

| Operation          | Homomorphic | CipherStash | Speedup |
|--------------------|----------------|---------------|-------------|
| **Encrypt**        | 1.97 ms        | 48 µs         | ~41×        |
| **a == b**         | 111 ms         | 238 ns        | ~466 000×    |
| **a > b**          | 192 ms         | 238 ns        | ~807 000×    |
| **a < b**          | 190 ms         | 240 ns        | ~792 000×    |
| **a >= a**         | 44 ms          | 221 ns        | ~199 000×    |
| **a <= a**         | 44 ms          | 226 ns        | ~195 000×    |

## How does searchable encryption help?

Every single decryption event is logged in CipherStash [ZeroKMS](https://cipherstash.com/products/zerokms), giving you an audit trail of data access events to help you prove compliance with your data protection policies.

With searchable encryption, you can:

- Prove to your customers that you can track exactly what data is being accessed in your application.
- Provide evidence for compliance requirements, such as [SOC2](https://cipherstash.com/compliance/soc2) and [BDSG](https://cipherstash.com/compliance/bdsg).

## Bringing everything together 

With searchable encryption:

- Data can be encrypted, stored, and searched in your existing PostgreSQL database.
- Encrypted data can be searched using equality, free text search, range queries, and JSON path/containment queries.
- Data remains encrypted, and will be decrypted using the Protect.js library in your application.
- Queries are blazing fast, and won't slow down your application experience.
- Every decryption event is logged, giving you an audit trail of data access events.

Read more about the [implementation details](../reference/searchable-encryption-postgres.md) to get started.

---

### Didn't find what you wanted?

[Click here to let us know what was missing from our docs.](https://github.com/cipherstash/protectjs/issues/new?template=docs-feedback.yml&title=[Docs:]%20Feedback%20on%20searchable-encryption.md)
