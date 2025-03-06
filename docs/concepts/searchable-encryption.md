# Searchable encryption

Protect.js supports searching encrypted data, which enabled trusted data access.

## What does searchable encryption even mean? 

The best way to describe searchable encryption is with an example.
Let's say you have a table of users in your database, and you want to search for a user by their email address.

```sql
SELECT * FROM users WHERE email = 'example@example.com';
```

This is a pretty basic example, and you'd expect it to return something like:

| id | name | email |
| --- | --- | --- |
| 1 | John | example@example.com |

Whether you executed this query directly in the database, or through an application ORM, you'd expect the result to be the same.

**But what if the email address is encrypted before it's stored in the database?**

Executing:

```sql
SELECT * FROM users;
```

Would return something like:

| id | name | email |
| --- | --- | --- |
| 1 | John | mBbKmsMMkbKBSN...
| 2 | Jane | s1THy_NfQN892...
| 3 | Bob | 892!dercyd0s...

The same equality query would return nothing, because `example@example.com` does not equal `mBbKmsMMkbKBSN...`.

## How do you search on encrypted data?

There is prior art for this, and it's called [Homomorphic Encryption](https://en.wikipedia.org/wiki/Homomorphic_encryption), and is defined as:

> "a form of encryption that allows computations to be performed on encrypted data without first having to decrypt it"

The issue with homomorphic encryption isn't around the functionality, but rather performance in a modern application use case.

CipherStash's approach to searchable encryption solves the performance problem without sacrificing security, usability, or functionality.

Based on some [benchmarks](https://github.com/cipherstash/tfhe-ore-bench?tab=readme-ov-file#results) CipherStash's approach is ***410,000x faster*** than homomorphic encryption:

| Operation          | Homomorphic | CipherStash | Speedup |
|--------------------|----------------|---------------|-------------|
| **Encrypt**        | 1.97 ms        | 48 µs         | ~41×        |
| **a == b**         | 111 ms         | 238 ns        | ~466 000×    |
| **a > b**          | 192 ms         | 238 ns        | ~807 000×    |
| **a < b**          | 190 ms         | 240 ns        | ~792 000×    |
| **a >= a**         | 44 ms          | 221 ns        | ~199 000×    |
| **a <= a**         | 44 ms          | 226 ns        | ~195 000×    |

## Bringing it all together

With searchable encryption:

1. Data can be stored in the database encrypted.
2. Encrypted data can be searched using equality, free text search, and range queries.
3. Data remains encrypted, and will be decrypted using the Protect.js library in your application.
4. Queries are blazing fast, and won't slow down your application experience.
5. Every decryption event is logged, giving you an audit trail of data access events to help you prove compliance with your data protection policies.