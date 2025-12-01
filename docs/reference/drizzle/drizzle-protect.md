# Drizzle + Protect.js Query Examples
## Manual Encryption Pattern (Verbose)

This page demonstrates how to perform queries on encrypted data using **Drizzle ORM** with **explicit Protect.js encryption calls** for full control.

**Pattern:** Manually encrypt query values before passing them to standard Drizzle operators.

**How it works:**
- Explicitly call `protectClient.encrypt()` for each query value
- Use standard Drizzle operators (`eq()`, `gte()`, `lte()`) with pre-encrypted values
- Manually decrypt results using `protectClient.bulkDecryptModels()`

This verbose pattern demonstrates the low-level encryption workflow. For cleaner syntax, see the [protect operators pattern](/drizzle).

## Overview

This example uses a `transactions` table with the following encrypted fields:

- **`account`**: Encrypted with equality search support
- **`amount`**: Encrypted with range query support (greater than, less than)
- **`description`**: Encrypted with full-text search support
- **`createdAt`**: Encrypted timestamp with range query support

**Key differences from protect operators pattern:**

1. **Manual encryption** of query parameters using `protectClient.encrypt()`
2. **Standard Drizzle operators** (`eq()`, `gte()`, `lte()`) with pre-encrypted values
3. **Manual decryption** of results using `protectClient.bulkDecryptModels()`

This gives you explicit visibility into the encryption/decryption workflow at the cost of more verbose code.

## When to Use This Pattern

✅ **Use the manual encryption pattern when:**
- You need fine-grained control over encryption timing
- You want to understand how Protect.js works internally
- You're building custom abstractions or utilities
- You need to cache encrypted values for performance
- You're implementing batch operations with encryption
- You want to inspect encrypted values for debugging

**Recommended:** Most applications should use the [protect operators pattern](/drizzle) for cleaner syntax.

## Setup

Click the **▶ Run** button on any code example below to execute it against a live database and see real results.

---

## Select

### Select all

The simplest query - retrieve all transactions from the database. Note that results are still encrypted and need manual decryption.

```ts:run
const results = await db.select().from(transactions)
const decrypted = await protectClient.bulkDecryptModels(results)
return decrypted.data
```

### Select specific columns

Select only the columns you need, then decrypt the results.

```ts:run
const results = await db.select({
  id: transactions.id,
  amount: transactions.amount,
  createdAt: transactions.createdAt
}).from(transactions)
const decrypted = await protectClient.bulkDecryptModels(results)
return decrypted.data
```

### Limit results

Retrieve only the first 5 transactions with manual decryption.

```ts:run
const results = await db.select().from(transactions).limit(5)
const decrypted = await protectClient.bulkDecryptModels(results)
return decrypted.data
```

### Pagination with offset

Skip the first 5 transactions and get the next 5.

```ts:run
const results = await db.select()
  .from(transactions)
  .limit(5)
  .offset(5)
const decrypted = await protectClient.bulkDecryptModels(results)
return decrypted.data
```

---

## Equality operations with encrypted data

### Equality with encrypted number

Find transactions with a specific amount. First encrypt the search value, then use regular Drizzle `eq()`.

```ts:run
// Encrypt the search value
const encryptedAmount = await protectClient.encrypt(800.00, {
  table: protectTransactions,
  column: protectTransactions.amount
})

// Query with regular Drizzle eq()
const results = await db.select()
  .from(transactions)
  .where(eq(transactions.amount, encryptedAmount.data))

// Manually decrypt results
const decrypted = await protectClient.bulkDecryptModels(results)
return decrypted.data
```

### Equality with encrypted string

Find transactions with a specific description using manual encryption.

```ts:run
// Encrypt the search value
const encryptedDesc = await protectClient.encrypt('Salary deposit', {
  table: protectTransactions,
  column: protectTransactions.description
})

// Query with regular Drizzle eq()
const results = await db.select()
  .from(transactions)
  .where(eq(transactions.description, encryptedDesc.data))

// Manually decrypt results
const decrypted = await protectClient.bulkDecryptModels(results)
return decrypted.data
```

### Equality with multiple encrypted columns

Find transactions matching multiple encrypted fields using manual encryption.

```ts:run
// Encrypt both search values
const encryptedAccount = await protectClient.encrypt('1234567890', {
  table: protectTransactions,
  column: protectTransactions.account_number
})
const encryptedAmount = await protectClient.encrypt(800.00, {
  table: protectTransactions,
  column: protectTransactions.amount
})

// Query with regular Drizzle operators
const results = await db.select()
  .from(transactions)
  .where(
    and(
      eq(transactions.account, encryptedAccount.data),
      eq(transactions.amount, encryptedAmount.data)
    )
  )

// Manually decrypt results
const decrypted = await protectClient.bulkDecryptModels(results)
return decrypted.data
```

---

## Comparison operations with encrypted data

### Less than or equal with encrypted number

Find transactions with amounts less than or equal to $150 using manual encryption.

```ts:run
// Encrypt the comparison value
const encryptedAmount = await protectClient.encrypt(150.00, {
  table: protectTransactions,
  column: protectTransactions.amount
})

// Query with regular Drizzle lte()
const results = await db.select()
  .from(transactions)
  .where(lte(transactions.amount, encryptedAmount.data))

// Manually decrypt results
const decrypted = await protectClient.bulkDecryptModels(results)
return decrypted.data
```

### Greater than or equal with encrypted number

Find transactions with amounts greater than or equal to $1250.

```ts:run
// Encrypt the comparison value
const encryptedAmount = await protectClient.encrypt(1250.00, {
  table: protectTransactions,
  column: protectTransactions.amount
})

// Query with regular Drizzle gte()
const results = await db.select()
  .from(transactions)
  .where(gte(transactions.amount, encryptedAmount.data))

// Manually decrypt results
const decrypted = await protectClient.bulkDecryptModels(results)
return decrypted.data
```

---

## Text search with encrypted data

### LIKE with encrypted string

Search for transactions with "gym" in the description. With the manual encryption pattern, you must encrypt the search pattern and cast it to the encrypted type.

**Note:** Unlike the protect operators pattern which provides `protect.like()` wrapper, the manual encryption pattern requires using Drizzle's `sql` template with manual type casting. This gives you full control over the encryption and query construction at the cost of more verbose syntax.

```ts:run
// Encrypt the search pattern
const encryptedPattern = await protectClient.encrypt('%gym%', {
  table: protectTransactions,
  column: protectTransactions.description
})

// Cast encrypted pattern to jsonb then to eql_v2_encrypted type
const results = await db.select()
  .from(transactions)
  .where(sql`${transactions.description} ilike ${JSON.stringify(encryptedPattern.data)}::jsonb::eql_v2_encrypted`)

// Manually decrypt results
const decrypted = await protectClient.bulkDecryptModels(results)
return decrypted.data
```

### Combine text search with other operations

Combine text search with manual encryption for other fields. All search values must be encrypted, and text patterns need type casting.

```ts:run
// Encrypt the amount comparison value
const encryptedAmount = await protectClient.encrypt(150.00, {
  table: protectTransactions,
  column: protectTransactions.amount
})

// Encrypt the search pattern for text search
const encryptedPattern = await protectClient.encrypt('%payment%', {
  table: protectTransactions,
  column: protectTransactions.description
})

const results = await db.select()
  .from(transactions)
  .where(
    and(
      gte(transactions.amount, encryptedAmount.data),
      sql`${transactions.description} ilike ${JSON.stringify(encryptedPattern.data)}::jsonb::eql_v2_encrypted`
    )
  )

// Manually decrypt results
const decrypted = await protectClient.bulkDecryptModels(results)
return decrypted.data
```

---

## Range operations with encrypted data

### Range with encrypted number

Find transactions with amounts between $150 and $1250.

```ts:run
// Encrypt both range boundaries
const encryptedMin = await protectClient.encrypt(150.00, {
  table: protectTransactions,
  column: protectTransactions.amount
})
const encryptedMax = await protectClient.encrypt(1250.00, {
  table: protectTransactions,
  column: protectTransactions.amount
})

// Query with regular Drizzle operators
const results = await db.select()
  .from(transactions)
  .where(
    and(
      gte(transactions.amount, encryptedMin.data),
      lte(transactions.amount, encryptedMax.data)
    )
  )

// Manually decrypt results
const decrypted = await protectClient.bulkDecryptModels(results)
return decrypted.data
```

### Range with encrypted date

Find transactions from the past two weeks.

```ts:run
// Use relative dates - transactions are seeded 1-15 days ago
const now = new Date()
const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)

// Encrypt both date boundaries
const encryptedStart = await protectClient.encrypt(twoWeeksAgo.getTime(), {
  table: protectTransactions,
  column: protectTransactions.created_at
})
const encryptedEnd = await protectClient.encrypt(now.getTime(), {
  table: protectTransactions,
  column: protectTransactions.created_at
})

// Query with regular Drizzle operators
const results = await db.select()
  .from(transactions)
  .where(
    and(
      gte(transactions.createdAt, encryptedStart.data),
      lte(transactions.createdAt, encryptedEnd.data)
    )
  )

// Manually decrypt results
const decrypted = await protectClient.bulkDecryptModels(results)
return decrypted.data
```

---

## Order by encrypted data

Protect.js supports ordering on encrypted fields using Order-Revealing Encryption (ORE). This allows the database to sort encrypted values without decrypting them, while preserving the original sort order.

### Order by encrypted number

Sort transactions by amount in descending order (highest first).

```ts:run
const results = await db.select()
  .from(transactions)
  .orderBy(desc(transactions.amount))
  .limit(10)

// Manually decrypt results
const decrypted = await protectClient.bulkDecryptModels(results)
return decrypted.data
```

### Order by encrypted string

Sort transactions by description in alphabetical order.

```ts:run
const results = await db.select()
  .from(transactions)
  .orderBy(asc(transactions.description))
  .limit(10)

// Manually decrypt results
const decrypted = await protectClient.bulkDecryptModels(results)
return decrypted.data
```

### Order by encrypted date

Sort transactions by creation date (most recent first).

```ts:run
const results = await db.select()
  .from(transactions)
  .orderBy(desc(transactions.createdAt))
  .limit(10)

// Manually decrypt results
const decrypted = await protectClient.bulkDecryptModels(results)
return decrypted.data
```

---

## Aggregation operations

### Count all transactions

Get the total number of transactions.

```ts:run
const results = await db.select({ count: sql`count(*)` })
  .from(transactions)

// Manually decrypt result
const decrypted = await protectClient.bulkDecryptModels(results)
return decrypted.data
```

### Count with condition

Count transactions with amounts greater than or equal to $1250.

```ts:run
// Encrypt the search value
const encryptedAmount = await protectClient.encrypt(1250.00, {
  table: protectTransactions,
  column: protectTransactions.amount
})

const results = await db.select({ count: sql`count(*)` })
  .from(transactions)
  .where(gte(transactions.amount, encryptedAmount.data))

// Manually decrypt result
const decrypted = await protectClient.bulkDecryptModels(results)
return decrypted.data
```

### Find one transaction

Get a single transaction by primary key.

```ts:run
const results = await db.select()
  .from(transactions)
  .where(eq(transactions.id, 1))
  .limit(1)

// Manually decrypt result
const decrypted = await protectClient.bulkDecryptModels(results)
return decrypted.data
```

---

## Understanding the manual approach

When using the manual encryption pattern instead of protect operators, you have explicit control over each step:

### Encryption flow

1. **Encrypt search values** using `protectClient.encrypt(plaintext, { table, column })`
2. **Pass encrypted data** to regular Drizzle operators (`eq()`, `gte()`, `ilike()`, etc.)
3. **Execute query** - PostgreSQL searches encrypted data
4. **Decrypt results** using `protectClient.bulkDecryptModels(results)`
5. **Return plaintext** - Results are now readable

### Key differences from protect operators pattern

| Aspect | Protect Operators | Manual Encryption |
|--------|------------------|-------------------|
| Encryption | `protect.eq(col, val)` | `encrypt()` + `eq()` |
| Code | Auto-encrypting operators | Explicit encryption calls |
| Decryption | Handled by executor | Manual with `bulkDecryptModels()` |
| LIKE queries | `protect.like()` | `encrypt()` + `ilike()` |
| Control | High-level | Low-level |
| Use case | Clean syntax | Full control |


### When to use manual encryption

✅ **Use manual encryption when:**
- You need fine-grained control over encryption timing
- You want to understand how Protect.js works internally
- You're building custom abstractions
- You need to cache encrypted values
- You're implementing batch operations
- You want to inspect encrypted values for debugging

✅ **Use protect operators when:**
- You want the simplest developer experience
- You prefer cleaner query syntax
- You're building standard CRUD operations
- You want less boilerplate code
- You need quick development iteration

### What's happening behind the scenes

1. **`protectClient.encrypt()`**: Encrypts plaintext and generates search indexes
2. **Regular Drizzle operators**: Work with encrypted data as if it were normal data
3. **PostgreSQL**: Uses special indexes to search encrypted fields efficiently
4. **`bulkDecryptModels()`**: Batch decrypts all encrypted fields in results
5. **Return**: You get plaintext results

### Key benefits of manual approach

- ✅ **Full control** - See exactly what's encrypted and when
- ✅ **Educational** - Understand searchable encryption deeply
- ✅ **Flexible** - Build custom patterns and optimizations
- ✅ **Debuggable** - Inspect encrypted values at each step
- ✅ **Type safety** - Full TypeScript support

---

## API Reference

### Encryption API

```ts
// Single value encryption
const encrypted = await protectClient.encrypt(plaintext, {
  table: protectTransactions,
  column: protectTransactions.column_name
})

// Use encrypted.data in queries
const results = await db.select()
  .from(transactions)
  .where(eq(transactions.column, encrypted.data))
```

### Decryption API

```ts
// Bulk decrypt query results
const decrypted = await protectClient.bulkDecryptModels(results)

// Use decrypted.data
return decrypted.data
```

### Schema References

```ts
// Drizzle schema (for table/column references)
transactions.id
transactions.account
transactions.amount
transactions.description
transactions.createdAt

// Protect schema (for encryption operations)
protectTransactions.account_number   // Note: snake_case
protectTransactions.amount
protectTransactions.description
protectTransactions.created_at       // Note: snake_case
```

---

## Next steps

- **Compare patterns**: Try the same query with both protect operators and manual encryption
- **Explore the code**: Check out the source code in the repository
- **Try different queries**: Modify the examples above and run them
- **Read the docs**: Visit [CipherStash Protect.js documentation](https://docs.cipherstash.com/)
- **Integrate into your app**: Use these patterns in your own applications

---

## Security note

These examples use **read-only** queries for security. INSERT, UPDATE, and DELETE operations are disabled in this interactive environment.
